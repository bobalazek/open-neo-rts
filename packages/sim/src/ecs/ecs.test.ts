import { describe, expect, test } from "bun:test";
import { fnv1a32 } from "@open-neo-rts/deterministic";
import { defineComponent, ECS_FORMAT_VERSION, World } from ".";

const Position = defineComponent("Position", { x: "i32", y: "i32" });
const Health = defineComponent("Health", { hp: "u16", armor: "u8" });
const Owner = defineComponent("Owner", { force: "u8" });

function world(): World {
  const w = new World();
  for (const component of [Position, Health, Owner]) w.register(component);
  return w;
}

/** Enough churn to grow storage past its initial 64 slots and recycle slots out of ID order. */
function scenario(): World {
  const w = world();
  for (let i = 0; i < 100; i++) {
    const e = w.create();
    w.add(e, Position, { x: i * 1024, y: -i });
    if (i % 3 === 0) w.add(e, Health, { hp: 100 + i, armor: i % 7 });
  }
  for (let id = 1; id <= 100; id += 5) w.destroy(id);
  for (let i = 0; i < 10; i++) w.add(w.create(), Owner, { force: i });
  w.remove(3, Position);
  w.set(4, Position, "x", -0x80000000);
  w.add(100, Owner, { force: 255 });
  return w;
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("entity IDs", () => {
  test("start at 1, ascend, and are never reused", () => {
    const w = world();
    expect([w.create(), w.create(), w.create()]).toEqual([1, 2, 3]);
    w.destroy(2);
    w.destroy(3);
    expect(w.isAlive(2)).toBe(false);
    expect(w.create()).toBe(4);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const id = w.create();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      if (i % 2 === 0) w.destroy(id);
    }
  });

  test("destroying a dead entity throws", () => {
    const w = world();
    const e = w.create();
    w.destroy(e);
    expect(() => w.destroy(e)).toThrow("Entity 1 is not alive");
  });
});

describe("components", () => {
  test("add, get, set, has, remove", () => {
    const w = world();
    const e = w.create();
    w.add(e, Position, { x: -5 });
    expect([w.get(e, Position, "x"), w.get(e, Position, "y")]).toEqual([-5, 0]);
    w.set(e, Position, "y", 0x7fffffff);
    expect(w.get(e, Position, "y")).toBe(0x7fffffff);
    expect(w.has(e, Position)).toBe(true);
    expect(w.has(e, Health)).toBe(false);
    expect(() => w.add(e, Position)).toThrow("already has Position");
    w.remove(e, Position);
    expect(w.has(e, Position)).toBe(false);
    expect(() => w.get(e, Position, "x")).toThrow("has no Position");
  });

  test("rejects values that don't fit the field type", () => {
    const w = world();
    const e = w.create();
    w.add(e, Health);
    expect(() => w.set(e, Health, "armor", 256)).toThrow("Health.armor must be a u8 integer");
    expect(() => w.set(e, Health, "hp", 1.5)).toThrow(RangeError);
    expect(() => w.set(e, Health, "hp", -1)).toThrow(RangeError);
    const f = w.create();
    expect(() => w.add(f, Health, { hp: 70000 })).toThrow(RangeError);
    expect(w.has(f, Health)).toBe(false);
  });

  test("a recycled slot starts empty and add zeroes stale values", () => {
    const w = world();
    const a = w.create();
    w.add(a, Health, { hp: 9, armor: 9 });
    w.destroy(a);
    const b = w.create(); // reuses a's slot
    expect(w.has(b, Health)).toBe(false);
    w.add(b, Health);
    expect([w.get(b, Health, "hp"), w.get(b, Health, "armor")]).toEqual([0, 0]);
  });

  test("registration is per world and checked", () => {
    const w = new World();
    const e = w.create();
    expect(() => w.add(e, Position)).toThrow("not registered");
    w.register(Position);
    w.register(Position);
    expect(() => w.register(defineComponent("Position", { x: "i32" }))).toThrow("different");
    expect(() => w.register(defineComponent("Bad name", {}))).toThrow("ASCII identifiers");
  });
});

