import { expect, test } from "bun:test";
import { HISTORY_METRICS, STAT_COUNTERS } from "@open-neo-rts/sim";
import { isWorkerReply } from "./protocol";

test("remains packets are bounded, strict, unique opaque rows separate from living actors", () => {
  const row = {
    handle: "e2",
    definition: "core.unit:fixture/vehicle",
    kind: "wreck",
    force: 1,
    x: 1024,
    y: 2048,
    facing: 12345,
  };
  const packet = (remains: unknown, mode = "controlled", entities: unknown[] = []) => ({
    id: 1,
    state: { paused: true, speed: 1, snapshot: { tick: 1, mode, entities, remains } },
  });
  expect(isWorkerReply(packet([row]))).toBe(true);
  expect(
    isWorkerReply(packet([{ ...row, definition: "core.structure:fixture/hq", kind: "rubble" }])),
  ).toBe(true);
  for (const bad of [
    [row, row],
    Array(501).fill(row),
    Array(1),
    [{ ...row, handle: "e4294967295" }],
    [{ ...row, handle: "r1" }],
    [{ ...row, handle: 1 }],
    [{ ...row, kind: "rubble" }],
    [{ ...row, force: -1 }],
    [{ ...row, x: 0.5 }],
    [{ ...row, facing: 65536 }],
    [{ ...row, definition: "core.prop:fixture/box" }],
    [{ ...row, health: 100 }],
    [{ ...row, eligible: true }],
    [{ ...row, [Symbol("hidden")]: true }],
    Object.assign([row], { hidden: true }),
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet([row], "debug-no-fog"))).toBe(false);
  expect(
    isWorkerReply(
      packet([row], "controlled", [{ ...row, health: 100, maxHealth: 100, order: null }]),
    ),
  ).toBe(false);
});

const resources = { credits: 5000, materials: 0, "industrial-capacity": 0, "salvage-points": 0 };

test("pending order copies are dense, bounded, strict, unique and cannot cite unpublished targets", () => {
  const row = { handle: "e2", type: "unit.move", x: 1024, y: 2048 };
  const packet = (queuedOrders: unknown, orderFailure?: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 10,
        mode,
        entities: [
          {
            handle: "e1",
            definition: "unit:fixture/soldier",
            force: 0,
            x: 0,
            y: 0,
            facing: 0,
            health: 100,
            maxHealth: 100,
            order: null,
            queuedOrders,
            ...(orderFailure === undefined ? {} : { orderFailure }),
          },
        ],
      },
    },
  });
  expect(isWorkerReply(packet([row]))).toBe(true);
  expect(
    isWorkerReply(
      packet([{ ...row, type: "economy.build", definition: "structure:fixture/base" }], {
        reason: "bad_payload",
        tick: 9,
      }),
    ),
  ).toBe(true);
  for (const bad of [
    [],
    Array(1),
    Array(33).fill(row),
    [row, row],
    [{ ...row, handle: "e1" }],
    [{ ...row, x: 0.5 }],
    [{ ...row, type: "unit.harvest" }],
    [{ ...row, type: "debug.remove" }],
    [{ ...row, type: "economy.build" }],
    [{ handle: "e2", type: "unit.attack", target: "e99" }],
    [{ ...row, target: "e99" }],
    [{ ...row, reason: "made-up" }],
    [{ ...row, [Symbol("extra")]: true }],
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet([row], { reason: "bad_payload", tick: 11 }))).toBe(false);
  expect(isWorkerReply(packet([row], undefined, "debug-no-fog"))).toBe(false);
});

test("Hold position wire state is a strict normal-match flag", () => {
  const packet = (holdPosition: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 1,
        mode,
        entities: [
          {
            handle: "e1",
            definition: "core.unit:fixture/soldier",
            force: 0,
            x: 0,
            y: 0,
            facing: 0,
            health: 100,
            maxHealth: 100,
            order: null,
            holdPosition,
          },
        ],
      },
    },
  });
  expect(isWorkerReply(packet(true))).toBe(true);
  for (const flag of [false, 0, 1, "true", null, {}, []])
    expect(isWorkerReply(packet(flag))).toBe(false);
  expect(isWorkerReply(packet(true, "debug-no-fog"))).toBe(false);
});

