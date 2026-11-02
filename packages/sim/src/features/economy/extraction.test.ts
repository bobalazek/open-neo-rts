import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import { World } from "../../ecs";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup, toMatchResources } from "../../match";
import { createProjection } from "../../projection";
import { AttackOrder, ShotIntent, WeaponState } from "../combat";
import {
  BuilderConstruction,
  ConstructionApproach,
  ConstructionBuilder,
  ConstructionPayment,
  ConstructionProgress,
  ConstructionRequest,
  ConstructionSite,
} from "../construction";
import {
  type Definition,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
  toDefinition,
} from "../entities";
import { MoveIntent, MovementFailure } from "../movement";
import { ProductionGifts, ProductionItem, ProductionRally } from "../production";
import { ForceBank } from "./bank";
import { Extraction, ResourceNode } from "./extraction";
import { Harvester } from "./harvesting";
import { OreCell } from "./ore";
import { StructurePower } from "./power";

const extractor: Definition = {
  ...toDefinition({
    id: "structure:fixture/extractor",
    role: "extractor",
    health: 800,
    footprint: [2, 2],
    nodeKinds: ["materials", "oil"],
    power: -10,
    extraction: {
      materials: { resource: "materials", amountPerSecond: 1 },
      oil: { resource: "credits", amountPerSecond: 2 },
    },
  }),
  construction: { cost: { credits: 800 }, buildTicks: 400 },
};
const hq: Definition = {
  id: "structure:fixture/headquarters",
  role: "headquarters",
  health: 1000,
  power: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 2],
};
const builder: Definition = {
  id: "unit:fixture/builder",
  role: "builder",
  health: 50,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  builds: [extractor.id],
};
const definitions = [hq, builder, extractor];

function fixture(amount = 5) {
  const terrain = parseTerrain(48, 48, {});
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    definitions,
    forces: [0, 1].map((index) => ({ index, faction: "faction:fixture" })),
    seats: [1, 2, 3, 4, 5],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
      { seat: 2, force: 1, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
      { seat: 3, force: 0, scopes: ["production.queue"], grantedAtTick: 0 },
      { seat: 4, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
      { seat: 5, force: 0, scopes: ["economy.build"], grantedAtTick: 0, expiresAtTick: 1 },
    ],
    map: {
      id: "map:fixture",
      terrain: {
        ...terrain,
        level: [...terrain.level],
        ramp: [...terrain.ramp],
        surface: [...terrain.surface],
        water: [...terrain.water],
        biome: [...terrain.biome],
      },
      spawns: [0, 1].map((index) => ({
        id: `spawn-${index}`,
        position: [(12 + index * 20) * 1024, 12 * 1024] as const,
        facing: 16384,
      })),
      objects: [],
      resources: toMatchResources([
        { kind: "materials", position: [15, 30], amount },
        { kind: "oil", position: [25, 30], amount },
        { kind: "oil", position: [35, 30] },
      ]),
    },
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 1000, popCap: 500, structureCap: 400 },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `spawn-${index}`,
        start: {
          structures: [hq.id],
          units: [{ unit: builder.id, count: 1, pop: 1, role: "builder" }],
          resources: { credits: 1000, materials: 0 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const spawn = (node = 0, force = 0, facing = 16384) =>
    spawnEntity(kernel, 2, extractor, {
      definition: extractor.id,
      force,
      x: (14 + node * 10) * 1024,
      y: 29 * 1024,
      facing,
    });
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) step(kernel, []);
  };
  const remaining = (node: number) => kernel.world.get(node, ResourceNode, "remaining");
  return { kernel, setup, spawn, advance, remaining };
}

test("material and oil rates accrue exactly at tick boundaries; finite nodes stop and unlimited oil continues", () => {
  const { kernel, spawn, advance } = fixture(3);
  const material = spawn(),
    finiteOil = spawn(1),
    unlimitedOil = spawn(2);
  advance(9);
  expect(kernel.economy?.balance(0)).toMatchObject({ credits: 1000, materials: 0 });
  advance(1);
  expect(kernel.economy?.balance(0)).toMatchObject({ credits: 1002, materials: 0 });
  advance(50);
  expect(kernel.economy?.balance(0)).toMatchObject({ credits: 1009, materials: 3 });
  expect(kernel.extraction?.snapshot(material)).toEqual({
    kind: "materials",
    remaining: 0,
    status: "depleted",
  });
  expect(kernel.extraction?.snapshot(finiteOil)).toEqual({
    kind: "oil",
    remaining: 0,
    status: "depleted",
  });
  expect(kernel.extraction?.snapshot(unlimitedOil)).toEqual({
    kind: "oil",
    remaining: null,
    status: "active",
  });
});

