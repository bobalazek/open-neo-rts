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

test("worker replies strictly validate private harvester cargo, status and unload work", () => {
  const harvesting = { cargo: 10, capacity: 500, status: "mining", unloadTicks: 0 };
  const packet = (value: unknown, mode = "controlled") =>
    powerReply(undefined, [{ ...entity, power: undefined, harvesting: value }], mode);
  expect(isWorkerReply(packet(harvesting))).toBe(true);
  expect(isWorkerReply(packet({ ...harvesting, status: "bank_full", unloadTicks: 40 }))).toBe(true);
  for (const bad of [
    null,
    {},
    { ...harvesting, cargo: -1 },
    { ...harvesting, cargo: 501 },
    { ...harvesting, cargo: 0.5 },
    { ...harvesting, capacity: 0 },
    { ...harvesting, capacity: 0x80000000 },
    { ...harvesting, unloadTicks: 41 },
    { ...harvesting, unloadTicks: 0.5 },
    { ...harvesting, status: "unknown" },
    { ...harvesting, status: "bank_full" },
    { ...harvesting, extra: 1 },
    Object.assign(Object.create(harvesting), harvesting),
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet(harvesting, "debug-no-fog"))).toBe(false);
});

test("worker replies validate extraction status and bounded finite or unlimited remaining deposits", () => {
  const extraction = { kind: "materials", remaining: 4, status: "active" };
  const packet = (value: unknown, mode = "controlled") =>
    powerReply(undefined, [{ ...entity, power: undefined, extraction: value }], mode);
  for (const valid of [
    extraction,
    { kind: "oil", remaining: null, status: "brownout" },
    { kind: "materials", remaining: 0, status: "depleted" },
    { kind: null, remaining: null, status: "invalid_node" },
  ])
    expect(isWorkerReply(packet(valid))).toBe(true);
  for (const invalid of [
    null,
    {},
    { ...extraction, remaining: -1 },
    { ...extraction, remaining: 0.5 },
    { ...extraction, remaining: 0x80000000 },
    { ...extraction, remaining: Number.NaN },
    { ...extraction, remaining: null },
    { ...extraction, status: "unknown" },
    { ...extraction, status: "depleted" },
    { ...extraction, kind: "ore" },
    { ...extraction, extra: 1 },
    Object.assign(Object.create(extraction), extraction),
    { ...extraction, ...JSON.parse('{"__proto__":1}') },
    { kind: "oil", remaining: null, status: "depleted" },
  ])
    expect(isWorkerReply(packet(invalid))).toBe(false);
  expect(isWorkerReply(packet(extraction, "debug-no-fog"))).toBe(false);
});

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

test("worker replies validate construction markers and private clearance/refusal state", () => {
  const request = {
    handle: "e2",
    definition: "core.structure:eastern-collective/industrial-reactor",
    force: 1,
    x: 10240,
    y: 10240,
    facing: 16384,
    status: "clearing",
  };
  const reply = (constructionRequests: unknown) => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: { tick: 0, mode: "controlled", entities: [], constructionRequests },
    },
  });
  expect(isWorkerReply(reply([request]))).toBe(true);
  expect(
    isWorkerReply(reply([{ ...request, status: "refused", reason: "clearance_timeout" }])),
  ).toBe(true);
  expect(isWorkerReply(reply([{ ...request, status: "refused", reason: "structure_cap" }]))).toBe(
    true,
  );
  expect(isWorkerReply(powerReply([power], [{ ...entity, constructionSite: true }]))).toBe(true);
  expect(isWorkerReply(powerReply([power], [{ ...entity, constructionSite: false }]))).toBe(false);
  for (const malformed of [
    null,
    Array(1),
    [{ ...request, status: "finished" }],
    [{ ...request, status: "refused" }],
    [{ ...request, reason: "clearance_timeout" }],
    [{ ...request, status: "refused", reason: "unknown" }],
    [{ ...request, force: -1 }],
    [{ ...request, x: 1.5 }],
    [{ ...request, facing: 65536 }],
    [{ ...request, extra: true }],
    [Object.assign(Object.create({ secret: 1 }), request)],
  ])
    expect(isWorkerReply(reply(malformed))).toBe(false);
});

test("worker replies validate real construction progress and builder work state", () => {
  const progress = { completedTicks: 2, quarter: 3, totalTicks: 100, buildersWorking: 2 };
  const site = { ...entity, constructionSite: true, construction: progress };
  for (const state of [["working"], ["blocked"], null, 1])
    expect(
      isWorkerReply(powerReply([power], [{ ...entity, constructionOrder: { site: "e2", state } }])),
    ).toBe(false);
  expect(isWorkerReply(powerReply([power], [site]))).toBe(true);
  expect(
    isWorkerReply(
      powerReply([power], [{ ...entity, constructionOrder: { site: "e2", state: "working" } }]),
    ),
  ).toBe(true);
  for (const malformed of [
    { ...progress, completedTicks: -1 },
    { ...progress, quarter: 4 },
    { ...progress, totalTicks: 0x80000000 },
    { ...progress, completedTicks: 100 },
    { ...progress, buildersWorking: 0.5 },
    { ...progress, extra: true },
  ])
    expect(isWorkerReply(powerReply([power], [{ ...site, construction: malformed }]))).toBe(false);
  expect(isWorkerReply(powerReply([power], [{ ...entity, construction: progress }]))).toBe(false);
  expect(
    isWorkerReply(
      powerReply([power], [{ ...entity, constructionOrder: { site: 42, state: "working" } }]),
    ),
  ).toBe(false);
});

test("worker replies validate bounded private production queues, work and point rallies", () => {
  const item = {
    handle: "e2",
    definition: "core.unit:eastern-collective/collective-soldier",
    slot: 1,
    state: "active",
    completedTicks: 2,
    remainder: 500,
    totalTicks: 80,
    gift: false,
  };
  const production = { slots: 2, queue: [item], rally: { x: 10000, y: 10000 } };
  expect(isWorkerReply(powerReply([power], [{ ...entity, production }]))).toBe(true);
  for (const malformed of [
    { ...production, slots: 0 },
    { ...production, slots: 6 },
    { ...production, queue: [{ ...item, slot: 3 }] },
    { ...production, queue: [{ ...item, state: ["active"] }] },
    { ...production, queue: [{ ...item, completedTicks: 81 }] },
    { ...production, queue: [{ ...item, remainder: 1000 }] },
    { ...production, queue: [{ ...item, gift: 0 }] },
    { ...production, queue: [item, item] },
    {
      ...production,
      queue: Array.from({ length: 6 }, (_, i) => ({ ...item, handle: `e${i + 2}` })),
    },
    { ...production, queue: [{ ...item, unexpected: true }] },
    { ...production, rally: { x: 1.5, y: 3 } },
  ])
    expect(isWorkerReply(powerReply([power], [{ ...entity, production: malformed }]))).toBe(false);
});