test("salvage orders accept only strict states and a currently published remains target", () => {
  const row = {
    handle: "e2",
    definition: "core.unit:fixture/vehicle",
    kind: "wreck",
    force: 1,
    x: 1024,
    y: 2048,
    facing: 0,
  };
  const packet = (salvageOrder: unknown, remains: unknown = [row]) => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 1,
        mode: "controlled",
        remains,
        entities: [
          {
            handle: "e1",
            definition: "core.unit:fixture/builder",
            force: 0,
            x: 0,
            y: 0,
            facing: 0,
            health: 100,
            maxHealth: 100,
            order: null,
            salvageOrder,
          },
        ],
      },
    },
  });
  for (const state of ["approaching", "working", "blocked", "grant", "contested", "storage"])
    expect(isWorkerReply(packet({ target: "e2", state }))).toBe(true);
  for (const order of [
    null,
    {},
    { target: "e2", state: "unknown" },
    { target: 2, state: "working" },
    { target: "e3", state: "working" },
    { target: "e2", state: "working", materials: 100 },
    { target: "e2", state: "working", [Symbol("hidden")]: true },
  ])
    expect(isWorkerReply(packet(order))).toBe(false);
  expect(isWorkerReply(packet({ target: "e2", state: "working" }, []))).toBe(false);
});

test("veterancy wire data bounds public ranks and paired private XP without accepting internal state", () => {
  const packet = (veterancy: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 1,
        mode,
        entities: [
          {
            handle: "e1",
            definition: "core.unit:fixture/soldier",
            force: 0,
            x: 1024,
            y: 1024,
            facing: 0,
            health: 110,
            maxHealth: 110,
            order: null,
            veterancy,
          },
        ],
      },
    },
  });
  expect(isWorkerReply(packet({ rank: 1 }))).toBe(true);
  expect(isWorkerReply(packet({ rank: 0, xp: 1, nextXp: 102400 }))).toBe(true);
  expect(isWorkerReply(packet({ rank: 3, xp: 409600, nextXp: 409600 }))).toBe(true);
  for (const invalid of [
    { rank: 4 },
    { rank: -1 },
    { rank: 0 },
    { rank: 1.5 },
    { rank: 1, xp: 1 },
    { rank: 1, nextXp: 1 },
    { rank: 1, xp: -1, nextXp: 1 },
    { rank: 1, xp: 2, nextXp: 1 },
    { rank: 1, xp: 1, nextXp: 0x1_0000_0000 },
    { rank: 1, damagedAt: 0 },
    { rank: 1, [Symbol("hidden")]: true },
  ])
    expect(isWorkerReply(packet(invalid))).toBe(false);
  expect(isWorkerReply(packet({ rank: 1 }, "debug-no-fog"))).toBe(false);
});
const reply = (banks: unknown, mode = "controlled") => ({
  id: 1,
  state: { paused: true, speed: 1, snapshot: { tick: 0, mode, entities: [], banks } },
});

test("private Surge wire data is strict, integer bounded and restricted to controlled snapshots", () => {
  const packet = (productionSurge: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 1,
        mode,
        entities: [
          {
            handle: "e1",
            definition: "core.structure:fixture/hq",
            force: 0,
            x: 1024,
            y: 1024,
            facing: 0,
            health: 100,
            maxHealth: 100,
            order: null,
            productionSurge,
          },
        ],
      },
    },
  });
  const valid = { id: "production-surge", until: 400, readyAt: 2400, perMille: 1500 };
  expect(isWorkerReply(packet(valid))).toBe(true);
  for (const invalid of [
    { ...valid, until: -1 },
    { ...valid, until: 0.5 },
    { ...valid, readyAt: 0x1_0000_0000 },
    { ...valid, perMille: 2001 },
    { ...valid, id: "" },
    { ...valid, force: 0 },
    { ...valid, [Symbol("hidden")]: true },
  ])
    expect(isWorkerReply(packet(invalid))).toBe(false);
  expect(isWorkerReply(packet(valid, "debug-no-fog"))).toBe(false);
});