test("brownout halves accumulated output; disabled and incomplete extractors preserve progress", () => {
  const { kernel, spawn, advance } = fixture();
  const id = spawn();
  const headquarters = kernel.world
    .query(Template, StructurePower)
    .filter((entity) => kernel.world.get(entity, Template, "definition") === 0);
  for (const hq of headquarters) kernel.world.set(hq, StructurePower, "enabled", 0);
  advance(39);
  expect(kernel.economy?.balance(0)?.materials).toBe(0);
  expect(kernel.extraction?.snapshot(id)?.status).toBe("brownout");
  advance(1);
  expect(kernel.economy?.balance(0)?.materials).toBe(1);
  advance(10);
  const progress = kernel.world.get(id, Extraction, "progress");
  kernel.world.set(id, StructurePower, "enabled", 0);
  advance(40);
  expect(kernel.extraction?.snapshot(id)?.status).toBe("disabled");
  expect(kernel.world.get(id, Extraction, "progress")).toBe(progress);
  kernel.world.set(id, StructurePower, "enabled", 1);
  kernel.world.add(id, ConstructionSite);
  advance(40);
  expect(kernel.extraction?.snapshot(id)?.status).toBe("constructing");
  expect(kernel.world.get(id, Extraction, "progress")).toBe(progress);
  kernel.world.remove(id, ConstructionSite);
  advance(30);
  expect(kernel.economy?.balance(0)?.materials).toBe(2);
});

test("one node pays once in sorted entity order; capture and reconstruction keep deposit history", () => {
  const { kernel, spawn, advance, remaining } = fixture(3);
  const first = spawn(),
    duplicate = spawn(0, 1, 32768);
  const node = kernel.world.get(first, Extraction, "node");
  advance(20);
  expect(kernel.economy?.balance(0)?.materials).toBe(1);
  expect(kernel.economy?.balance(1)?.materials).toBe(0);
  expect(kernel.extraction?.snapshot(duplicate)?.status).toBe("claimed");
  kernel.world.set(first, OwnerForce, "force", 1);
  advance(20);
  expect(kernel.economy?.balance(1)?.materials).toBe(1);
  kernel.world.destroy(first);
  kernel.world.destroy(duplicate);
  const replacement = spawn();
  expect(kernel.world.get(replacement, Extraction, "node")).toBe(node);
  expect(remaining(node)).toBe(1);
  advance(40);
  expect(kernel.economy?.balance(0)?.materials).toBe(2);
  expect(remaining(node)).toBe(0);
});

