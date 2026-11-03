import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import { checkpointHash, registerController, step } from "../../kernel";
import { createMatch, type MatchSetup, SIM_VERSION } from "../../match";
import { createProjection } from "../../projection";
import { SCENARIO_FORMAT } from "../../snapshots";
import { replayScenario } from "../../snapshots/replay";
import { ProductionSurge } from "../abilities";
import { Disabled } from "../combat/disable";
import { ConstructionSite } from "../construction";
import { registerBotSeat } from "../control/bots";
import { StructurePower } from "../economy";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import type { GameplayWeapon } from "../entities/weapons";
import { emitProductionExit, MAX_PRODUCTION_EXITS } from "../events";
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
    industrial?: boolean;
    industrialStock?: number;
    cost?: number;
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
      ...(options.industrial && {
        productionReward: { resource: "industrial-capacity" as const, amount: 1, cap: 100 },
        productionSurge: {
          id: "production-surge",
          perMille: 1500,
          durationTicks: 4,
          cooldownTicks: 10,
          cost: { "industrial-capacity": 20 },
        },
      }),
    },
    worker,
    {
      ...combat,
      ...(options.weapon && { weapons: [options.weapon], armor: "infantry" }),
      radiusSubcells: options.radius ?? 128,
      construction: { cost: { credits: options.cost ?? 100 }, buildTicks: options.duration ?? 2 },
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
    seats: [1, 2, ...(options.industrial ? [3] : [])],
    grants: [
      ...(options.industrial
        ? [
            {
              seat: 1,
              force: 0,
              scopes: ["commander.abilities" as const, "surrender" as const],
              grantedAtTick: 0,
            },
            { seat: 3, force: 0, scopes: ["commander.abilities" as const], grantedAtTick: 0 },
          ]
        : []),
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
            resources: {
              credits: startingCredits,
              ...(options.industrial && { "industrial-capacity": options.industrialStock ?? 20 }),
            },
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

function surge(kernel: ReturnType<typeof createMatch>, entity: number, seat = 1, sequence = 0) {
  return {
    tick: kernel.tick,
    sequence,
    seat,
    type: "commander.activate" as const,
    payload: { entity, ability: "production-surge" },
  };
}

test("industrial awards require a paid legal output, cap once, and exclude gifts, kits and zero receipts", () => {
  const { kernel, building } = fixture({ industrial: true, industrialStock: 99, duration: 0 });
  const blockers = blockExits(kernel, building);
  expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(99);
  step(kernel, [enqueue(kernel, building), enqueue(kernel, building, soldier.id, 1)]);
  ticks(kernel, 2);
  expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(99);
  expect(itemIds(kernel)).toHaveLength(2);
  for (const id of blockers) kernel.world.destroy(id);
  step(kernel, []);
  expect(units(kernel)).toHaveLength(2);
  expect(itemIds(kernel)).toHaveLength(0);
  expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(100);
  ticks(kernel, 2);
  expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(100);

  const free = fixture({ industrial: true, industrialStock: 0, duration: 0, cost: 0, gift: true });
  step(free.kernel, [enqueue(free.kernel, free.building)]);
  expect(units(free.kernel)).toHaveLength(1);
  expect(units(free.kernel, 4)).toHaveLength(1);
  expect(free.kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(0);
  const canceled = fixture({ industrial: true, industrialStock: 0, duration: 20 });
  step(canceled.kernel, [enqueue(canceled.kernel, canceled.building)]);
  expect(cancel(canceled.kernel, itemIds(canceled.kernel)[0]!)).toBe("accepted");
  expect(canceled.kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(0);
});

test("Surge spends once across all providers and preserves exact work through brownout, shutdown and expiry", () => {
  const { kernel, building, setup } = fixture({ industrial: true, duration: 100 });
  const { world } = kernel;
  const second = spawnEntity(kernel, 0, setup.definitions[0]!, {
    definition: producer.id,
    force: 0,
    x: 24 * 1024,
    y: 24 * 1024,
    facing: 0,
  });
  step(kernel, [enqueue(kernel, building), enqueue(kernel, second, soldier.id, 1)]);
  const [firstItem, secondItem] = itemIds(kernel);
  expect(world.get(firstItem!, ProductionItem, "completedTicks")).toBe(1);
  const activated = step(kernel, [surge(kernel, building), surge(kernel, second, 1, 1)]);
  expect(activated.map((item) => item.result)).toEqual(["accepted", "cooldown"]);
  expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(0);
  for (const item of [firstItem!, secondItem!]) {
    expect(world.get(item, ProductionItem, "completedTicks")).toBe(2);
    expect(world.get(item, ProductionItem, "remainder")).toBe(500);
  }
  world.set(second, StructurePower, "amount", -40);
  step(kernel, []);
  expect(state(kernel, firstItem!)).toBe("brownout");
  expect(world.get(firstItem!, ProductionItem, "completedTicks")).toBe(3);
  expect(world.get(firstItem!, ProductionItem, "remainder")).toBe(250);
  world.set(building, StructurePower, "enabled", 0);
  ticks(kernel, 3);
  expect(world.get(firstItem!, ProductionItem, "completedTicks")).toBe(3);
  expect(world.get(firstItem!, ProductionItem, "remainder")).toBe(250);
  expect(kernel.productionSurges?.rate(0)).toBe(1000);
  world.set(building, StructurePower, "enabled", 1);
  world.set(second, StructurePower, "amount", 20);
  step(kernel, []);
  expect(world.get(firstItem!, ProductionItem, "completedTicks")).toBe(4);
  expect(world.get(firstItem!, ProductionItem, "remainder")).toBe(250);
  expect(step(kernel, [surge(kernel, second)])[0]?.result).toBe("cooldown");
});

test("Surge requires current Commander grant, funds and an operational completed provider", () => {
  for (const condition of ["no_grant", "funds", "off", "emp", "site"] as const) {
    const { kernel, building } = fixture({
      industrial: true,
      industrialStock: condition === "funds" ? 19 : 20,
      ...(condition === "emp" && {
        weapon: {
          id: "emp",
          targets: ["ground" as const],
          rangeSubcells: [0, 1024] as const,
          reloadTicks: 20,
          projectile: { kind: "instant" as const },
          warheads: [{ type: "disable" as const, durationTicks: 10, tags: ["emp"] }],
        },
      }),
    });
    if (condition === "off") kernel.world.set(building, StructurePower, "enabled", 0);
    if (condition === "emp") kernel.world.add(building, Disabled, { until: 5 });
    if (condition === "site") kernel.world.add(building, ConstructionSite);
    const before = kernel.economy?.balance(0)?.["industrial-capacity"];
    const result = step(kernel, [surge(kernel, building, condition === "no_grant" ? 2 : 1)])[0]
      ?.result;
    expect(result).toBe(
      condition === "funds"
        ? "insufficient_funds"
        : condition === "site"
          ? "bad_payload"
          : condition === "no_grant"
            ? "no_grant"
            : "immobile",
    );
    expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(before);
    expect(kernel.productionSurges?.rate(0)).toBe(1000);
  }
});

test("Commander-only control can use private Surge without seeing banks, and replay retains its Force lifetime", () => {
  const a = fixture({ industrial: true, duration: 100 }),
    b = fixture({ industrial: true, duration: 100 });
  const projection = createProjection(a.setup, 3, "controlled");
  const view = projection.snapshot(a.kernel),
    provider = view.entities.find((entity) => entity.productionSurge)!;
  expect(provider).toBeDefined();
  expect(view.banks).toEqual([]);
  expect(view.power).toEqual([]);
  expect(projection.resolve(provider.handle, "commander.abilities")).toBe(a.building);
  expect(projection.resolve(provider.handle, "production.queue")).toBeUndefined();
  expect(
    createProjection(a.setup, 2, "controlled")
      .snapshot(a.kernel)
      .entities.every((entity) => !entity.productionSurge),
  ).toBe(true);
  const command = {
    type: "commander.activate" as const,
    payload: { entity: provider.handle, ability: "production-surge" },
  };
  expect(a.kernel.controllerPayload?.(3, command)).toEqual({
    entity: a.building,
    ability: "production-surge",
  });
  expect(step(a.kernel, [surge(a.kernel, a.building, 3)])[0]?.result).toBe("accepted");
  step(b.kernel, [surge(b.kernel, b.building, 3)]);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  a.kernel.captureObservations?.();
  const copy = a.kernel
    .observe?.(3)
    .entities.find((entity) => entity.productionSurge)?.productionSurge;
  if (copy) copy.readyAt = 9999;
  expect(
    a.kernel.observe?.(3).entities.find((entity) => entity.productionSurge)?.productionSurge
      ?.readyAt,
  ).toBe(10);
  const replayable = createMatch(a.setup);
  const activation = surge(replayable, a.building, 3);
  step(replayable, [activation]);
  expect(
    checkpointHash(
      replayScenario(
        {
          format: SCENARIO_FORMAT,
          simVersion: SIM_VERSION,
          setup: a.setup,
          commands: [activation],
        },
        1,
      ),
    ),
  ).toBe(checkpointHash(replayable));
  for (const current of [a, b]) current.kernel.world.destroy(current.building);
  expect(a.kernel.productionSurges?.rate(0)).toBe(1500);
  expect(
    b.kernel.world.get(b.kernel.world.query(ProductionSurge)[0]!, ProductionSurge, "readyAt"),
  ).toBe(10);
  ticks(a.kernel, 4);
  ticks(b.kernel, 4);
  expect(a.kernel.productionSurges?.rate(0)).toBe(1000);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
});

test("Commander-only bot proposals require a grant at both proposal and execution ticks", () => {
  for (const expiry of [1, 2]) {
    const source = fixture({ industrial: true });
    const setup: MatchSetup = {
      ...source.setup,
      grants: source.setup.grants.map((grant) =>
        grant.seat === 3 ? { ...grant, expiresAtTick: expiry } : grant,
      ),
    };
    const kernel = createMatch(setup);
    registerBotSeat(
      kernel,
      setup,
      { seat: 3, program: "fixture-surge" },
      ({ observation, state, work }) => {
        const provider = observation.entities.find((entity) => entity.productionSurge);
        return {
          state: { ...state, cursor: state.cursor + 1 },
          commands:
            provider && state.cursor === 0 && work.take()
              ? [
                  {
                    type: "commander.activate",
                    payload: { entity: provider.handle, ability: provider.productionSurge!.id },
                  },
                ]
              : [],
        };
      },
    );
    step(kernel, []);
    expect(kernel.queued).toHaveLength(expiry === 1 ? 0 : 1);
    const outcome = step(kernel, []);
    expect(outcome[0]?.result).toBe(expiry === 1 ? undefined : "accepted");
    expect(kernel.economy?.balance(0)?.["industrial-capacity"]).toBe(expiry === 1 ? 20 : 0);
  }
});

test("EMP pauses paid production and supply without resetting work or the manual power switch", () => {
  const weapon: GameplayWeapon = {
    id: "emp",
    targets: ["ground"],
    rangeSubcells: [0, 1024],
    reloadTicks: 20,
    projectile: { kind: "instant" },
    warheads: [{ type: "disable", durationTicks: 10, tags: ["emp"] }],
  };
  const { kernel, building } = fixture({ weapon, duration: 6 });
  const { world } = kernel;
  step(kernel, [enqueue(kernel, building)]);
  const item = itemIds(kernel)[0]!;
  expect(world.get(item, ProductionItem, "completedTicks")).toBe(1);
  const credits = kernel.economy?.balance(0)?.credits;
  world.add(building, Disabled, { until: kernel.tick + 3 });
  expect(kernel.power?.balance(0)?.produced).toBe(0);
  expect(kernel.power?.powered(building)).toBe(false);
  ticks(kernel, 3);
  expect(world.get(item, ProductionItem, "completedTicks")).toBe(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(credits);
  expect(kernel.power?.balance(0)?.produced).toBe(20);
  expect(world.get(building, StructurePower, "enabled")).toBe(1);
  step(kernel, [
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 0,
      type: "economy.power",
      payload: { entity: building, enabled: 0 },
    },
  ]);
  ticks(kernel, 3);
  expect(world.get(item, ProductionItem, "completedTicks")).toBe(1);
  step(kernel, [
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 0,
      type: "economy.power",
      payload: { entity: building, enabled: 1 },
    },
  ]);
  ticks(kernel, 8);
  expect(units(kernel)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(credits);
});
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
  expect(kernel.statistics?.snapshot(1)[0]?.counters.unitsBuilt).toBe(2);
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
  expect([...(kernel.productionExits ?? [])]).toEqual([]);
  expect(state(kernel, itemIds(kernel)[0] as number)).toBe("exit");
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  ticks(kernel, 3);
  expect(units(kernel)).toEqual([]);
  kernel.world.destroy(blockers[0] as number);
  step(kernel, []);
  expect(units(kernel)).toHaveLength(1);
  expect([...(kernel.productionExits ?? [])]).toEqual([building]);
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
  expect([...(kernel.productionExits ?? [])]).toEqual([]);
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
  expect([...(kernel.productionExits ?? [])]).toEqual([building]);
  ticks(kernel, 5);
  expect([...(kernel.productionExits ?? [])]).toEqual([]);
  expect(units(kernel, 4)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(4800);
});

test("successful multi-slot exits coalesce, clear each tick, and cannot affect canonical state or bot observations", () => {
  const a = fixture({ duration: 0 }),
    b = fixture({ duration: 0 });
  for (const f of [a, b])
    step(f.kernel, [enqueue(f.kernel, f.building), enqueue(f.kernel, f.building, soldier.id, 1)]);
  expect(units(a.kernel)).toHaveLength(2);
  expect([...(a.kernel.productionExits ?? [])]).toEqual([a.building]);
  const projection = createProjection(a.setup, 1, "controlled");
  const packet = projection.snapshot(a.kernel);
  expect(packet.productionExits).toEqual([
    packet.entities.find((row) => projection.resolve(row.handle) === a.building)!.handle,
  ]);
  const allocation = projection.serialize(),
    hash = checkpointHash(a.kernel);
  for (let i = 0; i <= MAX_PRODUCTION_EXITS; i++) emitProductionExit(a.kernel, 1000000 + i);
  expect(a.kernel.productionExits?.size).toBe(MAX_PRODUCTION_EXITS);
  expect(checkpointHash(a.kernel)).toBe(hash);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  expect(projection.snapshot(a.kernel).productionExits).toEqual(packet.productionExits);
  expect(projection.serialize()).toEqual(allocation);
  expect(Object.hasOwn(a.kernel.observe?.(1) ?? {}, "productionExits")).toBe(false);
  packet.productionExits!.length = 0;
  expect(projection.snapshot(a.kernel).productionExits).toHaveLength(1);
  step(a.kernel, []);
  step(b.kernel, []);
  expect([...(a.kernel.productionExits ?? [])]).toEqual([]);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
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
