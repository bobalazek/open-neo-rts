import { arr, int, opt, str, unknown, validate } from "@open-neo-rts/content";
import { sortCommands } from "../commands";
import { checkpointHash, type Kernel } from "../kernel";
import { type MatchSetup, SIM_VERSION } from "../match";
import { parseScenario, SCENARIO_FORMAT, type Scenario } from ".";
import { REPLAY_KEYFRAME_INTERVAL, type ReplayKeyframe } from "./keyframe";
import { MAX_SNAPSHOT_TICK, parseMatchSnapshot } from "./match-snapshot";
import { scenarioTicks } from "./replay";
import { strictObject } from "./schema";

export type MatchRecord = {
  scenario: Scenario;
  tick: number;
  hash: string;
} & ({ format: 1 } | { format: 2; keyframes: readonly ReplayKeyframe[] });
const schema = strictObject({
  format: int(1, 2),
  scenario: unknown(),
  tick: int(1, 0x80000000),
  hash: str(/^[0-9a-f]{16}$/),
  keyframes: opt(arr(unknown(), 1, 121)),
});

/** Parse transport/checksums only; playback must reproduce every frame and the terminal state. */
export function parseMatchRecord(value: unknown): MatchRecord {
  const issues = validate(schema, value);
  if (issues.length)
    throw new Error(
      `Invalid match record: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  const record = value as MatchRecord;
  const scenario = parseScenario(record.scenario);
  if (scenario.setup.debug || !scenario.setup.normal)
    throw new Error("Match records require a normal match");
  const bots = new Set(scenario.setup.normal.bots?.map((bot) => bot.seat));
  if (scenario.commands.some((command) => bots.has(command.seat)))
    throw new Error("Hosted bot commands must be regenerated, never applied twice");
  scenarioTicks(scenario, { ticks: record.tick });
  if (record.format === 1 && Object.hasOwn(record, "keyframes"))
    throw new Error("Portable keyframes require match record format 2");
  if (record.format === 2) {
    if (
      record.tick > MAX_SNAPSHOT_TICK ||
      !record.keyframes ||
      record.keyframes.length !== Math.floor(record.tick / REPLAY_KEYFRAME_INTERVAL) + 1
    )
      throw new Error("Replay requires every one-minute keyframe within its two-hour limit");
    const commands = sortCommands(scenario.commands);
    for (const [index, frame] of record.keyframes.entries()) {
      if (
        !frame ||
        typeof frame !== "object" ||
        Array.isArray(frame) ||
        Object.hasOwn(frame, "scenario") ||
        frame.tick !== index * REPLAY_KEYFRAME_INTERVAL
      )
        throw new Error("Invalid replay keyframe order or fields");
      parseMatchSnapshot({
        ...frame,
        scenario: {
          ...scenario,
          commands: commands.filter((command) => command.tick < frame.tick),
        },
      });
    }
  }
  return record;
}

export function createMatchRecord(kernel: Kernel, setup: MatchSetup): MatchRecord {
  if (!kernel.victory?.ended || setup.debug || !setup.normal)
    throw new Error("Finish the normal match before exporting its record");
  const scenario = JSON.parse(
    JSON.stringify({
      format: SCENARIO_FORMAT,
      simVersion: SIM_VERSION,
      setup,
      commands: kernel.log
        .filter((entry) => entry.source === "input" && entry.result === "accepted")
        .map((entry) => entry.command),
    }),
  );
  return parseMatchRecord({ format: 1, scenario, tick: kernel.tick, hash: checkpointHash(kernel) });
}
