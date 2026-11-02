// Match kernel: one World, the tick counter, named PRNG streams, the fixed phase scheduler with
// `register` and `registerController` hooks, command dispatch, the developer event log and checkpoint hashes. Phase 1a.

import {
  addString,
  addU32,
  createHasher,
  createStream,
  digest,
  type Stream,
} from "@open-neo-rts/deterministic";
import {
  type Command,
  type CommandType,
  type Payloads,
  type Rejection,
  SYSTEM_SEAT,
  sortCommands,
  validateCommands,
} from "../commands";
import { type Component, World } from "../ecs";
import type { UnitModes } from "../features/abilities";
import type { BotSeats } from "../features/control/bots";
import type { ForceBanks, ForceExtraction, ForcePower } from "../features/economy";
import type { UnitTransports } from "../features/entities/transport";
import type { CombatEvent } from "../features/events/combat";
import type { TerrainMovement } from "../features/movement/terrain-movement";
import type { MatchStatistics, MatchVictory } from "../features/victory";
import type { TerrainVision, VisibilityMemory } from "../features/vision";
import { copyMatchMap, type MatchMap } from "../match-map";
import type { SeatProjection, SeatSnapshot } from "../projection";

const MAP_SERIALIZATION = Symbol("mapSerialization");
const SETUP_IDENTITY = Symbol("setupIdentity");

/**
 * Tick phases in run order (architecture.md §5). Command handlers run at the start of `ingest` and
 * do their own permission and placement checks; controllers run at the start of `ai`.
 */
export const PHASES = [
  "ingest",
  "validation",
  "control",
  "ai",
  "economy",
  "movement",
  "combat",
  "destruction",
  "victory",
  "snapshot",
] as const;

/** A versioned contract: changing `PHASES` bumps this and the simulation version. */
export const PHASES_VERSION = 1;

/** Ticks between automatic checkpoint hashes. */
export const CHECKPOINT_INTERVAL = 100;

export type Phase = (typeof PHASES)[number];

export type System = (kernel: Kernel) => void;

/** Executes one shape-valid command of its type, or returns why the world refuses it. */
export type Handler<C extends Command = Command> = (
  kernel: Kernel,
  command: C,
) => Rejection | undefined;

/** A feature's hooks. Holds no state: state lives in the kernel's world and streams. */
export interface Feature {
  components?: readonly Component[];
  /** Per phase, in run order. */
  systems?: Partial<Record<Phase, readonly System[]>>;
  /** At most one handler per command type across all features. */
  handlers?: { [T in CommandType]?: Handler<Extract<Command, { type: T }>> };
}

export type ReadonlyWorld = Pick<World, "isAlive" | "has" | "get" | "query">;

export interface ControllerView {
  readonly tick: number;
  /** Copied, permitted observation from the completed previous tick; never a live World. */
  readonly observation: Readonly<SeatSnapshot>;
}

/** A command as a controller issues it; the kernel fills in tick, seat and sequence. */
export type ControllerCommand = {
  [T in CommandType]: {
    type: T;
    payload: {
      [P in keyof Payloads[T]]: P extends "entities" | "builders"
        ? readonly (string | number)[]
        : P extends "entity" | "item"
          ? string | number
          : Payloads[T][P];
    };
  };
}[CommandType];

/** A bot or script driving one seat. Only reads; acts through the commands it returns. */
export type Controller = (view: ControllerView) => readonly ControllerCommand[];

/** One per command, in the developer event log (architecture.md §5). */
export interface LogEntry {
  tick: number;
  source: "controller" | "input";
  /** As received. */
  command: unknown;
  result: "accepted" | Rejection;
}

