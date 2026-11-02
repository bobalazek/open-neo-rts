import { expect, test } from "bun:test";
import { isWorkerReply } from "./protocol";

const resources = { credits: 5000, materials: 0, "industrial-capacity": 0, "salvage-points": 0 };
const reply = (banks: unknown, mode = "controlled") => ({
  id: 1,
  state: { paused: true, speed: 1, snapshot: { tick: 0, mode, entities: [], banks } },
});

test("worker replies accept bounded copied stock banks and retain bank-free debug packets", () => {
  expect(isWorkerReply(reply([{ force: 1, resources }]))).toBe(true);
  expect(isWorkerReply(reply([]))).toBe(true);
  expect(isWorkerReply(reply(undefined, "debug-no-fog"))).toBe(true);
  expect(isWorkerReply(reply([{ force: 1, resources }], "debug-no-fog"))).toBe(false);
});

test("worker replies reject forged bank values, unknown/capacity/prototype keys and duplicate Forces", () => {
  for (const malformed of [
    null,
    {},
    [{ force: -1, resources }],
    [{ force: 0.5, resources }],
    [{ force: 0x80000000, resources }],
    [{ force: 1, resources: { ...resources, credits: -1 } }],
    [{ force: 1, resources: { ...resources, credits: 0.5 } }],
    [{ force: 1, resources: { ...resources, credits: 0x80000000 } }],
    [{ force: 1, resources: { ...resources, credits: Number.NaN } }],
    [{ force: 1, resources: { ...resources, power: 1 } }],
    [{ force: 1, resources: { ...resources, unknown: 1 } }],
    [{ force: 1, resources: { ...resources, constructor: 1 } }],
    [{ force: 1, resources: Object.assign(Object.create({ credits: 1 }), resources) }],
    [{ force: 1, resources: { ...resources, ...JSON.parse('{"__proto__": 1}') } }],
    [
      { force: 1, resources },
      { force: 1, resources },
    ],
    [
      { force: 2, resources },
      { force: 1, resources },
    ],
    [{ force: 1, resources: { credits: 5000 } }],
    Array(1),
    Array.from({ length: 9 }, (_, force) => ({ force, resources })),
  ])
    expect(isWorkerReply(reply(malformed))).toBe(false);
});

const powerReply = (power: unknown, entities: unknown[] = [], mode = "controlled") => ({
  id: 1,
  state: { paused: true, speed: 1, snapshot: { tick: 0, mode, entities, power } },
});
const power = { force: 1, used: 25, produced: 20, brownout: true };
const entity = {
  handle: "e1",
  definition: "core.structure:eastern-collective/anti-air-complex",
  force: 1,
  x: 10240,
  y: 10240,
  facing: 0,
  health: 1500,
  maxHealth: 1500,
  order: null,
  power: { amount: -25, enabled: true, powered: false },
};

test("worker replies accept bounded power capacities and per-instance toggles", () => {
  expect(isWorkerReply(powerReply([power], [entity]))).toBe(true);
  expect(isWorkerReply(powerReply([]))).toBe(true);
  expect(isWorkerReply(powerReply(undefined, [], "debug-no-fog"))).toBe(true);
  expect(isWorkerReply(powerReply([power], [], "debug-no-fog"))).toBe(false);
  expect(isWorkerReply(powerReply(undefined, [entity], "debug-no-fog"))).toBe(false);
});

test("worker replies reject malformed, duplicate, unsorted and contradictory power state", () => {
  for (const malformed of [
    null,
    {},
    Array(1),
    [{ ...power, force: -1 }],
    [{ ...power, force: 0.5 }],
    [{ ...power, force: 0x80000000 }],
    [{ ...power, used: -1 }],
    [{ ...power, used: 0.5 }],
    [{ ...power, used: 0x80000000 }],
    [{ ...power, produced: Number.NaN }],
    [{ ...power, produced: Number.POSITIVE_INFINITY }],
    [{ ...power, brownout: false }],
    [{ ...power, brownout: 1 }],
    [{ ...power, extra: 1 }],
    [{ ...power, ...JSON.parse('{"__proto__":1}') }],
    [Object.assign(Object.create({ hidden: 1 }), power)],
    [power, power],
    [{ ...power, force: 2 }, power],
    Array.from({ length: 9 }, (_, force) => ({ ...power, force })),
  ])
    expect(isWorkerReply(powerReply(malformed))).toBe(false);
  for (const malformed of [
    null,
    {},
    { ...entity.power, amount: 0.5 },
    { ...entity.power, amount: -0x80000001 },
    { ...entity.power, amount: 0x80000000 },
    { ...entity.power, enabled: 1 },
    { ...entity.power, powered: 1 },
    { ...entity.power, enabled: false, powered: true },
    { ...entity.power, extra: 1 },
    Object.assign(Object.create({ inherited: 1 }), entity.power),
  ])
    expect(isWorkerReply(powerReply([power], [{ ...entity, power: malformed }]))).toBe(false);
});
