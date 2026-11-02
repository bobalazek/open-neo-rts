import { int, str, unknown, validate } from "@open-neo-rts/content";
import { checkpointHash, type Kernel } from "../kernel";
import { type MatchSetup, SIM_VERSION } from "../match";
import { parseScenario, SCENARIO_FORMAT, type Scenario } from ".";
import { replayScenario, scenarioTicks } from "./replay";
import { strictObject } from "./schema";

export interface MatchRecord {
  format: 1;
  scenario: Scenario;
  tick: number;
  hash: string;
}
const schema = strictObject({
  format: int(1, 1),
  scenario: unknown(),
  tick: int(1, 0x80000000),
  hash: str(/^[0-9a-f]{16}$/),
});

/** A complete local input record; keyframes and migration are separate save/replay work. */
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

/** Re-run from immutable inputs with hosted bots, and require the declared terminal tick/hash. */
export function verifyMatchRecord(value: unknown) {
  const record = parseMatchRecord(value);
  const kernel = replayScenario(record.scenario, record.tick);
  if (kernel.log.some((entry) => entry.source === "input" && entry.result !== "accepted"))
    throw new Error("Match record contains refused external commands");
  const hash = checkpointHash(kernel);
  if (!kernel.victory?.ended || kernel.tick !== record.tick || hash !== record.hash)
    throw new Error("Match record did not reproduce its terminal tick and hash");
  return { tick: kernel.tick, hash, victory: kernel.victory.snapshot() };
}
