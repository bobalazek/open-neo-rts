import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import type { Command, Payloads } from "../../commands";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { Harvester } from "../economy";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { MoveIntent } from "../movement";
import { ProductionItem } from "../production";
import { BuilderConstruction, ConstructionPayment, ConstructionSite } from ".";
import { KitStructure, REPAIR_STATES, RepairCredit, RepairOrder, RepairWork } from "./repair";

const builder: Definition = {
  id: "unit:repair/builder",
  role: "builder",
  health: 100,
  pop: 1,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  builds: ["structure:repair/factory"],
  repair: {
    targets: { structures: true, families: [], roles: [], tags: [] },
    rateMilliHealthPerSecond: 10_000,
    rangeSubcells: 0,
    costPerMille: 250,
  },
};
const soldier: Definition = {
  id: "unit:repair/soldier",
  role: "combat",
  health: 100,
  pop: 1,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  construction: { cost: { credits: 100, materials: 2 }, buildTicks: 1000 },
};
const headquarters: Definition = {
  id: "structure:repair/headquarters",
  role: "headquarters",
  health: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 2],
  power: 20,
  construction: { cost: { credits: 101, materials: 7 }, buildTicks: 0 },
};
const factory: Definition = {
  ...headquarters,
  id: "structure:repair/factory",
  role: "production",
  footprint: [2, 1],
  productionSlots: 2,
  produces: [soldier.id],
  exits: [{ side: "south", cell: [0, 0] }],
};
const block: Definition = {
  id: "prop:repair/block",
  health: 0,
  speed: 0,
  turnRate: 0,
  footprint: [1, 1],
  blocks: "movement",
};
function fixture(
  options: {
    expires?: number;
    credits?: number;
    maxHealth?: number;
    price?: number;
    rate?: number;
    percent?: number;
    secondForce?: boolean;
    repair?: Definition["repair"] | false;
    kitPrice?: boolean;
  } = {},
) {
  const t = parseTerrain(40, 40, {}),
    credits = options.credits ?? 1000;
  const { repair: repairDefinition, ...baseBuilder } = builder;
  const definitions: Definition[] = [
    options.kitPrice === false ? { ...headquarters, construction: null } : headquarters,
    {
      ...baseBuilder,
      ...(options.repair !== false && {
        repair: options.repair ?? {
          ...(repairDefinition as NonNullable<Definition["repair"]>),
          rateMilliHealthPerSecond: options.rate ?? 10_000,
          costPerMille: options.percent ?? 250,
        },
      }),
    },
    {
      ...factory,
      health: options.maxHealth ?? 100,
      construction: { cost: { credits: options.price ?? 101, materials: 7 }, buildTicks: 0 },
    },
    soldier,
    block,
  ];
  const forces = options.secondForce ? [0, 1] : [0];
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    definitions,
    map: {
      id: "map:repair",
      terrain: {
        ...t,
        level: [...t.level],
        ramp: [...t.ramp],
        surface: [...t.surface],
        water: [...t.water],
        biome: [...t.biome],
      },
      spawns: forces.map((index) => ({
        id: `start-${index}`,
        position: [(12 + index * 16) * 1024, (12 + index * 16) * 1024] as const,
        facing: 16384,
      })),
      objects: [],
    },
    forces: forces.map((index) => ({ index, faction: "faction:repair" })),
    seats: [1, 2],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders", "production.queue"], grantedAtTick: 0 },
      {
        seat: 1,
        force: 0,
        scopes: ["economy.build"],
        grantedAtTick: 0,
        ...(options.expires !== undefined && { expiresAtTick: options.expires }),
      },
      ...(options.secondForce
        ? [
            {
              seat: 2,
              force: 1,
              scopes: ["unit.orders", "production.queue", "economy.build"] as const,
              grantedAtTick: 0,
            },
          ]
        : []),
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: forces.length, max: forces.length } },
      settings: { startingCredits: credits, popCap: 500, structureCap: 400 },
      forces: forces.map((index) => ({
        index,
        team: index,
        spawn: `start-${index}`,
        start: {
          structures: [headquarters.id],
          units: [{ unit: builder.id, count: 1, pop: 1, role: "builder" }],
          resources: { credits, materials: 10 },
        },
      })),
    },
  };
  const kernel = createMatch(setup),
    world = kernel.world;
  const unit = world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        world.get(id, Template, "definition") === 1 && world.get(id, OwnerForce, "force") === 0,
    );
  const kit = world.query(KitStructure).find((id) => world.get(id, OwnerForce, "force") === 0);
  if (unit === undefined || kit === undefined)
    throw new Error("Missing initialized repair fixture");
  world.set(unit, Transform, "x", 8 * 1024 + 512);
  world.set(unit, Transform, "y", 8 * 1024 + 512);
  const target = spawnEntity(kernel, 2, definitions[2] as Definition, {
    definition: factory.id,
    force: 0,
    x: 15 * 1024,
    y: 12 * 1024,
    facing: 16384,
  });
  world.add(target, ConstructionPayment, { credits: options.price ?? 101, materials: 7 });
  world.set(target, Health, "current", Math.floor((options.maxHealth ?? 100) / 2));
  return { kernel, world, unit, kit, target, setup };
}
function command<T extends keyof Payloads>(
  kernel: ReturnType<typeof createMatch>,
  type: T,
  payload: Payloads[T],
  seat = 1,
) {
  return step(kernel, [{ tick: kernel.tick, sequence: 0, seat, type, payload }])[0]?.result;
}
function ticks(kernel: ReturnType<typeof createMatch>, count: number) {
  for (let i = 0; i < count; i++) step(kernel, []);
}
function until(kernel: ReturnType<typeof createMatch>, predicate: () => boolean, limit = 250) {
  for (let i = 0; i < limit && !predicate(); i++) step(kernel, []);
  expect(predicate()).toBe(true);
}
function adjacent(f: ReturnType<typeof fixture>) {
  f.world.set(f.unit, Transform, "x", 14 * 1024 + 512);
  f.world.set(f.unit, Transform, "y", 12 * 1024 + 512);
}
const repair = (f: ReturnType<typeof fixture>, seat = 1, builders = [f.unit]) =>
  command(f.kernel, "economy.repair", { entity: f.target, builders }, seat);
