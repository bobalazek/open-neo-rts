import { arr, int, oneOf, str, unknown, validate } from "@open-neo-rts/content";
import { type Command, REJECTIONS } from "../commands";
import { checkpointHash, type LogEntry } from "../kernel";
import { SIM_VERSION } from "../match";
import { type Checkpoint, parseScenario, type Scenario } from ".";
import { diffWorlds, type StateDifference } from "./diff";
import { type RunOptions, replayScenario, scenarioTicks } from "./replay";
import { strictObject } from "./schema";

export const TRACE_FORMAT = 1;

export interface ScenarioTrace {
  format: typeof TRACE_FORMAT;
  simVersion: typeof SIM_VERSION;
  scenario: Scenario;
  /** Includes tick 0; tick N is the state after N steps. */
  hashes: Checkpoint[];
  events: LogEntry[];
}

/** Browser-safe trace with its effective setup and commands embedded for later replay. */
export function traceScenario(scenario: Scenario, options: RunOptions = {}): ScenarioTrace {
  const ticks = scenarioTicks(scenario, options);
  const effective = {
    ...scenario,
    setup: { ...scenario.setup, seed: options.seed ?? scenario.setup.seed },
  };
  const hashes: Checkpoint[] = [];
  const kernel = replayScenario(effective, ticks, (kernel) => {
    hashes.push({ tick: kernel.tick, hash: checkpointHash(kernel) });
  });
  return {
    format: TRACE_FORMAT,
    simVersion: SIM_VERSION,
    scenario: effective,
    hashes,
    events: kernel.log,
  };
}

const traceSchema = strictObject({
  format: int(TRACE_FORMAT, TRACE_FORMAT),
  simVersion: int(SIM_VERSION, SIM_VERSION),
  scenario: unknown(),
  hashes: arr(strictObject({ tick: int(0, 0x80000000), hash: str(/^[0-9a-f]{16}$/) })),
  events: arr(
    strictObject({
      tick: int(0, 0x7fffffff),
      source: oneOf(["input", "controller"]),
      command: unknown(),
      result: oneOf(["accepted", ...Object.keys(REJECTIONS)]),
    }),
  ),
});

/** Rejects malformed/incompatible files without trusting recorded hashes to represent local replay. */
export function parseTrace(value: unknown): ScenarioTrace {
  const issues = validate(traceSchema, value);
  if (issues.length)
    throw new Error(
      `Invalid trace:\n${issues.map(({ path, message }) => `${path}: ${message}`).join("\n")}`,
    );
  const trace = value as ScenarioTrace;
  parseScenario(trace.scenario);
  if (!trace.hashes.length) throw new Error("Invalid trace: $.hashes must include tick 0");
  for (const [i, hash] of trace.hashes.entries())
    if (hash.tick !== i) throw new Error(`Invalid trace: $.hashes[${i}].tick must be ${i}`);
  const ticks = trace.hashes.length - 1;
  scenarioTicks(trace.scenario, { ticks });
  parseScenario({ ...trace.scenario, commands: trace.events.map((event) => event.command) });
  const commands = [...trace.scenario.commands].sort(
    (a, b) => a.tick - b.tick || a.sequence - b.sequence,
  );
  if (trace.events.length !== commands.length)
    throw new Error("Invalid trace: $.events must contain every scenario command exactly once");
  for (const [i, event] of trace.events.entries()) {
    const command = commands[i];
    if (
      event.source !== "input" ||
      event.tick !== command?.tick ||
      commandKey(event.command as Command) !== commandKey(command)
    )
      throw new Error(`Invalid trace: $.events[${i}] must match its scenario command and tick`);
  }
  return trace;
}

function commandKey(command: Command): string {
  return JSON.stringify([
    command.tick,
    command.seat,
    command.sequence,
    command.type,
    Object.entries(command.payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]);
}

export interface TraceDivergence {
  tick: number;
  hashes: { a: string | null; b: string | null };
  events: { a: LogEntry[]; b: LogEntry[] };
  /** Replay runs on this engine; these can differ from hashes captured on another engine. */
  replayHashes: { a: string; b: string };
  state: StateDifference[];
}

/** First differing or missing tick, with its producing events and canonical local replay diff. */
export function compareTraces(a: ScenarioTrace, b: ScenarioTrace): TraceDivergence | null {
  const length = Math.max(a.hashes.length, b.hashes.length);
  for (let tick = 0; tick < length; tick++) {
    const ah = a.hashes[tick]?.hash ?? null;
    const bh = b.hashes[tick]?.hash ?? null;
    if (ah === bh) continue;
    const left = replayScenario(a.scenario, Math.min(tick, a.hashes.length - 1));
    const right = replayScenario(b.scenario, Math.min(tick, b.hashes.length - 1));
    return {
      tick,
      hashes: { a: ah, b: bh },
      events: {
        a: a.events.filter((event) => event.tick === tick - 1),
        b: b.events.filter((event) => event.tick === tick - 1),
      },
      replayHashes: { a: checkpointHash(left), b: checkpointHash(right) },
      state: diffWorlds(left.world, right.world),
    };
  }
  return null;
}