/** One match's, test's or replay's simulation. Kernels share no state. */
export interface Kernel {
  transport?: UnitTransports;
  unitModes?: UnitModes;
  statistics?: MatchStatistics;
  /** Derived capacity/availability check at the canonical shot handoff. */
  canLaunch?: (definition: number, weapon: number) => boolean;
  /** Canonical temporary EMP state; absent when the catalog has no disable warheads. */
  disabled?: (entity: number) => boolean;
  /** Presentation-only output from the completed tick; never read by gameplay systems. */
  combatEvents?: CombatEvent[];
  /** Authoritative stock balances exist only for initialized normal matches. */
  economy?: ForceBanks;
  /** Completed-structure power capacity and brownout; values live in World. */
  power?: ForcePower;
  extraction?: ForceExtraction;
  /** Map movement owns its routes and incremental search state. */
  movement?: TerrainMovement;
  /** Authoritative sight and explored history; only copied group grids may leave the host. */
  vision?: TerrainVision;
  visibility?: VisibilityMemory;
  observe?: (seat: number) => SeatSnapshot;
  /** Capture completed state after advancing the tick, so scheduled grants match human snapshots. */
  captureObservations?: () => void;
  controllerPayload?: (seat: number, command: ControllerCommand) => unknown;
  observationProjections?: ReadonlyMap<number, SeatProjection>;
  bots?: BotSeats;
  victory?: MatchVictory;
  readonly world: World;
  /** Copied, frozen static map input. Low-level kernel tests may omit a map. */
  readonly map: MatchMap | undefined;
  /** Immutable canonical input, retained privately so debug publication never recopies terrain. */
  readonly [MAP_SERIALIZATION]: string | undefined;
  readonly [SETUP_IDENTITY]: string | undefined;
  /** u32. */
  readonly seed: number;
  readonly debug: boolean;
  /** The tick the next `step` runs: ticks stepped so far. */
  tick: number;
  readonly streams: Map<string, Stream>;
  readonly systems: Record<Phase, System[]>;
  readonly handlers: Map<string, Handler>;
  readonly controllers: Map<number, Controller>;
  /** Controller commands for the next tick, in seat order, then issue order. */
  queued: unknown[];
  // ponytail: keeps every entry of the match; make it a ring buffer or debug-only if memory shows up.
  readonly log: LogEntry[];
  /** Every `CHECKPOINT_INTERVAL` ticks. */
  readonly checkpoints: { tick: number; hash: string }[];
}

export function createKernel(match: {
  seed: number;
  debug: boolean;
  map?: MatchMap;
  setupIdentity?: string;
}): Kernel {
  const { seed, debug } = match;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError(`Match seed must be a u32 integer, got ${seed}`);
  const map = match.map ? copyMatchMap(match.map) : undefined;
  return {
    world: new World(),
    map,
    [MAP_SERIALIZATION]: map && JSON.stringify(map),
    [SETUP_IDENTITY]: match.setupIdentity,
    seed,
    debug,
    tick: 0,
    streams: new Map(),
    systems: Object.fromEntries(PHASES.map((phase) => [phase, []])) as unknown as Record<
      Phase,
      System[]
    >,
    handlers: new Map(),
    controllers: new Map(),
    queued: [],
    log: [],
    checkpoints: [],
  };
}

/**
 * Adds a feature's components, systems and command handlers. Match setup registers features in one
 * fixed order before the first step, since systems in a phase run in registration order.
 */
export function register(kernel: Kernel, feature: Feature): void {
  for (const component of feature.components ?? []) kernel.world.register(component);
  for (const phase of PHASES) kernel.systems[phase].push(...(feature.systems?.[phase] ?? []));
  for (const [type, handler] of Object.entries(feature.handlers ?? {})) {
    if (kernel.handlers.has(type)) throw new Error(`Command type ${type} already has a handler`);
    kernel.handlers.set(type, handler as Handler);
  }
}

/** Drives `seat` with `controller`: called in the `ai` phase, its commands run next tick from that seat. */
export function registerController(kernel: Kernel, seat: number, controller: Controller): void {
  if (seat === SYSTEM_SEAT || kernel.controllers.has(seat))
    throw new Error(`Seat ${seat} is the system seat or already has a controller`);
  kernel.controllers.set(seat, controller);
}

/** The PRNG stream `name` (`combat`, `ai:<seat>`…), created from the match seed on first request. */
export function stream(kernel: Kernel, name: string): Stream {
  let s = kernel.streams.get(name);
  if (!s) {
    s = createStream(kernel.seed, name);
    kernel.streams.set(name, s);
  }
  return s;
}

/**
 * Runs one tick: dispatches last tick's controller commands, then `inputs` (this tick's commands),
 * runs every phase, advances the tick and hashes at checkpoints. Returns one log entry per command,
 * controller commands first, then inputs in input order. Throws on an input for another tick: the
 * caller picks commands by target tick, so that is a bug; discard the kernel.
 */