const state = (f: ReturnType<typeof fixture>) =>
  REPAIR_STATES[f.world.get(f.unit, RepairOrder, "state")];

test("completed sale uses half the recorded receipt once; only initialized kit structures get authored fallback", () => {
  const f = fixture();
  f.world.set(f.target, ConstructionPayment, "credits", 73);
  f.world.set(f.target, ConstructionPayment, "materials", 9);
  expect(command(f.kernel, "economy.sell", { entity: f.target })).toBe("accepted");
  expect(f.kernel.economy?.balance(0)).toMatchObject({ credits: 1036, materials: 14 });
  expect(command(f.kernel, "economy.sell", { entity: f.target })).toBe("bad_payload");
  expect(command(f.kernel, "economy.sell", { entity: f.kit })).toBe("accepted");
  expect(f.kernel.economy?.balance(0)).toMatchObject({ credits: 1086, materials: 17 });
  const unproven = spawnEntity(f.kernel, 2, factory, {
    definition: factory.id,
    force: 0,
    x: 20 * 1024,
    y: 20 * 1024,
    facing: 16384,
  });
  expect(command(f.kernel, "economy.sell", { entity: unproven })).toBe("bad_payload");
  expect(f.world.isAlive(unproven)).toBe(true);
});

test("sale atomically refunds paid producer items and drops waiting items, or keeps all receipts/structure on bank overflow", () => {
  const f = fixture();
  const queue = Array.from(
    { length: 3 },
    (_, sequence): Command => ({
      tick: f.kernel.tick,
      sequence,
      seat: 1,
      type: "production.enqueue",
      payload: { entity: f.target, definition: soldier.id },
    }),
  );
  expect(step(f.kernel, queue).map((entry) => entry.result)).toEqual([
    "accepted",
    "accepted",
    "accepted",
  ]);
  expect(f.kernel.economy?.balance(0)).toMatchObject({ credits: 800, materials: 6 });
  const items = f.world.query(ProductionItem);
  f.kernel.economy?.gain(0, { credits: 0x7fffffff - 800 });
  expect(command(f.kernel, "economy.sell", { entity: f.target })).toBe("bad_payload");
  expect(f.world.query(ProductionItem)).toEqual(items);
  expect(f.world.isAlive(f.target)).toBe(true);
  expect(f.kernel.economy?.balance(0)).toMatchObject({ credits: 0x7fffffff, materials: 6 });
  f.kernel.economy?.spend(1, 0, { credits: 250 }, "economy.build");
  expect(command(f.kernel, "economy.sell", { entity: f.target })).toBe("accepted");
  expect(f.world.query(ProductionItem)).toEqual([]);
  expect(f.kernel.economy?.balance(0)).toMatchObject({ credits: 0x7fffffff, materials: 13 });
  ticks(f.kernel, 2);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0x7fffffff);
});