test("bank overflow and unknown ownership cannot consume deposits or whole output work", () => {
  const { kernel, spawn, advance, remaining } = fixture();
  const id = spawn(1),
    node = kernel.world.get(id, Extraction, "node");
  advance(9);
  const bank = kernel.world
    .query(ForceBank)
    .find((entity) => kernel.world.get(entity, ForceBank, "force") === 0) as number;
  kernel.world.set(bank, ForceBank, "credits", 0x7fffffff);
  const progress = kernel.world.get(id, Extraction, "progress");
  advance(20);
  expect(kernel.extraction?.snapshot(id)?.status).toBe("blocked");
  expect(remaining(node)).toBe(5);
  expect(kernel.world.get(id, Extraction, "progress")).toBe(progress);
  kernel.world.set(bank, ForceBank, "credits", 1000);
  advance(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(1001);
  expect(remaining(node)).toBe(4);
  kernel.world.set(id, OwnerForce, "force", 999);
  advance(20);
  expect(remaining(node)).toBe(4);
});

test("invalid node references, geometry, capacity and fractional work refuse without production", () => {
  for (const corrupt of [
    (f: ReturnType<typeof fixture>, _id: number, node: number) => f.kernel.world.destroy(node),
    (f: ReturnType<typeof fixture>, id: number) => f.kernel.world.set(id, Extraction, "node", 999),
    (f: ReturnType<typeof fixture>, id: number) => f.kernel.world.set(id, Transform, "x", 1024),
    (f: ReturnType<typeof fixture>, _id: number, node: number) =>
      f.kernel.world.set(node, ResourceNode, "remaining", -1),
    (f: ReturnType<typeof fixture>, _id: number, node: number) =>
      f.kernel.world.set(node, ResourceNode, "remaining", 6),
    (f: ReturnType<typeof fixture>, id: number) =>
      f.kernel.world.set(id, Extraction, "progress", 20000),
    (f: ReturnType<typeof fixture>, _id: number, node: number) => {
      const duplicate = f.kernel.world.create();
      f.kernel.world.add(duplicate, ResourceNode, {
        index: f.kernel.world.get(node, ResourceNode, "index"),
        remaining: 5,
      });
    },
  ]) {
    const f = fixture(),
      id = f.spawn(),
      node = f.kernel.world.get(id, Extraction, "node");
    corrupt(f, id, node);
    f.advance(40);
    expect(f.kernel.economy?.balance(0)?.materials).toBe(0);
    expect(f.kernel.extraction?.snapshot(id)?.status).toBe("invalid_node");
  }
});

test("canonical snapshots include fractional progress and deposit state, with identical deterministic continuation", () => {
  const f = fixture(),
    other = fixture();
  const id = f.spawn(),
    twin = other.spawn();
  f.advance(25);
  other.advance(25);
  expect(checkpointHash(f.kernel)).toBe(checkpointHash(other.kernel));
  const restored = new World();
  for (const component of [
    Template,
    OwnerForce,
    Transform,
    Health,
    MoveIntent,
    MovementFailure,
    ConstructionSite,
    ConstructionPayment,
    ConstructionRequest,
    ConstructionBuilder,
    BuilderConstruction,
    ConstructionApproach,
    ConstructionProgress,
    StructurePower,
    ForceBank,
    ResourceNode,
    Extraction,
    Harvester,
    ProductionItem,
    ProductionGifts,
    ProductionRally,
    OreCell,
    AttackOrder,
    WeaponState,
    ShotIntent,
  ])
    restored.register(component);
  restored.load(f.kernel.world.serialize());
  expect(restored.get(id, Extraction, "progress")).toBe(5000);
  expect(restored.get(restored.get(id, Extraction, "node"), ResourceNode, "remaining")).toBe(4);
  expect(restored.serialize()).toEqual(f.kernel.world.serialize());
  expect(f.kernel.world.serialize()).toEqual(other.kernel.world.serialize());
  other.kernel.world.set(twin, Extraction, "progress", 5001);
  expect(checkpointHash(f.kernel)).not.toBe(checkpointHash(other.kernel));
  other.kernel.world.set(twin, Extraction, "progress", 5000);
  f.advance(75);
  other.advance(75);
  expect(checkpointHash(f.kernel)).toBe(checkpointHash(other.kernel));
});

test("projections copy actual node state only for current economic permissions", () => {
  const { kernel, setup, spawn, advance } = fixture();
  const id = spawn();
  advance(20);
  const economic = createProjection(setup, 3, "controlled");
  const army = createProjection(setup, 4, "controlled");
  const other = createProjection(setup, 2, "controlled");
  const expired = createProjection(setup, 5, "controlled");
  const snapshot = economic.snapshot(kernel);
  const entity = snapshot.entities.find((entity) => entity.definition === extractor.id);
  expect(entity?.extraction).toEqual({ kind: "materials", remaining: 4, status: "active" });
  expect(economic.resolve(entity?.handle)).toBe(id);
  expect(
    army.snapshot(kernel).entities.find((entity) => entity.definition === extractor.id)?.extraction,
  ).toBeUndefined();
  expect(other.snapshot(kernel).entities.some((entity) => entity.definition === extractor.id)).toBe(
    false,
  );
  expect(expired.snapshot(kernel).entities).toEqual([]);
  Reflect.set(entity?.extraction as object, "remaining", 999);
  expect(kernel.extraction?.snapshot(id)?.remaining).toBe(4);
});
