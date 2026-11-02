import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import { checkpointHash, registerController, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { ConstructionSite } from "../construction";
import { StructurePower } from "../economy";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import type { GameplayWeapon } from "../entities/weapons";
import { MoveIntent } from "../movement";
import { CombatMotion, Projectile } from "../projectiles";
import { PRODUCTION_STATUSES, ProductionGifts, ProductionItem } from ".";

const worker: Definition = {
  id: "unit:production/worker",
  role: "builder",
  pop: 1,
  health: 50,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  builds: [],
};
const soldier: Definition = {
  ...worker,
  id: "unit:production/soldier",
  role: "combat",
  construction: { cost: { credits: 100 }, buildTicks: 2 },
  builds: undefined,
};
const tank: Definition = {
  ...soldier,
  id: "unit:production/tank",
  pop: 3,
  construction: { cost: { credits: 200 }, buildTicks: 4 },
};
const truck: Definition = {
  ...soldier,
  id: "unit:production/truck",
  role: "harvester",
  pop: 0,
  construction: null,
};
const producer: Definition = {
  id: "structure:production/headquarters",
  role: "headquarters",
  health: 1000,
  speed: 0,
  turnRate: 0,
  footprint: [3, 2],
  power: 20,
  productionSlots: 2,
  produces: [soldier.id, tank.id],
  exits: [
    { side: "south", cell: [0, 1] },
    { side: "south", cell: [2, 1] },
  ],
};
const obstruction: Definition = {
  id: "prop:production/block",
  health: 0,
  speed: 0,
  turnRate: 0,
  footprint: [1, 1],
  blocks: "movement",
};
function fixture(
  options: {
    slots?: number;
    duration?: number;
    credits?: number;
    rotation?: number;
    gift?: boolean;
    radius?: number;
    expires?: number;
    weapon?: GameplayWeapon;
  } = {},
) {
  const t = parseTerrain(32, 32, {}),
    startingCredits = options.credits ?? 5000;
  const { builds: _builds, ...combat } = soldier;
  const { builds: _tankBuilds, ...vehicle } = tank;
  const { builds: _truckBuilds, ...harvester } = truck;
  const definitions: Definition[] = [
    {
      ...producer,
      productionSlots: options.slots ?? 2,
      ...(options.gift && { spawnsWith: [truck.id] }),
    },
    worker,
    {
      ...combat,
      ...(options.weapon && { weapons: [options.weapon], armor: "infantry" }),
      radiusSubcells: options.radius ?? 128,
      construction: { cost: { credits: 100 }, buildTicks: options.duration ?? 2 },
    },
    vehicle,
    harvester,
    obstruction,
  ];
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    definitions,
    map: {
      id: "map:production",
      terrain: {
        ...t,
        level: [...t.level],
        ramp: [...t.ramp],
        surface: [...t.surface],
        water: [...t.water],
        biome: [...t.biome],
      },
      spawns: [
        {
          id: "start",
          position: [12 * 1024, 12 * 1024],
          facing: (((options.rotation ?? 0) + 1) & 3) * 0x4000,
        },
      ],
      objects: [],
    },
    forces: [{ index: 0, faction: "faction:production" }],
    seats: [1, 2],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
      {
        seat: 1,
        force: 0,
        scopes: ["production.queue"],
        grantedAtTick: 0,
        ...(options.expires !== undefined && { expiresAtTick: options.expires }),
      },
      { seat: 2, force: 0, scopes: ["production.queue"], grantedAtTick: 3 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 1 } },
      settings: { startingCredits, popCap: 50, structureCap: 400 },
      forces: [
        {
          index: 0,
          team: 0,
          spawn: "start",
          start: {
            structures: [producer.id],
            units: [{ unit: worker.id, count: 1, pop: 1, role: "builder" }],
            resources: { credits: startingCredits },
          },
        },
      ],
    },
  };
  const kernel = createMatch(setup);
  const building = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 0) as number;
  const builder = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1) as number;
  kernel.world.set(builder, Transform, "x", 6 * 1024 + 512);
  kernel.world.set(builder, Transform, "y", 6 * 1024 + 512);
  return { kernel, building, builder, setup };
}
const enqueue = (
  kernel: ReturnType<typeof createMatch>,
  entity: number,
  definition = soldier.id,
  sequence = 0,
  seat = 1,
) => ({
  tick: kernel.tick,
  sequence,
  seat,
  type: "production.enqueue" as const,
  payload: { entity, definition },
});
const itemIds = (kernel: ReturnType<typeof createMatch>) => kernel.world.query(ProductionItem);
const units = (kernel: ReturnType<typeof createMatch>, index = 2) =>
  kernel.world
    .query(Template)
    .filter((id) => kernel.world.get(id, Template, "definition") === index);