test("sale refunds original receipt Forces and fails as one transaction if either bank cannot receive it", () => {
  const f = fixture({ secondForce: true });
  command(f.kernel, "production.enqueue", { entity: f.target, definition: soldier.id });
  f.world.set(f.target, OwnerForce, "force", 1);
  f.kernel.economy?.gain(0, { credits: 0x7fffffff - 900 });
  const handler = f.kernel.handlers.get("economy.sell");
  if (!handler) throw new Error("Missing sale handler");
  const sale: Command = {
    tick: f.kernel.tick,
    sequence: 0,
    seat: 2,
    type: "economy.sell",
    payload: { entity: f.target },
  };
  expect(handler(f.kernel, sale)).toBe("bad_payload");
  expect(f.kernel.economy?.balance(1)?.credits).toBe(1000);
  expect(f.world.isAlive(f.target)).toBe(true);
  expect(f.world.query(ProductionItem)).toHaveLength(1);
  f.kernel.economy?.spend(1, 0, { credits: 100 }, "economy.build");
  expect(handler(f.kernel, sale)).toBeUndefined();
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0x7fffffff);
  expect(f.kernel.economy?.balance(1)?.credits).toBe(1050);
  expect(f.world.query(ProductionItem)).toEqual([]);
});

test("unfinished structures retain full cancel while unpriced/dead/foreign structures cannot be sold or repaired", () => {
  const f = fixture();
  f.world.add(f.target, ConstructionSite);
  expect(command(f.kernel, "economy.sell", { entity: f.target })).toBe("bad_payload");
  expect(repair(f)).toBe("bad_payload");
  expect(command(f.kernel, "economy.cancelConstruction", { entity: f.target })).toBe("accepted");
  expect(f.kernel.economy?.balance(0)).toMatchObject({ credits: 1101, materials: 17 });
  const unpaid = fixture();
  unpaid.world.remove(unpaid.target, ConstructionPayment);
  expect(repair(unpaid)).toBe("bad_payload");
  expect(command(unpaid.kernel, "economy.sell", { entity: unpaid.target })).toBe("bad_payload");
  expect(repair(unpaid, 2)).toBe("no_grant");
  expect(command(unpaid.kernel, "economy.sell", { entity: unpaid.target }, 2)).toBe("no_grant");
  unpaid.world.set(unpaid.target, Health, "current", 0);
  expect(repair(unpaid)).toBe("bad_payload");
  expect(command(unpaid.kernel, "economy.sell", { entity: unpaid.target })).toBe("bad_payload");
});

test("repair travels to actual legal arrival before healing, charges progressively, stops/resumes and completes once", () => {
  const f = fixture();
  expect(repair(f)).toBe("accepted");
  expect(f.world.get(f.target, Health, "current")).toBe(50);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  expect(f.world.has(f.unit, MoveIntent)).toBe(true);
  until(f.kernel, () => f.world.get(f.target, Health, "current") > 50);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(999);
  command(f.kernel, "unit.stop", { entities: [f.unit] });
  const health = f.world.get(f.target, Health, "current"),
    carry = f.world.get(f.target, RepairCredit, "carry"),
    work = f.world.get(f.unit, RepairWork, "remainder");
  ticks(f.kernel, 4);
  expect(f.world.get(f.target, Health, "current")).toBe(health);
  expect(f.world.get(f.target, RepairCredit, "carry")).toBe(carry);
  expect(f.world.get(f.unit, RepairWork, "remainder")).toBe(work);
  expect(repair(f)).toBe("accepted");
  until(f.kernel, () => f.world.get(f.target, Health, "current") === 100);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(987); // ceil(50 HP * ceil(101 * 25%) / 100).
  expect(f.world.has(f.unit, RepairOrder)).toBe(false);
  ticks(f.kernel, 4);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(987);
});

