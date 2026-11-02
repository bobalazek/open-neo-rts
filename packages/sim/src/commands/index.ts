// Command envelopes, canonical ordering, shape validation, rejection codes and grant checks. Phase 1a.
// Executing a command against the world belongs to the feature that owns its type.

/** Reserved seat for server-issued commands (takeover, kick, pause, grant changes). */
export const SYSTEM_SEAT = 0;

const INT32_MAX = 0x7fffffff;
const MAP_SUBCELLS = 1 << 19; // 512 cells × 1,024 subcells (numerics.md)
const MAX_ORDER_ENTITIES = 1000; // a whole Force at the highest population cap, with room to spare

/** Place a unit, structure or prop for any Force: no cost, builder or tech. Placement rules still apply. */
export interface DebugSpawn {
  /** `unit:…`, `structure:…` or `prop:…`, optionally `<pack>.`-prefixed. */
  definition: string;
  force: number;
  /** Subcells. */
  x: number;
  /** Subcells. */
  y: number;
  /** Binary angle units, 0–65,535. */
  facing: number;
}

/** Health 0 currently removes a destructible entity; wreck gameplay arrives with combat. */
export interface DebugSetHealth {
  entity: number;
  health: number;
}

export interface DebugRemove {
  entity: number;
}

/** Replaces each unit's orders with a move to (x, y). Units that can't move ignore it. */
export interface UnitMove {
  /** 1 to 1,000 entity IDs. */
  entities: number[];
  /** Subcells. */
  x: number;
  /** Subcells. */
  y: number;
}

/** Drops each unit's orders. */
export interface UnitStop {
  /** 1 to 1,000 entity IDs. */
  entities: number[];
}

/** Normal, paid site placement by the selected same-Force builders. */
export interface ConstructionBuild extends DebugSpawn {
  builders: number[];
}

export interface Payloads {
  "unit.harvest": UnitStop;
  "production.enqueue": { entity: number; definition: string };
  "production.cancel": { item: number };
  "production.rally": { entity: number; x: number; y: number };
  "economy.assistConstruction": { entity: number; builders: number[] };
  "economy.build": ConstructionBuild;
  "economy.cancelConstruction": { entity: number };
  "debug.spawn": DebugSpawn;
  "debug.setHealth": DebugSetHealth;
  "debug.remove": DebugRemove;
  "unit.move": UnitMove;
  "unit.attackMove": UnitMove;
  "unit.stop": UnitStop;
  "economy.power": { entity: number; enabled: number };
}

export type CommandType = keyof Payloads;

/**
 * A canonical sim command, as stored in the command log. `tick` is the server-chosen target tick;
 * `sequence` is the server's `serverSequence`, assigned in arrival order (architecture.md §5). The client's
 * own counter is only for deduplication in the net layer and never reaches the sim.
 */
export type Command = {
  [T in CommandType]: {
    tick: number;
    seat: number;
    sequence: number;
    type: T;
    payload: Payloads[T];
  };
}[CommandType];

/** Every way a command is refused, with its reason. Clients get the code in their ack. */
export const REJECTIONS = {
  queue_full: "This producer already has five player items, including active items.",
  insufficient_funds: "The Force cannot afford the full authored cost.",
  structure_cap: "The new site would exceed this Force's structure cap.",
  malformed:
    "Not { tick, seat, sequence, type, payload } with non-negative int32 tick, seat and sequence.",
  unknown_type: "No command has this type.",
  debug_only: "debug.* commands are accepted only in matches started with debug: true.",
  bad_payload:
    "Payload fields are missing, unexpected, not integers, or out of range for this type.",
  placement_failed: "The authoritative spawn placement check refused the position.",
  duplicate: "Another command has the same tick and sequence; all of them are rejected.",
  no_grant: "The seat holds no grant with this scope on this Force at this tick.",
} as const;

export type Rejection = keyof typeof REJECTIONS;

/** One per input: the validated command, or why it was refused. */
export type Result = { accepted: true; command: Command } | { accepted: false; code: Rejection };

/** An inclusive integer range, a string pattern, or a list of 1 to `max` values matching `each`. */
type Field = readonly [min: number, max: number] | RegExp | { each: Field; max: number };

const ID: Field = [0, INT32_MAX];
const IDS: Field = { each: ID, max: MAX_ORDER_ENTITIES };
const POSITION: Field = [0, MAP_SUBCELLS - 1];
const SPAWNABLE = /^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/;