test("deploy wire data accepts public state and optional private cooldown but rejects malformed metadata", () => {
  const packet = (deploy: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 1,
        mode,
        entities: [
          {
            handle: "e1",
            definition: "core.unit:fixture/tank",
            force: 0,
            x: 1024,
            y: 1024,
            facing: 0,
            health: 900,
            maxHealth: 900,
            order: null,
            deploy,
          },
        ],
      },
    },
  });
  const publicMode = { id: "siege-mode", active: true };
  expect(isWorkerReply(packet(publicMode))).toBe(true);
  expect(isWorkerReply(packet({ ...publicMode, readyAt: 60 }))).toBe(true);
  for (const bad of [
    { ...publicMode, active: 1 },
    { ...publicMode, id: "" },
    { ...publicMode, readyAt: -1 },
    { ...publicMode, readyAt: 0.5 },
    { ...publicMode, readyAt: 0x1_0000_0000 },
    { ...publicMode, cost: 100 },
    { ...publicMode, [Symbol("hidden")]: true },
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet(publicMode, "debug-no-fog"))).toBe(false);
});

test("statistics wire shape requires complete bounded counters and sorted private Force rows", () => {
  const counters = Object.fromEntries(STAT_COUNTERS.map((key) => [key, 0]));
  const packet = (statistics: unknown, mode = "controlled") => ({
    id: 0,
    state: { paused: true, speed: 1, snapshot: { tick: 0, mode, entities: [], statistics } },
  });
  expect(
    isWorkerReply(packet([{ force: 0, counters: { ...counters, unitsBuilt: 0xffffffff } }])),
  ).toBe(true);
  for (const value of [
    null,
    {},
    [{ force: 0, counters: {} }],
    [{ force: 0, counters: { ...counters, creditsSpent: -1 } }],
    [{ force: 0, counters: { ...counters, creditsSpent: 1.5 } }],
    [{ force: 0, counters: { ...counters, creditsSpent: 0x100000000 } }],
    [{ force: 0, counters: { ...counters, hidden: 1 } }],
    [
      { force: 1, counters },
      { force: 1, counters },
    ],
    [
      { force: 2, counters },
      { force: 1, counters },
    ],
  ])
    expect(isWorkerReply(packet(value))).toBe(false);
  expect(isWorkerReply(packet([], "debug-no-fog"))).toBe(false);
});

test("detailed statistics require a terminal result, bounded ordered history and exact controller/type data", () => {
  const counters = Object.fromEntries(STAT_COUNTERS.map((key) => [key, 0]));
  const values = Object.fromEntries(HISTORY_METRICS.map((metric) => [metric, 0]));
  const details = {
    controllers: [{ seat: 1, bot: false, orders: 2, ticks: 1200, apm: 2 }],
    types: [{ definition: "unit:fixture/worker", built: 1, lost: 0, destroyed: 0, remaining: 0 }],
    history: [
      { tick: 0, values },
      { tick: 1200, values },
    ],
  };
  const victory = {
    rule: "annihilation",
    forces: [
      { force: 0, team: 0, reason: "surrendered", tick: 1200 },
      { force: 1, team: 1, reason: "active", tick: null },
    ],
    result: { tick: 1200, winner: 1, reason: "lastManStanding" },
  };
  const packet = (detail: unknown, ended = true) => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 1200,
        mode: "controlled",
        entities: [],
        statistics: [{ force: 0, counters, details: detail }],
        ...(ended && { victory }),
      },
    },
  });
  expect(isWorkerReply(packet(details))).toBe(true);
  expect(isWorkerReply(packet(details, false))).toBe(false);
  for (const bad of [
    { ...details, secret: 1 },
    { ...details, controllers: [{ ...details.controllers[0]!, apm: 3 }] },
    { ...details, controllers: [details.controllers[0], details.controllers[0]] },
    { ...details, types: [details.types[0], details.types[0]] },
    { ...details, types: [{ ...details.types[0]!, definition: "prop:fixture/tree" }] },
    { ...details, types: [{ ...details.types[0]!, lost: -1 }] },
    { ...details, history: Array(513).fill({ tick: 0, values }) },
    { ...details, history: [{ tick: 1, values }] },
    {
      ...details,
      history: [
        { tick: 0, values },
        { tick: 0, values },
      ],
    },
    {
      ...details,
      history: [
        { tick: 0, values },
        { tick: 1201, values },
      ],
    },
    {
      ...details,
      history: [
        { tick: 0, values: { ...values, creditsGathered: 1 } },
        { tick: 1200, values },
      ],
    },
    { ...details, history: [{ tick: 0, values: { ...values, credits: 0.5 } }] },
    { ...details, history: [{ tick: 0, values: { ...values, hidden: 10 } }] },
    { ...details, history: Array(1) },
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
});