export function step(kernel: Kernel, inputs: readonly unknown[]): LogEntry[] {
  if (kernel.victory?.ended) {
    const entries = dispatch(kernel, inputs, "input");
    kernel.log.push(...entries);
    return entries;
  }
  const queued = kernel.queued;
  kernel.queued = [];
  const entries: LogEntry[] = [];
  for (const phase of PHASES) {
    if (phase === "ingest")
      entries.push(...dispatch(kernel, queued, "controller"), ...dispatch(kernel, inputs, "input"));
    if (phase === "ai") queue(kernel);
    for (const system of kernel.systems[phase]) system(kernel);
  }
  kernel.log.push(...entries);
  kernel.tick++;
  kernel.captureObservations?.();
  if (kernel.tick % CHECKPOINT_INTERVAL === 0 || kernel.victory?.ended)
    kernel.checkpoints.push({ tick: kernel.tick, hash: checkpointHash(kernel) });
  return entries;
}

/**
 * State hash as 16 hex characters: the tick; the stream count, then per stream in name order its
 * name and sfc32 words a, b, c, d; the world's serialized byte length, then those bytes as
 * little-endian words, zero-padded; then the canonical static map when present.
 */
export function checkpointHash(kernel: Kernel): string {
  const h = createHasher();
  addU32(h, kernel.tick);
  const names = [...kernel.streams.keys()].sort(); // by UTF-16 code unit
  addU32(h, names.length);
  for (const name of names) {
    const { a, b, c, d } = kernel.streams.get(name) as Stream;
    addString(h, name);
    for (const word of [a, b, c, d]) addU32(h, word);
  }
  const bytes = kernel.world.serialize();
  addU32(h, bytes.length);
  for (let i = 0; i < bytes.length; i += 4)
    addU32(
      h,
      (bytes[i] ?? 0) |
        ((bytes[i + 1] ?? 0) << 8) |
        ((bytes[i + 2] ?? 0) << 16) |
        ((bytes[i + 3] ?? 0) << 24),
    );
  const map = kernel[MAP_SERIALIZATION];
  if (map !== undefined) addString(h, map);
  if (kernel[SETUP_IDENTITY] !== undefined) addString(h, kernel[SETUP_IDENTITY]);
  kernel.movement?.hashInto(h);
  kernel.vision?.hashInto(h);
  kernel.visibility?.hashInto(h);
  kernel.bots?.hashInto(h);
  return digest(h).hex;
}

/** Validates `inputs`, then hands each accepted command to its type's handler in canonical order. */
function dispatch(
  kernel: Kernel,
  inputs: readonly unknown[],
  source: LogEntry["source"],
): LogEntry[] {
  const results = validateCommands(inputs, kernel);
  const entries = results.map(
    (r, i): LogEntry => ({
      tick: kernel.tick,
      source,
      command: inputs[i],
      result: r.accepted ? "accepted" : r.code,
    }),
  );
  const accepted = new Map<Command, LogEntry>();
  results.forEach((r, i) => {
    if (r.accepted) accepted.set(r.command, entries[i] as LogEntry);
  });
  const commands = sortCommands([...accepted.keys()]);
  const stray = commands.find((c) => c.tick !== kernel.tick);
  if (stray) throw new RangeError(`Command for tick ${stray.tick} stepped at tick ${kernel.tick}`);
  for (const command of commands) {
    const handler = kernel.handlers.get(command.type);
    // ponytail: reuses unknown_type for a type no registered feature handles; add a code if acks need to tell them apart.
    const code = kernel.victory?.ended
      ? "match_ended"
      : source === "input" && kernel.bots?.hasSeat(command.seat)
        ? "no_grant"
        : handler
          ? handler(kernel, command)
          : "unknown_type";
    if (code !== undefined) (accepted.get(command) as LogEntry).result = code;
  }
  return entries;
}

/** Calls each controller in seat order and queues its commands for the next tick. */
function queue(kernel: Kernel): void {
  const seats = [...kernel.controllers.keys()].sort((a, b) => a - b);
  for (const seat of seats) {
    const controller = kernel.controllers.get(seat) as Controller;
    for (const command of controller({
      tick: kernel.tick,
      observation: kernel.observe?.(seat) ?? {
        tick: kernel.tick,
        mode: "controlled",
        entities: [],
      },
    }))
      kernel.queued.push({
        ...command,
        payload: kernel.controllerPayload?.(seat, command) ?? command.payload,
        tick: kernel.tick + 1,
        seat,
        sequence: kernel.queued.length,
      });
  }
}
