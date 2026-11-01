import { describe, expect, test } from "bun:test";
import { createStream, nextInt } from "@open-neo-rts/deterministic";
import {
  type Command,
  type Grant,
  hasGrant,
  type Result,
  SYSTEM_SEAT,
  sortCommands,
  validateCommands,
} from ".";

const spawn = (tick: number, seat: number, sequence: number): Command => ({
  tick,
  seat,
  sequence,
  type: "debug.spawn",
  payload: {
    definition: "core.unit:eastern-collective/dragon-tank",
    force: 1,
    x: 0,
    y: 1024,
    facing: 0,
  },
});

const remove = (entity: number) => ({
  tick: 3,
  seat: 1,
  sequence: entity,
  type: "debug.remove",
  payload: { entity },
});

const DEBUG = { debug: true };

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const s = createStream(seed, "test:shuffle");
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const codes = (results: Result[]) => results.map((r) => (r.accepted ? "ok" : r.code));

describe("sortCommands", () => {
  test("orders by tick, then server sequence, whatever the arrival order", () => {
    const commands = [
      spawn(2, 1, 9),
      spawn(1, 2, 0),
      spawn(1, 1, 5),
      spawn(1, 1, 4),
      spawn(2, SYSTEM_SEAT, 3),
      spawn(1, 3, 1),
    ];
    const expected = sortCommands(commands).map((c) => [c.tick, c.seat, c.sequence]);
    expect(expected).toEqual([
      [1, 2, 0],
      [1, 3, 1],
      [1, 1, 4],
      [1, 1, 5],
      [2, 0, 3],
      [2, 1, 9],
    ]);
    for (let seed = 0; seed < 50; seed++) {
      const order = sortCommands(shuffled(commands, seed)).map((c) => [c.tick, c.seat, c.sequence]);
      expect(order).toEqual(expected);
    }
  });
});

describe("validateCommands", () => {
  test("accepts well-formed debug commands in a debug match", () => {
    const inputs = [
      spawn(1, 1, 0),
      remove(7),
      { ...remove(8), type: "debug.setHealth", payload: { entity: 8, health: 0 } },
    ];
    expect(codes(validateCommands(inputs, DEBUG))).toEqual(["ok", "ok", "ok"]);
  });

  test("rejects debug commands in a normal match", () => {
    expect(codes(validateCommands([spawn(1, 1, 0), remove(7)], { debug: false }))).toEqual([
      "debug_only",
      "debug_only",
    ]);
  });

  test("rejects malformed envelopes", () => {
    const ok = spawn(1, 1, 0);
    const inputs: unknown[] = [
      null,
      [],
      "debug.spawn",
      { ...ok, tick: 1.5 },
      { ...ok, seat: -1 },
      { ...ok, sequence: "0" },
      { ...ok, tick: 2 ** 31 },
      { ...ok, type: 7 },
      { ...ok, payload: null },
      { ...ok, payload: [] },
      { ...ok, extra: 1 },
      { tick: 1, seat: 1, sequence: 0, type: "debug.remove" },
    ];
    expect(new Set(codes(validateCommands(inputs, DEBUG)))).toEqual(new Set(["malformed"]));
  });

  test("rejects unknown types, including prototype keys", () => {
    const inputs = ["unit.teleport", "toString", "constructor"].map((type) => ({
      ...remove(1),
      type,
    }));
    expect(codes(validateCommands(inputs, DEBUG))).toEqual([
      "unknown_type",
      "unknown_type",
      "unknown_type",
    ]);
  });

  test("rejects payloads with missing, extra, fractional or out-of-range fields", () => {
    const base = spawn(1, 1, 0);
    const payloads = [
      { ...base.payload, facing: 65536 },
      { ...base.payload, x: 2 ** 19 },
      { ...base.payload, y: -1 },
      { ...base.payload, force: 0.5 },
      { ...base.payload, definition: "faction:eastern-collective" },
      { ...base.payload, definition: "core.unit:Dragon Tank" },
      { ...base.payload, extra: 0 },
      { definition: "unit:x", force: 1, x: 0, y: 0 },
    ];
    const inputs = [
      ...payloads.map((payload) => ({ ...base, payload })),
      { ...remove(1), payload: { entity: 1, health: 5 } },
      { ...remove(1), type: "debug.setHealth", payload: { entity: 1, health: 2 ** 31 } },
    ];
    expect(new Set(codes(validateCommands(inputs, DEBUG)))).toEqual(new Set(["bad_payload"]));
  });

  test("rejects every command sharing a tick and sequence", () => {
    const inputs = [spawn(1, 1, 0), spawn(1, 1, 0), spawn(1, 1, 1), spawn(2, 1, 0)];
    expect(codes(validateCommands(inputs, DEBUG))).toEqual(["duplicate", "duplicate", "ok", "ok"]);
  });

  test("yields exactly one result per input, in input order", () => {
    const inputs: unknown[] = [
      spawn(1, 1, 0),
      null,
      remove(2),
      spawn(1, 1, 0),
      { ...remove(3), type: "x" },
    ];
    const results = validateCommands(inputs, DEBUG);
    expect(results).toHaveLength(inputs.length);
    expect(codes(results)).toEqual(["duplicate", "malformed", "ok", "duplicate", "unknown_type"]);
    const accepted = results.flatMap((r) => (r.accepted ? [r.command] : []));
    expect(accepted).toEqual([inputs[2] as Command]);
  });
});

describe("hasGrant", () => {
  const grants: Grant[] = [
    { seat: 1, force: 1, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
    { seat: 2, force: 1, scopes: ["unit.orders"], grantedAtTick: 100, revokedAtTick: 200 },
    { seat: 3, force: 2, scopes: ["unit.orders"], grantedAtTick: 0, expiresAtTick: 50 },
  ];

  test("allows a seat holding the scope on the Force at that tick", () => {
    expect(hasGrant(grants, 1, 1, "unit.orders", 0)).toBe(true);
    expect(hasGrant(grants, 2, 1, "unit.orders", 100)).toBe(true);
    expect(hasGrant(grants, 3, 2, "unit.orders", 49)).toBe(true);
  });

  test("rejects a seat without the grant", () => {
    expect(hasGrant(grants, 4, 1, "unit.orders", 0)).toBe(false); // no grant at all
    expect(hasGrant(grants, 1, 2, "unit.orders", 0)).toBe(false); // teammate's Force
    expect(hasGrant(grants, 2, 1, "economy.build", 150)).toBe(false); // missing scope
    expect(hasGrant(grants, 2, 1, "unit.orders", 99)).toBe(false); // not yet granted
    expect(hasGrant(grants, 2, 1, "unit.orders", 200)).toBe(false); // revoked
    expect(hasGrant(grants, 3, 2, "unit.orders", 50)).toBe(false); // expired
  });

  test("always allows the system seat", () => {
    expect(hasGrant([], SYSTEM_SEAT, 1, "surrender", 0)).toBe(true);
  });
});