const state = (kernel: ReturnType<typeof createMatch>, item: number) =>
  PRODUCTION_STATUSES[kernel.world.get(item, ProductionItem, "status")];
function cancel(kernel: ReturnType<typeof createMatch>, item: number, seat = 1) {
  return step(kernel, [
    { tick: kernel.tick, sequence: 0, seat, type: "production.cancel", payload: { item } },
  ])[0]?.result;
}
function ticks(kernel: ReturnType<typeof createMatch>, count: number) {
  for (let i = 0; i < count; i++) step(kernel, []);
}
function exitCells(kernel: ReturnType<typeof createMatch>, building: number) {
  const x = Math.floor(kernel.world.get(building, Transform, "x") / 1024),
    y = Math.floor(kernel.world.get(building, Transform, "y") / 1024);
  return [
    [x, y + 2],
    [x + 2, y + 2],
  ] as const;
}
function blockExits(kernel: ReturnType<typeof createMatch>, building: number) {
  return exitCells(kernel, building).map(([x, y]) =>
    spawnEntity(kernel, 5, obstruction, {
      definition: obstruction.id,
      force: 0,
      x: x * 1024,
      y: y * 1024,
      facing: 16384,
    }),
  );
}

test("two data-defined slots pay on start and work independently when the earlier slot becomes empty", () => {
  const { kernel, building } = fixture();
  expect(
    step(kernel, [enqueue(kernel, building), enqueue(kernel, building, tank.id, 1)]).map(
      (entry) => entry.result,
    ),
  ).toEqual(["accepted", "accepted"]);
  expect(kernel.economy?.balance(0)?.credits).toBe(4700);
  expect(itemIds(kernel).map((id) => kernel.world.get(id, ProductionItem, "slot"))).toEqual([1, 2]);
  ticks(kernel, 3);
  expect(units(kernel)).toHaveLength(1);
  expect(units(kernel, 3)).toHaveLength(1);
  expect(itemIds(kernel)).toEqual([]);
});