test("repair requires explicit paid metadata, permitted structure filters and a priced target", () => {
  const metadata = builder.repair as NonNullable<Definition["repair"]>;
  const { costPerMille: _cost, ...withoutCost } = metadata;
  for (const options of [
    { repair: false as const },
    { rate: 0 },
    { percent: 0 },
    { price: 0 },
    { repair: withoutCost },
    { repair: { ...metadata, rangeSubcells: 1024 } },
    { repair: { ...metadata, targets: { ...metadata.targets, structures: false } } },
    { repair: { ...metadata, targets: { ...metadata.targets, roles: ["power"] } } },
    { repair: { ...metadata, targets: { ...metadata.targets, tags: ["unmatched"] } } },
  ]) {
    const f = fixture(options);
    expect(repair(f)).toBe("bad_payload");
    expect(f.world.get(f.target, Health, "current")).toBe(50);
    expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  }
  const kit = fixture({ kitPrice: false });
  kit.world.set(kit.kit, Health, "current", 50);
  expect(command(kit.kernel, "economy.repair", { entity: kit.kit, builders: [kit.unit] })).toBe(
    "bad_payload",
  );
  expect(command(kit.kernel, "economy.sell", { entity: kit.kit })).toBe("bad_payload");
});

test("build-granted target cancellation preserves fractional work and cannot cancel a newer move or another target", () => {
  const f = fixture();
  adjacent(f);
  expect(repair(f)).toBe("accepted");
  expect(command(f.kernel, "economy.cancelRepair", { entity: f.target }, 2)).toBe("no_grant");
  const work = f.world.get(f.unit, RepairWork, "remainder");
  expect(command(f.kernel, "economy.cancelRepair", { entity: f.target })).toBe("accepted");
  expect(f.world.has(f.unit, RepairOrder)).toBe(false);
  expect(f.world.get(f.unit, RepairWork, "remainder")).toBe(work);
  f.world.set(f.kit, Health, "current", 50);
  expect(command(f.kernel, "economy.repair", { entity: f.kit, builders: [f.unit] })).toBe(
    "accepted",
  );
  expect(command(f.kernel, "economy.cancelRepair", { entity: f.target })).toBe("accepted");
  expect(f.world.get(f.unit, RepairOrder, "target")).toBe(f.kit);
  command(f.kernel, "unit.move", { entities: [f.unit], x: 6 * 1024 + 512, y: 6 * 1024 + 512 });
  command(f.kernel, "economy.cancelRepair", { entity: f.kit });
  expect(f.world.get(f.unit, MoveIntent, "x")).toBe(6 * 1024 + 512);
});

test("one-credit prepayment persists across tiny stop/restart cycles and full-health damage cycles", () => {
  const f = fixture({ credits: 1, rate: 20_000 });
  adjacent(f);
  f.world.set(f.target, Health, "current", 99);
  for (let i = 0; i < 4; i++) {
    expect(repair(f)).toBe("accepted");
    expect(f.world.get(f.target, Health, "current")).toBe(i < 3 ? 100 : 99);
    if (i < 3) f.world.set(f.target, Health, "current", 99);
  }
  expect(state(f)).toBe("funds");
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0);
  expect(f.world.get(f.target, RepairCredit, "carry")).toBe(22);
  const remainder = f.world.get(f.unit, RepairWork, "remainder");
  ticks(f.kernel, 10);
  expect(f.world.get(f.unit, RepairWork, "remainder")).toBe(remainder);
  f.kernel.economy?.gain(0, { credits: 1 });
  step(f.kernel, []);
  expect(f.world.get(f.target, Health, "current")).toBe(100);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0);
});

test("actual repairers add linear work; foreign selections and expiry never heal or charge", () => {
  const f = fixture({ expires: 3 });
  adjacent(f);
  const second = spawnEntity(f.kernel, 1, builder, {
    definition: builder.id,
    force: 0,
    x: 15 * 1024 + 512,
    y: 11 * 1024 + 512,
    facing: 16384,
  });
  expect(repair(f, 1, [f.unit, second])).toBe("accepted");
  ticks(f.kernel, 1);
  expect(f.world.get(f.target, Health, "current")).toBe(52);
  ticks(f.kernel, 2);
  expect(f.world.get(f.target, Health, "current")).toBe(52);
  expect(state(f)).toBe("grant");
  expect(repair(f)).toBe("no_grant");
  expect(command(f.kernel, "economy.sell", { entity: f.target })).toBe("no_grant");
  const g = fixture();
  adjacent(g);
  g.world.set(g.unit, OwnerForce, "force", 1);
  expect(repair(g)).toBe("bad_payload");
  expect(g.kernel.economy?.balance(0)?.credits).toBe(1000);
});

