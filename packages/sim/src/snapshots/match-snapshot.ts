import { arr, int, str, unknown, validate } from "@open-neo-rts/content";
import { addString, createHasher, digest } from "@open-neo-rts/deterministic";
import { checkpointHash, type Kernel } from "../kernel";
import { type MatchSetup, SIM_VERSION } from "../match";
import { parseScenario, SCENARIO_FORMAT, type Scenario } from ".";
import { replayScenario } from "./replay";
import { strictObject } from "./schema";

export const MATCH_SNAPSHOT_FORMAT = 1;
// First-playable imports are bounded to two hours at 20 ticks/second.
export const MAX_SNAPSHOT_TICK = 2 * 60 * 60 * 20;

export interface MatchSnapshot {
  format: typeof MATCH_SNAPSHOT_FORMAT;
  simVersion: typeof SIM_VERSION;
  scenario: Scenario;
  tick: number;
  hash: string;
  world: string;
  streams: { name: string; a: number; b: number; c: number; d: number }[];
  movement: unknown;
  vision: unknown;
  visibility: unknown;
  bots: unknown;
  checksum: string;
}

/** Sorted plain JSON only, with bounded work before any feature allocates from imported sizes. */
function canonical(value: unknown): string {
  let remaining = 8 * 1024 * 1024;
  let characters = 0;
  const visit = (input: unknown, depth: number): unknown => {
    if (--remaining < 0 || depth > 32) throw new Error("Snapshot exceeds JSON limits");
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isSafeInteger(input)) return input;
    if (typeof input === "string") {
      characters += input.length;
      if (characters > 64 * 1024 * 1024) throw new Error("Snapshot exceeds text limit");
      return input;
    }
    if (typeof input !== "object" || !input) throw new Error("Snapshot requires integer JSON");
    const array = Array.isArray(input);
    if (
      !array &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    )
      throw new Error("Snapshot requires plain JSON objects");
    if (
      Reflect.ownKeys(input).some(
        (key) =>
          typeof key !== "string" ||
          (!(array && key === "length") &&
            !Object.getOwnPropertyDescriptor(input, key)?.enumerable) ||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, "value"),
      )
    )
      throw new Error("Snapshot requires own data properties");
    if (array) {
      if (input.length > remaining || Object.keys(input).length !== input.length)
        throw new Error("Snapshot requires bounded dense arrays");
      return input.map((item) => visit(item, depth + 1));
    }
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, visit((input as Record<string, unknown>)[key], depth + 1)]),
    );
  };
  return JSON.stringify(visit(value, 0));
}

function checksum(value: Omit<MatchSnapshot, "checksum">): string {
  const hasher = createHasher();
  addString(hasher, canonical(value));
  return digest(hasher).hex;
}

const schema = strictObject({
  format: int(MATCH_SNAPSHOT_FORMAT, MATCH_SNAPSHOT_FORMAT),
  simVersion: int(SIM_VERSION, SIM_VERSION),
  scenario: unknown(),
  tick: int(0, MAX_SNAPSHOT_TICK),
  hash: str(/^[0-9a-f]{16}$/),
  world: str(/^(?:[0-9a-f]{2})+$/),
  streams: arr(
    strictObject({
      name: str(/^[a-z][a-z0-9:-]{0,127}$/),
      a: int(0, 0xffffffff),
      b: int(0, 0xffffffff),
      c: int(0, 0xffffffff),
      d: int(0, 0xffffffff),
    }),
    0,
    256,
  ),
  movement: unknown(),
  vision: unknown(),
  visibility: unknown(),
  bots: unknown(),
  checksum: str(/^[0-9a-f]{16}$/),
});

/** A file checksum detects damage; it is not a signature or proof of trusted authorship. */
export function parseMatchSnapshot(value: unknown): MatchSnapshot {
  const plain = JSON.parse(canonical(value));
  if (validate(schema, plain).length) throw new Error("Invalid or incompatible match snapshot");
  const saved = plain as MatchSnapshot;
  const { checksum: expected, ...body } = saved;
  if (saved.world.length > 64 * 1024 * 1024 || checksum(body) !== expected)
    throw new Error("Match snapshot checksum mismatch");
  parseScenario(saved.scenario);
  if (
    saved.scenario.setup.debug ||
    !saved.scenario.setup.normal ||
    saved.scenario.commands.length > 100000 ||
    saved.scenario.commands.some(
      (command) =>
        command.tick >= saved.tick ||
        saved.scenario.setup.normal?.bots?.some((bot) => bot.seat === command.seat),
    )
  )
    throw new Error("Snapshot requires a normal match and its past external inputs");
  if (
    saved.streams.some(
      (entry, index) => index > 0 && entry.name <= (saved.streams[index - 1]?.name ?? ""),
    )
  )
    throw new Error("Invalid snapshot stream order");
  return saved;
}

/** Capture between ticks. Only the authoritative local host may export hidden state. */
export function createMatchSnapshot(kernel: Kernel, setup: MatchSetup): MatchSnapshot {
  if (
    setup.debug ||
    !setup.normal ||
    kernel.controllers.size !== (setup.normal.bots?.length ?? 0) ||
    [...kernel.controllers.keys()].some(
      (seat) => !setup.normal?.bots?.some((bot) => bot.seat === seat),
    )
  )
    throw new Error("Snapshots require serializable normal-match controllers");
  const hash = checkpointHash(kernel);
  const body: Omit<MatchSnapshot, "checksum"> = {
    format: MATCH_SNAPSHOT_FORMAT,
    simVersion: SIM_VERSION,
    scenario: JSON.parse(
      JSON.stringify({
        format: SCENARIO_FORMAT,
        simVersion: SIM_VERSION,
        setup,
        commands: kernel.log
          .filter((entry) => entry.source === "input" && entry.result === "accepted")
          .map((entry) => entry.command),
      }),
    ),
    tick: kernel.tick,
    hash,
    world: Array.from(kernel.world.serialize(), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    ),
    streams: [...kernel.streams]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, words]) => ({
        name,
        a: words.a >>> 0,
        b: words.b >>> 0,
        c: words.c >>> 0,
        d: words.d >>> 0,
      })),
    movement: kernel.movement?.snapshot() ?? null,
    vision: kernel.vision?.serialize() ?? null,
    visibility: kernel.visibility?.serialize() ?? null,
    bots: kernel.bots?.serialize() ?? null,
  };
  return parseMatchSnapshot({ ...body, checksum: checksum(body) });
}

/** Returns a new isolated host only after history and complete captured state agree; never mutates a live match. */
export function restoreMatchSnapshot(value: unknown, installedSetup: MatchSetup): Kernel {
  const saved = parseMatchSnapshot(value);
  // Installed gameplay, map, grants and initialization must match; file-supplied content cannot replace them.
  if (canonical(saved.scenario.setup) !== canonical(installedSetup))
    throw new Error("Snapshot setup does not match installed match");
  // shortcut: imported saves verify their history; replace with complete feature validators before fast seeking.
  const replayed = replayScenario(saved.scenario, saved.tick);
  if (replayed.log.some((entry) => entry.source === "input" && entry.result !== "accepted"))
    throw new Error("Snapshot history contains refused external inputs");
  const verified = createMatchSnapshot(replayed, installedSetup);
  const state = ({ scenario: _scenario, checksum: _checksum, ...rest }: MatchSnapshot) => rest;
  if (canonical(state(saved)) !== canonical(state(verified)))
    throw new Error("Snapshot state does not reproduce its input history");
  return replayed;
}