test("five total player items includes active slots, and unpaid FIFO heads wait without blocking paid work", () => {
  const { kernel, building } = fixture({ credits: 250, duration: 20 });
  expect(
    step(
      kernel,
      Array.from({ length: 6 }, (_, sequence) =>
        enqueue(kernel, building, sequence === 0 ? tank.id : soldier.id, sequence),
      ),
    ).map((entry) => entry.result),
  ).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted", "queue_full"]);
  expect(kernel.economy?.balance(0)?.credits).toBe(50);
  const head = itemIds(kernel)[1] as number;
  expect(state(kernel, head)).toBe("funds");
  ticks(kernel, 3);
  expect(units(kernel, 3)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(50);
  kernel.economy?.gain(0, { credits: 100 });
  step(kernel, []);
  expect(kernel.economy?.balance(0)?.credits).toBe(50);
  expect(kernel.world.get(head, ProductionItem, "slot")).toBe(1);
});

test("cancellation is free before start and refunds the full paid receipt only once", () => {
  const { kernel, building } = fixture({ slots: 1, duration: 100 });
  step(kernel, [enqueue(kernel, building), enqueue(kernel, building, soldier.id, 1)]);
  const [paid, waiting] = itemIds(kernel);
  expect(cancel(kernel, waiting as number)).toBe("accepted");
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  expect(cancel(kernel, paid as number)).toBe("accepted");
  expect(kernel.economy?.balance(0)?.credits).toBe(5000);
  expect(cancel(kernel, paid as number)).toBe("bad_payload");
  expect(kernel.economy?.balance(0)?.credits).toBe(5000);
});

test("destruction and ownership changes refund the original Force; overflow retains a once-only refund debt", () => {
  for (const ownership of [false, true]) {
    const { kernel, building } = fixture({ duration: 100 });
    step(kernel, [
      enqueue(kernel, building),
      enqueue(kernel, building, soldier.id, 1),
      enqueue(kernel, building, soldier.id, 2),
    ]);
    if (ownership) kernel.world.set(building, OwnerForce, "force", 1);
    else kernel.world.destroy(building);
    step(kernel, []);
    expect(itemIds(kernel)).toEqual([]);
    expect(kernel.economy?.balance(0)?.credits).toBe(5000);
    step(kernel, []);
    expect(kernel.economy?.balance(0)?.credits).toBe(5000);
  }
  const { kernel, building } = fixture({ slots: 1, duration: 100 });
  step(kernel, [enqueue(kernel, building)]);
  kernel.economy?.gain(0, { credits: 0x7fffffff - 4900 });
  kernel.world.destroy(building);
  step(kernel, []);
  expect(itemIds(kernel)).toHaveLength(1);
  expect(state(kernel, itemIds(kernel)[0] as number)).toBe("refund");
  expect(kernel.economy?.spend(1, 0, { credits: 100 }, "production.queue").ok).toBe(true);
  step(kernel, []);
  expect(itemIds(kernel)).toEqual([]);
  expect(kernel.economy?.balance(0)?.credits).toBe(0x7fffffff);
});

test("brownout is exact half work and manual shutdown pauses queued payment and paid progress", () => {
  const { kernel, building } = fixture({ slots: 1, duration: 100 });
  kernel.world.set(building, StructurePower, "amount", -40);
  step(kernel, [enqueue(kernel, building)]);
  const item = itemIds(kernel)[0] as number;
  expect(state(kernel, item)).toBe("brownout");
  expect(kernel.world.get(item, ProductionItem, "completedTicks")).toBe(0);
  expect(kernel.world.get(item, ProductionItem, "remainder")).toBe(500);
  step(kernel, []);
  expect(kernel.world.get(item, ProductionItem, "completedTicks")).toBe(1);
  expect(kernel.world.get(item, ProductionItem, "remainder")).toBe(0);
  step(kernel, [
    {
      tick: kernel.tick,
      sequence: 0,
      seat: 1,
      type: "economy.power",
      payload: { entity: building, enabled: 0 },
    },
  ]);
  expect(state(kernel, item)).toBe("disabled");
  ticks(kernel, 3);
  expect(kernel.world.get(item, ProductionItem, "completedTicks")).toBe(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
});

test("current population pauses starts, work and ready output without reserving future population", () => {
  const { kernel, building } = fixture();
  const filler = Array.from({ length: 48 }, (_, i) =>
    spawnEntity(kernel, 2, soldier, {
      definition: soldier.id,
      force: 0,
      x: (4 + (i % 24)) * 1024 + 512,
      y: (4 + Math.floor(i / 24)) * 1024 + 512,
      facing: 0,
    }),
  );
  step(kernel, [enqueue(kernel, building), enqueue(kernel, building, soldier.id, 1)]);
  expect(kernel.economy?.balance(0)?.credits).toBe(4800);
  expect(itemIds(kernel)).toHaveLength(2);
  step(kernel, []);
  expect(units(kernel)).toHaveLength(49);
  expect(itemIds(kernel)).toHaveLength(1);
  expect(state(kernel, itemIds(kernel)[0] as number)).toBe("population");
  kernel.world.destroy(filler[0] as number);
  step(kernel, []);
  expect(units(kernel)).toHaveLength(49);
  expect(itemIds(kernel)).toEqual([]);
});

test("current issuing-seat permission is rechecked when queued items start", () => {
  const { kernel, building } = fixture({ slots: 1, expires: 1 });
  step(kernel, [enqueue(kernel, building), enqueue(kernel, building, soldier.id, 1)]);
  ticks(kernel, 2);
  const pending = itemIds(kernel)[0] as number;
  expect(state(kernel, pending)).toBe("grant");
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  expect(cancel(kernel, pending, 2)).toBe("accepted");
  expect(step(kernel, [enqueue(kernel, building, soldier.id, 0, 2)])[0]?.result).toBe("accepted");
  expect(kernel.economy?.balance(0)?.credits).toBe(4800);
});

test("authored exit positions rotate at all four turns and large units move outward only by radius", () => {
  for (const [rotation, dx, dy] of [
    [0, 0, 2],
    [1, -1, 0],
    [2, 2, -1],
    [3, 2, 2],
  ]) {
    const { kernel, building } = fixture({ rotation, duration: 0 });
    step(kernel, [enqueue(kernel, building)]);
    const unit = units(kernel)[0] as number;
    expect(
      kernel.world.get(unit, Transform, "x") - kernel.world.get(building, Transform, "x"),
    ).toBe((dx as number) * 1024 + 512);
    expect(
      kernel.world.get(unit, Transform, "y") - kernel.world.get(building, Transform, "y"),
    ).toBe((dy as number) * 1024 + 512);
  }
  const { kernel, building } = fixture({ radius: 870, duration: 0 });
  step(kernel, [enqueue(kernel, building)]);
  expect(
    kernel.world.get(units(kernel)[0] as number, Transform, "y") -
      kernel.world.get(building, Transform, "y"),
  ).toBe(3 * 1024 + 512);
});

test("blocked authored exits retain the paid ready item with no far-side fallback", () => {
  const { kernel, building } = fixture({ duration: 0 });
  const blockers = blockExits(kernel, building);
  step(kernel, [enqueue(kernel, building)]);
  expect(units(kernel)).toEqual([]);
  expect(state(kernel, itemIds(kernel)[0] as number)).toBe("exit");
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  ticks(kernel, 3);
  expect(units(kernel)).toEqual([]);
  kernel.world.destroy(blockers[0] as number);
  step(kernel, []);
  expect(units(kernel)).toHaveLength(1);
  expect(itemIds(kernel)).toEqual([]);
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
});

test("included trucks become ready only on completion, wait for exits, stay outside the five player items and emit once", () => {
  const { kernel, building } = fixture({ gift: true, duration: 100 });
  const blockers = blockExits(kernel, building);
  kernel.world.add(building, ConstructionSite);
  step(kernel, []);
  expect(kernel.world.has(building, ProductionGifts)).toBe(false);
  expect(units(kernel, 4)).toEqual([]);
  kernel.world.remove(building, ConstructionSite);
  step(
    kernel,
    Array.from({ length: 5 }, (_, sequence) => enqueue(kernel, building, soldier.id, sequence)),
  );
  expect(itemIds(kernel)).toHaveLength(6);
  const gift = itemIds(kernel).find(
    (id) => kernel.world.get(id, ProductionItem, "gift") === 1,
  ) as number;
  expect(cancel(kernel, gift)).toBe("bad_payload");
  expect(kernel.economy?.balance(0)?.credits).toBe(4800);
  kernel.world.destroy(blockers[0] as number);
  step(kernel, []);
  expect(units(kernel, 4)).toHaveLength(1);
  ticks(kernel, 5);
  expect(units(kernel, 4)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(4800);
});

test("normal controller observations copy private queues and resolve cancellation handles", () => {
  const { kernel, building } = fixture({ duration: 100 });
  step(kernel, [enqueue(kernel, building)]);
  const queue = kernel.observe?.(1).entities.find((entity) => entity.production)?.production?.queue;
  expect(queue).toHaveLength(1);
  if (!queue?.[0]) throw new Error("Missing observed production item");
  queue[0].completedTicks = 99;
  expect(
    kernel.observe?.(1).entities.find((entity) => entity.production)?.production?.queue[0]
      ?.completedTicks,
  ).toBe(1);
  registerController(kernel, 1, ({ tick, observation }) => {
    const item = observation.entities.find((entity) => entity.production)?.production?.queue[0];
    return tick === 1 && item
      ? [{ type: "production.cancel", payload: { item: item.handle } }]
      : [];
  });
  ticks(kernel, 2);
  expect(itemIds(kernel)).toEqual([]);
  expect(kernel.economy?.balance(0)?.credits).toBe(5000);
});

test("rally is copied at actual spawn through normal paths; producer queues and handles remain private copied data", () => {
  const { kernel, building, setup } = fixture({ duration: 2 });
  step(kernel, [enqueue(kernel, building)]);
  const projection = createProjection(setup, 1, "controlled"),
    observer = createProjection(setup, 2, "controlled");
  const presented = projection
    .snapshot(kernel)
    .entities.find((entity) => entity.production)?.production;
  expect(presented?.queue).toHaveLength(1);
  const handle = presented?.queue[0]?.handle as string;
  expect(projection.resolve(handle)).toBe(itemIds(kernel)[0]);
  expect(observer.snapshot(kernel).entities).toEqual([]);
  if (presented?.queue[0]) presented.queue[0].completedTicks = 1000;
  expect(kernel.world.get(itemIds(kernel)[0] as number, ProductionItem, "completedTicks")).toBe(1);
  step(kernel, [
    {
      tick: kernel.tick,
      sequence: 0,
      seat: 1,
      type: "production.rally",
      payload: { entity: building, x: 20 * 1024 + 512, y: 20 * 1024 + 512 },
    },
  ]);
  const unit = units(kernel)[0] as number;
  expect(kernel.world.has(unit, MoveIntent)).toBe(true);
  expect(kernel.world.get(unit, MoveIntent, "x")).toBe(20 * 1024 + 512);
});

test("zero-time and INT32_MAX recipes keep bounded progress, and definition metadata is canonical", () => {
  const a = fixture({ duration: 0x7fffffff }),
    b = fixture({ duration: 0x7fffffff });
  step(a.kernel, [enqueue(a.kernel, a.building)]);
  step(b.kernel, [enqueue(b.kernel, b.building)]);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  const item = itemIds(a.kernel)[0] as number;
  a.kernel.world.set(item, ProductionItem, "completedTicks", 0x7ffffffe);
  a.kernel.world.set(item, ProductionItem, "remainder", 999);
  step(a.kernel, []);
  expect(itemIds(a.kernel)).toEqual([]);
  expect(units(a.kernel)).toHaveLength(1);
});

test("cross-producer starts spend in enqueue order even when the earlier producer has a higher ID", () => {
  const { kernel, building, setup } = fixture({ slots: 1, duration: 100, credits: 100 });
  const second = spawnEntity(kernel, 0, setup.definitions[0] as Definition, {
    definition: producer.id,
    force: 0,
    x: 20 * 1024,
    y: 20 * 1024,
    facing: 16384,
  });
  expect(second).toBeGreaterThan(building);
  expect(
    step(kernel, [enqueue(kernel, second), enqueue(kernel, building, soldier.id, 1)]).map(
      (entry) => entry.result,
    ),
  ).toEqual(["accepted", "accepted"]);
  const [earlier, later] = itemIds(kernel);
  expect(kernel.world.get(earlier as number, ProductionItem, "producer")).toBe(second);
  expect(kernel.world.get(earlier as number, ProductionItem, "slot")).toBe(1);
  expect(kernel.world.get(earlier as number, ProductionItem, "completedTicks")).toBe(1);
  expect(state(kernel, later as number)).toBe("funds");
  expect(kernel.world.get(later as number, ProductionItem, "slot")).toBe(0);
  expect(kernel.economy?.balance(0)?.credits).toBe(0);
});

test("production-born rally movers participate in swept projectile collision in their birth tick", () => {
  const weapon: GameplayWeapon = {
    id: "crossing",
    targets: ["ground"],
    rangeSubcells: [0, 10000],
    reloadTicks: 1000,
    projectile: { kind: "bullet", speedSubcellsPerTick: 1024 },
    warheads: [{ type: "damage", amount: 10, tags: [] }],
  };
  const { kernel, building } = fixture({ duration: 2, weapon });
  const [exitX, exitY] = exitCells(kernel, building)[0];
  const x = exitX * 1024 + 512,
    y = exitY * 1024 + 512;
  step(kernel, [
    enqueue(kernel, building),
    {
      tick: 0,
      sequence: 1,
      seat: 1,
      type: "production.rally",
      payload: { entity: building, x, y: y + 6 * 1024 },
    },
  ]);
  expect(units(kernel)).toEqual([]);
  const round = kernel.world.create();
  kernel.world.add(round, Projectile, {
    definition: 2,
    weapon: 0,
    force: 1,
    ceiling: 255,
    x: x - 512,
    y: y + 512,
    destinationX: x + 512,
    destinationY: y + 512,
    velocityX: 1024,
    speed: 1024,
    life: 5,
    born: 0,
  });
  step(kernel, []);
  const born = units(kernel)[0] as number;
  expect(born).toBeDefined();
  expect(kernel.world.get(born, CombatMotion, "y")).toBe(y);
  expect(kernel.world.get(born, Transform, "y")).toBe(y + 1024);
  expect(kernel.world.get(born, Health, "current")).toBe(40);
  expect(kernel.world.isAlive(round)).toBe(false);
});

test("a paid producer killed in combat is destroyed and refunded in that same tick once", () => {
  const { kernel, building } = fixture({ duration: 10 });
  kernel.systems.combat.push(() => {
    if (kernel.world.isAlive(building)) kernel.world.set(building, Health, "current", 0);
  });
  step(kernel, [enqueue(kernel, building)]);
  expect(kernel.world.isAlive(building)).toBe(false);
  expect(itemIds(kernel)).toEqual([]);
  expect(kernel.economy?.balance(0)?.credits).toBe(5000);
  step(kernel, []);
  expect(kernel.economy?.balance(0)?.credits).toBe(5000);
});