test("new move/build/clearance orders suspend repair without losing fractional work or cargo", () => {
  const f = fixture();
  adjacent(f);
  f.world.add(f.unit, Harvester, { cargo: 12, miningWork: 9, enabled: 1 });
  expect(repair(f)).toBe("accepted");
  expect(f.world.get(f.unit, Harvester, "cargo")).toBe(12);
  expect(f.world.get(f.unit, Harvester, "miningWork")).toBe(9);
  expect(f.world.get(f.unit, Harvester, "enabled")).toBe(0);
  expect(f.world.get(f.unit, RepairWork, "remainder")).toBe(10_000);
  expect(
    command(f.kernel, "economy.build", {
      definition: factory.id,
      force: 0,
      builders: [f.unit],
      x: 16 * 1024,
      y: 14 * 1024,
      facing: 16384,
    }),
  ).toBe("accepted");
  expect(f.world.has(f.unit, RepairOrder)).toBe(false);
  expect(f.world.has(f.unit, BuilderConstruction)).toBe(true);
  expect(f.world.get(f.unit, RepairWork, "remainder")).toBe(10_000);
  expect(repair(f)).toBe("accepted");
  expect(f.world.has(f.unit, BuilderConstruction)).toBe(false);
  command(f.kernel, "unit.move", { entities: [f.unit], x: 6 * 1024 + 512, y: 6 * 1024 + 512 });
  const destination = f.world.get(f.unit, MoveIntent, "x");
  f.world.set(f.target, Health, "current", 0);
  step(f.kernel, []);
  expect(f.world.has(f.unit, RepairOrder)).toBe(false);
  expect(f.world.get(f.unit, MoveIntent, "x")).toBe(destination);
  expect(f.world.get(f.unit, Harvester, "cargo")).toBe(12);
});

test("blocked approaches cannot repair remotely, expose bounded status and retry through an explicit order", () => {
  const f = fixture();
  const blocks = [
    [14, 12],
    [17, 12],
    [15, 11],
    [16, 11],
    [15, 13],
    [16, 13],
  ].map(([x, y]) =>
    spawnEntity(f.kernel, 4, block, {
      definition: block.id,
      force: 0,
      x: (x as number) * 1024,
      y: (y as number) * 1024,
      facing: 16384,
    }),
  );
  expect(repair(f)).toBe("accepted");
  expect(state(f)).toBe("blocked");
  ticks(f.kernel, 4);
  expect(f.world.get(f.target, Health, "current")).toBe(50);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  f.world.destroy(blocks[0] as number);
  expect(repair(f)).toBe("accepted");
  until(f.kernel, () => f.world.get(f.target, Health, "current") > 50);
  f.world.set(f.target, Health, "current", 0);
  step(f.kernel, []);
  expect(f.world.has(f.unit, RepairOrder)).toBe(false);
  expect(f.world.isAlive(f.target)).toBe(false);
});

test("private repair status is copied with opaque targets, and huge recipes keep bounded integer credit carry", () => {
  const f = fixture();
  adjacent(f);
  repair(f);
  const projection = createProjection(f.setup, 1, "controlled"),
    other = createProjection(f.setup, 2, "controlled");
  const view = projection.snapshot(f.kernel),
    order = view.entities.find((entity) => entity.repairOrder)?.repairOrder;
  expect(order).toMatchObject({ state: "working", workRemainder: 10_000 });
  expect(projection.resolve(order?.target)).toBe(f.target);
  expect(other.snapshot(f.kernel).entities).toEqual([]);
  const target = view.entities.find((entity) => entity.repair)?.repair;
  if (target) target.creditCarry = 999;
  expect(f.world.get(f.target, RepairCredit, "carry")).toBe(0);
  const observed = f.kernel.observe?.(1).entities.find((entity) => entity.repairOrder)?.repairOrder;
  if (!observed) throw new Error("Missing permitted repair observation");
  observed.workRemainder = 999;
  expect(
    f.kernel.observe?.(1).entities.find((entity) => entity.repairOrder)?.repairOrder?.workRemainder,
  ).toBe(10_000);
  const a = fixture({ maxHealth: 0x7ffffffe, price: 0x7fffffff, rate: 1_000_000, percent: 1000 });
  const b = fixture({ maxHealth: 0x7ffffffe, price: 0x7fffffff, rate: 1_000_000, percent: 1000 });
  for (const g of [a, b]) {
    adjacent(g);
    g.world.set(g.target, Health, "current", 0x7ffffffe - 50);
    repair(g);
  }
  expect(a.world.get(a.target, Health, "current")).toBe(0x7ffffffe);
  expect(a.kernel.economy?.balance(0)?.credits).toBe(949);
  expect(a.world.get(a.target, RepairCredit, "carry")).toBe(0x7ffffffe - 50);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
});