const PAYLOAD_FIELDS: { [T in CommandType]: { [K in keyof Payloads[T]]: Field } } = {
  "unit.harvest": { entities: IDS },
  "production.enqueue": {
    entity: ID,
    definition: /^([a-z0-9-]+\.)?unit:[a-z0-9-]+(\/[a-z0-9-]+)?$/,
  },
  "production.cancel": { item: ID },
  "production.rally": { entity: ID, x: POSITION, y: POSITION },
  "economy.assistConstruction": { entity: ID, builders: IDS },
  "economy.build": {
    definition: /^([a-z0-9-]+\.)?structure:[a-z0-9-]+(\/[a-z0-9-]+)?$/,
    force: ID,
    builders: IDS,
    x: POSITION,
    y: POSITION,
    facing: [0, 0xffff],
  },
  "economy.cancelConstruction": { entity: ID },
  "debug.spawn": {
    definition: SPAWNABLE,
    force: ID,
    x: POSITION,
    y: POSITION,
    facing: [0, 0xffff],
  },
  "debug.setHealth": { entity: ID, health: [0, INT32_MAX] },
  "debug.remove": { entity: ID },
  "unit.move": { entities: IDS, x: POSITION, y: POSITION },
  "unit.attackMove": { entities: IDS, x: POSITION, y: POSITION },
  "unit.stop": { entities: IDS },
  "economy.power": { entity: ID, enabled: [0, 1] },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function matches(v: unknown, field: Field): boolean {
  if (field instanceof RegExp) return typeof v === "string" && field.test(v);
  if ("each" in field)
    // Spread, so holes in a sparse array are checked as undefined instead of skipped.
    return (
      Array.isArray(v) &&
      v.length >= 1 &&
      v.length <= field.max &&
      [...v].every((e) => matches(e, field.each))
    );
  return typeof v === "number" && Number.isInteger(v) && v >= field[0] && v <= field[1];
}

function rejection(input: unknown, debug: boolean): Rejection | undefined {
  if (!isRecord(input) || Object.keys(input).length !== 5) return "malformed";
  const { tick, seat, sequence, type, payload } = input;
  if (![tick, seat, sequence].every((v) => matches(v, ID))) return "malformed";
  if (typeof type !== "string" || !isRecord(payload)) return "malformed";
  if (!Object.hasOwn(PAYLOAD_FIELDS, type)) return "unknown_type";
  if (type.startsWith("debug.") && !debug) return "debug_only";
  const fields = Object.entries(PAYLOAD_FIELDS[type as CommandType]);
  if (Object.keys(payload).length !== fields.length) return "bad_payload";
  if (!fields.every(([k, f]) => Object.hasOwn(payload, k) && matches(payload[k], f)))
    return "bad_payload";
  return undefined;
}

const keyOf = (c: Command) => `${c.tick}:${c.sequence}`;

/**
 * Shape-checks untrusted inputs: one result per input, in input order. World checks (grants on the
 * units' owner, placement, costs) happen later, in the features. Commands sharing a key are all
 * rejected, so the outcome never depends on arrival order.
 */
export function validateCommands(inputs: readonly unknown[], match: { debug: boolean }): Result[] {
  const codes = inputs.map((input) => rejection(input, match.debug));
  const counts = new Map<string, number>();
  inputs.forEach((input, i) => {
    if (codes[i] !== undefined) return;
    const key = keyOf(input as Command);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return inputs.map((input, i): Result => {
    const code = codes[i];
    if (code !== undefined) return { accepted: false, code };
    const command = input as Command;
    if (counts.get(keyOf(command)) !== 1) return { accepted: false, code: "duplicate" };
    return { accepted: true, command };
  });
}

/** Canonical order: `(tick, sequence)`. Keys are unique after validation, so this is total. */
export function sortCommands(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
}

/** Grant scopes from multiplayer.md §3. `full` is expanded when the grant is made, never checked. */
export type Scope =
  | "unit.orders"
  | "unit.abilities"
  | "economy.transfer"
  | "economy.build"
  | "production.queue"
  | "research.spend"
  | "diplomacy.propose"
  | "diplomacy.accept"
  | "commander.abilities"
  | "surrender"
  | "team.admin";

/** A seat's permission on a Force. Valid from `grantedAtTick` up to, not including, revoke or expiry. */
export interface Grant {
  seat: number;
  force: number;
  scopes: readonly Scope[];
  grantedAtTick: number;
  revokedAtTick?: number;
  expiresAtTick?: number;
}

/** Whether `seat` may use `scope` on `force` at `tick`. The system seat always may. */
export function hasGrant(
  grants: readonly Grant[],
  seat: number,
  force: number,
  scope: Scope,
  tick: number,
): boolean {
  if (seat === SYSTEM_SEAT) return true;
  return grants.some(
    (g) =>
      g.seat === seat &&
      g.force === force &&
      g.scopes.includes(scope) &&
      g.grantedAtTick <= tick &&
      (g.revokedAtTick === undefined || tick < g.revokedAtTick) &&
      (g.expiresAtTick === undefined || tick < g.expiresAtTick),
  );
}