test("worker replies accept bounded copied stock banks and retain bank-free debug packets", () => {
  expect(isWorkerReply(reply([{ force: 1, resources }]))).toBe(true);
  expect(isWorkerReply(reply([]))).toBe(true);
  expect(isWorkerReply(reply(undefined, "debug-no-fog"))).toBe(true);
  expect(isWorkerReply(reply([{ force: 1, resources }], "debug-no-fog"))).toBe(false);
});

test("worker pacing accepts normal Slow/Fast speeds while retaining debug speeds", () => {
  for (const speed of [0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8]) {
    const value = reply([]);
    value.state.speed = speed;
    expect(isWorkerReply(value)).toBe(true);
  }
  for (const speed of [0, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const value = reply([]);
    value.state.speed = speed;
    expect(isWorkerReply(value)).toBe(false);
  }
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

test("EMP status is a strict public flag with no private deadline", () => {
  expect(isWorkerReply(powerReply(undefined, [{ ...entity, disabled: true }]))).toBe(true);
  for (const disabled of [false, 0, 1, "true", { until: 10 }, null])
    expect(isWorkerReply(powerReply(undefined, [{ ...entity, disabled }]))).toBe(false);
  expect(isWorkerReply(powerReply(undefined, [{ ...entity, disabled: true, until: 10 }]))).toBe(
    false,
  );
});

test("burning status and beam events pass the strict wire without exposing a rate, source or timer", () => {
  const packet = powerReply(undefined, [{ ...entity, burning: true }]);
  expect(isWorkerReply(packet)).toBe(true);
  for (const burning of [false, 1, "fire", null, { until: 20 }])
    expect(isWorkerReply(powerReply(undefined, [{ ...entity, burning }]))).toBe(false);
  expect(
    isWorkerReply({
      ...packet,
      state: {
        ...packet.state,
        snapshot: {
          ...packet.state.snapshot,
          combatEvents: [{ type: "impact", x: 1024, y: 1024, projectile: "beam" }],
        },
      },
    }),
  ).toBe(true);
});

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

test("worker replies accept only opaque attack target handles", () => {
  expect(
    isWorkerReply(powerReply(undefined, [{ ...entity, power: undefined, attackTarget: "e2" }])),
  ).toBe(true);
  for (const attackTarget of [2, "2", "g1", "e0", null, {}])
    expect(
      isWorkerReply(powerReply(undefined, [{ ...entity, power: undefined, attackTarget }])),
    ).toBe(false);
});

test("worker replies bound combat events and reject authoritative round IDs, force IDs and invalid locations", () => {
  const packet = (combatEvents: unknown, mode = "controlled") => ({
    id: 1,
    state: { paused: true, speed: 1, snapshot: { tick: 1, mode, entities: [], combatEvents } },
  });
  const event = { type: "flight", x: 1024, y: 2048, projectile: "missile", handle: "p1" };
  expect(isWorkerReply(packet([event]))).toBe(true);
  expect(isWorkerReply(packet([{ ...event, entity: "e2" }]))).toBe(true);
  expect(isWorkerReply(packet([{ type: "death", x: 1024, y: 2048 }]))).toBe(true);
  for (const bad of [
    null,
    {},
    [null],
    [{ ...event, round: 5 }],
    [{ ...event, force: 1 }],
    [{ ...event, entity: 5 }],
    [{ ...event, entity: "g1" }],
    [{ ...event, entity: "p1" }],
    [{ ...event, x: -1 }],
    [{ ...event, y: 0.5 }],
    [{ ...event, x: 512 * 1024 }],
    [{ ...event, type: "unknown" }],
    [{ ...event, handle: 1 }],
    [{ ...event, handle: "e1" }],
    [{ ...event, amount: 0x80000000 }],
    Array(8193).fill(event),
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet([event], "debug-no-fog"))).toBe(false);
});

test("worker accepts bounded unique producer handles only when that actor is in the current controlled projection", () => {
  const packet = (productionExits: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: { tick: 1, mode, entities: [entity], productionExits },
    },
  });
  expect(isWorkerReply(packet([]))).toBe(true);
  expect(isWorkerReply(packet([entity.handle]))).toBe(true);
  const expando = Object.assign([entity.handle], { queue: "private" });
  for (const value of [
    null,
    {},
    Array(1),
    [1],
    ["g1"],
    ["e0"],
    ["e9999"],
    [entity.handle, entity.handle],
    expando,
    Array(8193).fill(entity.handle),
  ])
    expect(isWorkerReply(packet(value))).toBe(false);
  expect(isWorkerReply(packet([], "debug-no-fog"))).toBe(false);
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

test("power adjacency wire data requires a bounded opaque source list and consistent effective/base amounts", () => {
  const value = { amount: 154, baseAmount: 140, sources: ["e2"], enabled: true, powered: true };
  const packet = (power: unknown) => powerReply(undefined, [{ ...entity, power }]);
  expect(isWorkerReply(packet(value))).toBe(true);
  expect(isWorkerReply(packet({ ...value, amount: 1, baseAmount: 1 }))).toBe(true);
  for (const malformed of [
    { ...value, baseAmount: 0 },
    { ...value, baseAmount: 140.5 },
    { ...value, amount: 139 },
    { ...value, enabled: false },
    { ...value, powered: false },
    { ...value, sources: [] },
    { ...value, sources: Array(1) },
    { ...value, sources: [2] },
    { ...value, sources: ["g1"] },
    { ...value, sources: ["e2", "e2"] },
    { ...value, sources: Array.from({ length: 41 }, (_, i) => `e${i + 1}`) },
    { amount: 154, enabled: true, powered: true, sources: ["e2"] },
    { ...value, extra: 1 },
  ])
    expect(isWorkerReply(packet(malformed))).toBe(false);
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
  expect(isWorkerReply(powerReply([power], [{ ...site, constructionStage: 2 }]))).toBe(true);
  for (const constructionStage of [-1, 101, 0.5, NaN, null, "2"])
    expect(isWorkerReply(powerReply([power], [{ ...site, constructionStage }]))).toBe(false);
  expect(isWorkerReply(powerReply([power], [{ ...entity, constructionStage: 2 }]))).toBe(false);
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

test("worker replies strictly validate private repair work, statuses and bounded prepayment", () => {
  const order = { target: "e2", state: "working", workRemainder: 10_000 };
  const repair = { creditCarry: 12, repairersWorking: 1 };
  const packet = (repairOrder: unknown, progress: unknown = repair, mode = "controlled") =>
    powerReply(undefined, [{ ...entity, power: undefined, repairOrder, repair: progress }], mode);
  expect(isWorkerReply(packet(order))).toBe(true);
  for (const bad of [
    null,
    {},
    { ...order, target: 1 },
    { ...order, state: ["working"] },
    { ...order, state: "unknown" },
    { ...order, workRemainder: 0.5 },
    { ...order, workRemainder: 20_000 },
    { ...order, extra: true },
    Object.assign(Object.create(order), order),
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  for (const bad of [
    null,
    {},
    { ...repair, creditCarry: -1 },
    { ...repair, creditCarry: entity.maxHealth },
    { ...repair, creditCarry: 0.5 },
    { ...repair, repairersWorking: -1 },
    { ...repair, repairersWorking: 0.5 },
    { ...repair, extra: true },
    Object.assign(Object.create(repair), repair),
  ])
    expect(isWorkerReply(packet(order, bad))).toBe(false);
  expect(isWorkerReply(packet(order, repair, "debug-no-fog"))).toBe(false);
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

test("private cargo packets bound manifests and reservations without exposing canonical IDs", () => {
  const passenger = {
    definition: "core.unit:eastern-collective/collective-soldier",
    health: 100,
    maxHealth: 100,
  };
  const cargo = { capacity: 5, firing: false, boarding: 1, passengers: [passenger] };
  expect(isWorkerReply(powerReply([power], [{ ...entity, cargo }]))).toBe(true);
  for (const bad of [
    { ...cargo, capacity: 0 },
    { ...cargo, firing: 1 },
    { ...cargo, capacity: 51 },
    { ...cargo, boarding: 5 },
    { ...cargo, boarding: -1 },
    { ...cargo, passengers: [{ ...passenger, entity: 5 }] },
    { ...cargo, passengers: [{ ...passenger, health: 0 }] },
    { ...cargo, passengers: [{ ...passenger, definition: "structure:enemy/bunker" }] },
    { ...cargo, passengers: Array(1) },
    { ...cargo, [Symbol("extra")]: 1 },
  ])
    expect(isWorkerReply(powerReply([power], [{ ...entity, cargo: bad }]))).toBe(false);
});

test("discovered resource origins require exact public fields and a permitted explored cell", () => {
  const cells = new Uint8Array(16);
  cells[5] = 1;
  cells[6] = 2;
  const node = { kind: "materials", x: 1024, y: 1024 };
  const packet = (resourceNodes: unknown, mode = "controlled") => ({
    id: 1,
    state: {
      paused: true,
      speed: 1,
      snapshot: {
        tick: 0,
        mode,
        entities: [],
        fog: [{ group: 1, width: 4, height: 4, cells }],
        ghosts: [],
        resourceNodes,
      },
    },
  });
  expect(isWorkerReply(packet([node, { ...node, kind: "oil", x: 2048 }]))).toBe(true);
  for (const bad of [
    null,
    {},
    [null],
    [node, node],
    [{ ...node, x: 0 }],
    [{ ...node, x: 4096 }],
    [{ ...node, x: 1025 }],
    [{ ...node, y: -1024 }],
    [{ ...node, kind: "ore" }],
    [{ ...node, remaining: 10 }],
    [Object.assign(Object.create(node), node)],
    [{ ...node, [Symbol("extra")]: 1 }],
    Array(1),
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet([node], "debug-no-fog"))).toBe(false);
});

test("victory replies validate sorted public defeats and one consistent final result", () => {
  const active = { force: 1, team: 1, reason: "active", tick: null };
  const lost = { force: 0, team: 0, reason: "eliminated", tick: 1 };
  const victory = {
    rule: "annihilation",
    forces: [lost, active],
    result: { tick: 1, winner: 1, reason: "lastManStanding" },
  };
  const packet = (value: unknown, tick = 1, mode = "controlled") => ({
    id: 1,
    state: { paused: true, speed: 1, snapshot: { tick, mode, entities: [], victory: value } },
  });
  expect(isWorkerReply(packet(victory))).toBe(true);
  expect(isWorkerReply(packet({ ...victory, forces: [active], result: null }, 0))).toBe(true);
  for (const bad of [
    { ...victory, rule: "unsupported" },
    { ...victory, forces: [active, lost] },
    { ...victory, forces: [lost, lost] },
    { ...victory, forces: [{ ...lost, tick: 2 }, active] },
    { ...victory, forces: [lost, { ...active, tick: 1 }] },
    { ...victory, result: { ...victory.result, winner: 0 } },
    { ...victory, result: { tick: 1, winner: null, reason: "draw" } },
    { ...victory, extra: 1 },
  ])
    expect(isWorkerReply(packet(bad))).toBe(false);
  expect(isWorkerReply(packet(victory, 1, "debug-no-fog"))).toBe(false);
});
