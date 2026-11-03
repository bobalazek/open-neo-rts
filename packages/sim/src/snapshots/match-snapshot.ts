import { arr, int, str, unknown, validate } from "@open-neo-rts/content";
import { addString, createHasher, digest } from "@open-neo-rts/deterministic";
import { checkpointHash, type Kernel } from "../kernel";
import { type MatchSetup, SIM_VERSION } from "../match";
import { parseScenario, SCENARIO_FORMAT, type Scenario } from ".";
import { restoreCanonicalState } from "./canonical-state";
import { replayScenario } from "./replay";
import { canonicalJson as canonical, strictObject } from "./schema";

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
  // shortcut: imports still verify history; add complete feature validators before directly accepting unverified bytes.
  const replayed = replayScenario(saved.scenario, saved.tick);
  if (replayed.log.some((entry) => entry.source === "input" && entry.result !== "accepted"))
    throw new Error("Snapshot history contains refused external inputs");
  const verified = createMatchSnapshot(replayed, installedSetup);
  const state = ({ scenario: _scenario, checksum: _checksum, ...rest }: MatchSnapshot) => rest;
  if (canonical(state(saved)) !== canonical(state(verified)))
    throw new Error("Snapshot state does not reproduce its input history");
  const restored = restoreCanonicalState(verified, installedSetup);
  if (canonical(createMatchSnapshot(restored, installedSetup)) !== canonical(verified))
    throw new Error("Canonical snapshot state did not restore exactly");
  return restored;
}