describe("queries", () => {
  test("ascend by ID regardless of insertion, removal or slot order", () => {
    const w = world();
    for (let i = 0; i < 5; i++) w.create();
    w.destroy(1);
    w.destroy(3);
    const late = [w.create(), w.create()]; // 6 and 7 take recycled slots of 3 and 1
    expect(late).toEqual([6, 7]);
    for (const id of [7, 2, 6, 5, 4]) w.add(id, Position);
    for (const id of [5, 7, 2]) w.add(id, Owner);
    expect(w.query(Position)).toEqual([2, 4, 5, 6, 7]);
    expect(w.query(Position, Owner)).toEqual([2, 5, 7]);
    expect(w.query()).toEqual([2, 4, 5, 6, 7]);
    w.remove(5, Owner);
    w.add(4, Owner);
    expect(w.query(Owner, Position)).toEqual([2, 4, 7]);
  });
});

describe("worlds", () => {
  test("are isolated", () => {
    const a = world();
    const b = world();
    const e = a.create();
    a.add(e, Position, { x: 7 });
    expect(b.create()).toBe(1);
    expect(b.has(1, Position)).toBe(false);
    expect(a.get(e, Position, "x")).toBe(7);
  });

  test("the same scenario twice in one process gives identical bytes", () => {
    expect(hex(scenario().serialize())).toBe(hex(scenario().serialize()));
  });
});

describe("serialization", () => {
  test("round-trips to identical bytes and keeps IDs retired", () => {
    const original = scenario();
    const bytes = original.serialize();
    const loaded = world();
    loaded.load(bytes);
    expect(hex(loaded.serialize())).toBe(hex(bytes));
    expect(loaded.query(Position, Health)).toEqual(original.query(Position, Health));
    expect(loaded.get(4, Position, "x")).toBe(-0x80000000);
    expect(loaded.create()).toBe(original.create());
  });

  test("ignores registration order", () => {
    const reversed = new World();
    for (const component of [Owner, Health, Position]) reversed.register(component);
    reversed.load(scenario().serialize());
    expect(hex(reversed.serialize())).toBe(hex(scenario().serialize()));
  });

  test("rejects another format version clearly", () => {
    const bytes = scenario().serialize();
    bytes[0] = ECS_FORMAT_VERSION + 1;
    expect(() => world().load(bytes)).toThrow(
      `ECS snapshot format version ${ECS_FORMAT_VERSION + 1} is not supported; this build reads version ${ECS_FORMAT_VERSION}`,
    );
  });

  test("rejects schema mismatches, bad input and non-fresh worlds", () => {
    const bytes = scenario().serialize();
    const fewer = new World();
    fewer.register(Position);
    expect(() => fewer.load(bytes)).toThrow("do not match");
    const changed = new World();
    for (const c of [Position, Owner, defineComponent("Health", { hp: "u32", armor: "u8" })])
      changed.register(c);
    expect(() => changed.load(bytes)).toThrow("do not match");
    expect(() => world().load(bytes.subarray(0, bytes.length - 1))).toThrow("truncated");
    expect(() => world().load(new Uint8Array([...bytes, 0]))).toThrow("trailing");
    const used = world();
    used.create();
    expect(() => used.load(bytes)).toThrow("fresh world");
  });

  test("golden bytes for a small fixed world", () => {
    const w = world();
    const a = w.create();
    w.add(a, Position, { x: -1, y: 1024 });
    w.add(w.create(), Health, { hp: 500, armor: 3 });
    w.destroy(w.create());
    const bytes = w.serialize();
    expect(bytes.length).toBe(116);
    expect(fnv1a32(String.fromCharCode(...bytes))).toBe(0x6862f40e);
  });
});
