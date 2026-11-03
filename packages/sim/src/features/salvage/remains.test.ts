import { expect, test } from "bun:test";
import { World } from "../../ecs";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing/maps";
import { ConstructionSite } from "../construction";
import {
  type Definition,
  entitiesFeature,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
} from "../entities";
import { checkSpawnPlacement } from "../entities/placement";
import { MAX_REMAINS, MatchRemains, Remains } from ".";

const infantry: Definition = {
  id: "unit:fixture/infantry",
  role: "combat",
  health: 100,
  armor: "infantry",
  speed: 256,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  visionSubcells: 3 * 1024,
};
const vehicle: Definition = { ...infantry, id: "unit:fixture/vehicle", domain: "tracked", pop: 3 };
const hq: Definition = {
  id: "structure:fixture/hq",
  role: "headquarters",
  health: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 3],
  cells: ["ll", "ll", "ll"],
  visionSubcells: 3 * 1024,
};
const definitions: Definition[] = [
  hq,
  infantry,
  vehicle,
  { ...infantry, id: "unit:fixture/builder", role: "builder" },
  {
    ...infantry,
    id: "unit:fixture/shooter",
    weapons: [
      {
        id: "gun",
        targets: ["ground"],
        rangeSubcells: [0, 8 * 1024],
        reloadTicks: 1000,
        projectile: { kind: "instant" },
        warheads: [{ type: "damage", amount: 100, tags: [] }],
      },
    ],
  },
  {
    id: "prop:fixture/box",
    health: 100,
    speed: 0,
    turnRate: 0,
    footprint: [1, 1],
    blocks: "nothing",
  },
];
function fixture(fog: "off" | "standard" = "off") {
  const setup: MatchSetup = {
    seed: 3,
    debug: false,
    definitions,
    map: {
      ...flatMap(32),
      spawns: [
        { id: "west", position: [6 * 1024, 6 * 1024], facing: 16384 },
        { id: "east", position: [24 * 1024, 24 * 1024], facing: 16384 },
      ],
    },
    forces: [0, 1].map((index) => ({ index, faction: "faction:fixture" })),
    seats: [1, 2, 3],
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["unit.orders"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 1000, fog, popCap: 500, structureCap: 400 },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: index ? "east" : "west",
        start: {
          structures: [hq.id],
          units: [{ unit: definitions[3]!.id, count: 1, pop: 1, role: "builder" }],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const spawn = (index: number, force = 1, x = 16 * 1024, y = 16 * 1024, facing = 16384) =>
    spawnEntity(kernel, index, definitions[index]!, {
      definition: definitions[index]!.id,
      force,
      x,
      y,
      facing,
    });
  const kill = (...ids: number[]) => {
    for (const id of ids) kernel.world.set(id, Health, "current", 0);
    step(kernel, []);
  };
  return { setup, kernel, spawn, kill };
}

test("actual hostile fire replaces a vehicle once with canonical inert remains at its final pose", () => {
  const { kernel, spawn } = fixture();
  const actor = spawn(4, 0, 12 * 1024 + 512, 16 * 1024 + 512),
    target = spawn(2, 1, 16 * 1024 + 512, 16 * 1024 + 512, 12345);
  kernel.vision?.update();
  kernel.visibility?.update();
  kernel.captureObservations?.();
  expect(
    step(kernel, [
      {
        tick: 0,
        seat: 1,
        sequence: 0,
        type: "unit.attack",
        payload: { entities: [actor], entity: target },
      },
    ])[0]?.result,
  ).toBe("accepted");
  expect(kernel.world.isAlive(target)).toBe(false);
  const [id] = kernel.world.query(Remains, Transform);
  expect(id).toBeDefined();
  if (id === undefined) throw new Error("Missing actual wreck");
  expect(kernel.world.get(id, Remains, "definition")).toBe(2);
  expect(kernel.world.get(id, Remains, "force")).toBe(1);
  expect(kernel.world.get(id, Remains, "kind")).toBe(0);
  expect(kernel.world.get(id, Transform, "x")).toBe(16 * 1024 + 512);
  expect(kernel.world.get(id, Transform, "facing")).toBe(12345);
  for (const component of [Template, OwnerForce, Health])
    expect(kernel.world.has(id, component)).toBe(false);
  expect(kernel.combatEvents?.filter((e) => e.type === "death")).toHaveLength(1);
  step(kernel, []);
  expect(kernel.world.query(Remains)).toEqual([id]);
  expect(kernel.combatEvents?.filter((e) => e.type === "death")).toHaveLength(0);
});

test("foot troops/props leave nothing; completed and unfinished structures retain distinct salvage eligibility", () => {
  const { kernel, spawn, kill } = fixture();
  const site = spawn(0, 1, 20 * 1024, 12 * 1024),
    completed = spawn(0);
  kernel.world.add(site, ConstructionSite);
  kill(spawn(1), spawn(5), completed, site);
  const remains = kernel.world.query(Remains);
  expect(remains).toHaveLength(2);
  expect(remains.map((id) => kernel.world.get(id, Remains, "kind"))).toEqual([1, 1]);
  expect(remains.map((id) => kernel.world.get(id, Remains, "eligible"))).toEqual([0, 1]);
});

test("actual annihilation leaves inert remains without keeping the defeated Force alive", () => {
  const { kernel, spawn, kill } = fixture();
  spawn(2, 1);
  const victims = kernel.world
    .query(Template, OwnerForce, Health)
    .filter((id) => kernel.world.get(id, OwnerForce, "force") === 1);
  kill(...victims);
  expect(kernel.victory?.snapshot().result).toMatchObject({ winner: 0, reason: "lastManStanding" });
  expect(kernel.world.query(Remains)).toHaveLength(2);
  expect(
    kernel.world
      .query(Template, OwnerForce)
      .some((id) => kernel.world.get(id, OwnerForce, "force") === 1),
  ).toBe(false);
});

test("wrecks permit movement/placement; rotated rubble keeps only its former footprint blocked", () => {
  const { kernel, spawn, kill } = fixture();
  const worker = spawn(3, 0, 10 * 1024 + 512, 12 * 1024 + 512);
  const point = { x: 16 * 1024 + 512, y: 12 * 1024 + 512 };
  kill(spawn(2, 1, point.x, point.y));
  expect(kernel.movement?.canStand(worker, point)).toBe(true);
  const placement = { definition: hq.id, force: 0, x: 16 * 1024, y: 12 * 1024, facing: 0 };
  expect(checkSpawnPlacement(kernel, definitions, placement).ok).toBe(true);
  kill(spawn(0, 1, 16 * 1024, 12 * 1024, 0));
  expect(checkSpawnPlacement(kernel, definitions, placement).ok).toBe(false);
  // Facing 0 rotates the 2x3 original footprint into 3x2; no extra row blocks below it.
  for (const [x, y, clear] of [
    [16, 12, false],
    [18, 13, false],
    [19, 13, true],
    [17, 14, true],
  ] as const)
    expect(kernel.movement?.canStand(worker, { x: x * 1024 + 512, y: y * 1024 + 512 })).toBe(clear);
});

test("the shared 500-remains cap evicts old rubble deterministically and invalidates cached occupancy", () => {
  const { kernel, spawn, kill } = fixture();
  const worker = spawn(3, 0, 10 * 1024 + 512, 12 * 1024 + 512),
    point = { x: 16 * 1024 + 512, y: 16 * 1024 + 512 };
  kill(spawn(0));
  const old = kernel.world.query(Remains)[0]!;
  expect(kernel.movement?.canStand(worker, point)).toBe(false);
  const vehicles = Array.from({ length: MAX_REMAINS }, () => spawn(2));
  kill(...vehicles);
  expect(kernel.world.isAlive(old)).toBe(false);
  expect(kernel.world.query(Remains)).toHaveLength(MAX_REMAINS);
  expect(kernel.movement?.canStand(worker, point)).toBe(true);
  expect(kernel.world.query(Remains).map((id) => kernel.world.get(id, Remains, "created"))).toEqual(
    Array(MAX_REMAINS).fill(1),
  );
});

test("remains require current footprint sight, never former ownership; opaque handles and copies revoke under fog", () => {
  const { setup, kernel, spawn, kill } = fixture("standard");
  const source = spawn(0, 0, 16 * 1024, 12 * 1024, 0);
  kill(source);
  const projection = createProjection(setup, 1, "controlled");
  expect(projection.snapshot(kernel).remains).toEqual([]);
  const worker = spawn(3, 0, 20 * 1024 + 512, 13 * 1024 + 512);
  kernel.vision?.update();
  kernel.visibility?.update();
  kernel.captureObservations?.();
  const snapshot = projection.snapshot(kernel),
    row = snapshot.remains?.[0];
  expect(row).toMatchObject({
    definition: hq.id,
    kind: "rubble",
    force: 0,
    x: 16 * 1024,
    y: 12 * 1024,
    facing: 0,
  });
  expect(row?.handle).toMatch(/^e[1-9][0-9]*$/);
  expect(projection.resolve(row?.handle)).toBe(kernel.world.query(Remains)[0]);
  expect(projection.resolve(row?.handle, "unit.orders")).toBeUndefined();
  expect(createProjection(setup, 3, "controlled").snapshot(kernel).remains).toEqual([]);
  const hash = checkpointHash(kernel),
    copied = kernel.observe?.(1).remains?.[0];
  if (!copied) throw new Error("Missing copied remains");
  copied.x = 0;
  expect(kernel.observe?.(1).remains?.[0]?.x).toBe(16 * 1024);
  expect(checkpointHash(kernel)).toBe(hash);
  kernel.world.set(worker, Transform, "x", 8 * 1024);
  kernel.world.set(worker, Transform, "y", 10 * 1024);
  kernel.vision?.update();
  kernel.visibility?.update();
  expect(projection.snapshot(kernel).remains).toEqual([]);
  expect(projection.resolve(row?.handle)).toBeUndefined();
});

test("nonzero remains World bytes restore pose/eligibility/age and the same capped continuation", () => {
  const a = createKernel({ seed: 1, debug: false }),
    b = createKernel({ seed: 1, debug: false });
  for (const kernel of [a, b]) {
    register(kernel, entitiesFeature(definitions));
    kernel.remains = new MatchRemains(kernel, definitions);
  }
  a.tick = b.tick = 20;
  a.remains!.create(0, 1, { x: 16 * 1024, y: 12 * 1024, facing: 0 }, true);
  const bytes = a.world.serialize(),
    restored = new World();
  for (const component of [Template, OwnerForce, Transform, Health, Remains])
    restored.register(component);
  restored.load(bytes);
  expect(restored.get(1, Remains, "eligible")).toBe(0);
  expect(restored.get(1, Remains, "created")).toBe(20);
  // A fresh bare kernel has no entities, so its registered World can also load these exact bytes.
  b.world.load(bytes);
  for (let i = 0; i < MAX_REMAINS; i++) {
    for (const kernel of [a, b])
      kernel.remains!.create(2, 0, { x: 14 * 1024, y: 14 * 1024, facing: 12345 }, false);
  }
  expect(a.world.query(Remains)).toHaveLength(MAX_REMAINS);
  expect(a.world.isAlive(1)).toBe(false);
  expect(a.world.serialize()).toEqual(b.world.serialize());
  expect(checkpointHash(a)).toBe(checkpointHash(b));
});
