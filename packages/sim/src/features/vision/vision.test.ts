import { expect, test } from "bun:test";
import { checkpointHash, createKernel, register, registerController, step } from "../../kernel";
import { createMatch, type MatchMap, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing/maps";
import { ConstructionSite } from "../construction";
import {
  type Definition,
  entitiesFeature,
  Health,
  OwnerForce,
  spawnEntity,
  Transform,
  toDefinition,
} from "../entities";
import {
  AreaReveal,
  CELL_VISION,
  type FogMode,
  initializeVision,
  MAX_AREA_REVEALS,
  type VisionGrid,
} from ".";

const definitions: readonly Definition[] = [
  {
    id: "unit:test/scout",
    health: 10,
    speed: 1,
    turnRate: 0,
    visionSubcells: 2 * 1024,
    domain: "foot",
    radiusSubcells: 0,
  },
  {
    id: "structure:test/tower",
    health: 10,
    speed: 0,
    turnRate: 0,
    visionSubcells: 1024,
    footprint: [2, 1],
  },
  {
    id: "prop:test/rock",
    health: 0,
    speed: 0,
    turnRate: 0,
    footprint: [1, 2],
    blocks: "movement-and-vision",
  },
  {
    id: "prop:test/tree",
    health: 10,
    speed: 0,
    turnRate: 0,
    footprint: [1, 1],
    blocks: "movement-and-vision",
  },
  {
    id: "prop:test/fence",
    health: 0,
    speed: 0,
    turnRate: 0,
    footprint: [1, 1],
    blocks: "movement",
  },
  { id: "unit:test/blind", health: 10, speed: 0, turnRate: 0, domain: "foot", radiusSubcells: 0 },
];

function fixture(
  options: {
    map?: MatchMap;
    fog?: FogMode;
    shared?: boolean;
    radius?: number;
    reveal?: boolean;
  } = {},
) {
  const defs = definitions.map((definition, index) =>
    index === 0 && options.radius !== undefined
      ? { ...definition, visionSubcells: options.radius }
      : { ...definition },
  );
  if (options.reveal)
    defs[5] = {
      ...defs[5]!,
      weapons: [
        {
          id: "sensor",
          targets: ["ground"],
          rangeSubcells: [0, 8192],
          reloadTicks: 20,
          projectile: { kind: "instant" },
          warheads: [{ type: "reveal", radiusSubcells: 2048, durationTicks: 20, tags: [] }],
        },
      ],
    };
  const kernel = createKernel({ seed: 1, debug: true, map: options.map ?? flatMap(16) });
  register(kernel, entitiesFeature(defs));
  const normal = {
    gameplayHash: "1234567890abcdef",
    mapSupport: { start: "faction" as const, players: { min: 1, max: 8 } },
    settings: {
      startingCredits: 0,
      popCap: 200,
      structureCap: 150,
      fog: options.fog ?? "standard",
    },
    forces: [1, 2, 3].map((index) => ({
      index,
      team: options.shared && index < 3 ? 9 : index,
      spawn: `spawn-${index}`,
      start: { structures: [], units: [], resources: {} },
    })),
  };
  const vision = initializeVision(kernel, {
    definitions: defs,
    forces: [3, 2, 1].map((index) => ({ index, faction: "faction:test" })),
    normal,
  });
  const spawn = (index: number, x: number, y: number, force = 1, facing = 0x4000) => {
    const definition = defs[index] as Definition;
    return spawnEntity(kernel, index, definition, {
      definition: definition.id,
      force,
      x: x * 1024 + (index === 0 || index === 5 ? 512 : 0),
      y: y * 1024 + (index === 0 || index === 5 ? 512 : 0),
      facing,
    });
  };
  return { kernel, vision, spawn };
}

test("sensor circles publish for their Force/team, ignore LOS blockers, and leave explored terrain", () => {
  const map = flatMap(16),
    level = [...map.terrain.level];
  for (let y = 0; y < 16; y++) level[y * 16 + 6] = 1;
  const f = fixture({
    reveal: true,
    shared: true,
    map: { ...map, terrain: { ...map.terrain, level } },
  });
  f.spawn(3, 5, 5);
  const enemy = f.spawn(5, 6, 5, 3);
  expect(f.vision.revealArea(1, 4 * 1024 + 512, 5 * 1024 + 512, 2 * 1024, 1)).toBe(true);
  expect(f.vision.canSeeCell(1, 6, 5)).toBe(false);
  step(f.kernel, []);
  expect(f.vision.canSeeEntity(1, enemy)).toBe(true);
  expect(f.vision.canSeeEntity(2, enemy)).toBe(true);
  expect(f.vision.canSeeCell(3, 6, 5)).toBe(false);
  expect(f.vision.canSeeCell(1, 6, 6)).toBe(false);
  const grid = f.vision.copyGrid(1),
    hash = checkpointHash(f.kernel);
  f.vision.load(f.vision.serialize());
  expect(f.vision.copyGrid(1)).toEqual(grid);
  expect(checkpointHash(f.kernel)).toBe(hash);
  step(f.kernel, []);
  expect(f.kernel.world.query(AreaReveal)).toEqual([]);
  expect(f.vision.cellState(1, 6, 5)).toBe(CELL_VISION.explored);
});

test("overlapping sensor fields and ordinary vision expire independently and restore with exact deadlines", () => {
  const f = fixture({ reveal: true });
  f.spawn(0, 8, 4);
  f.vision.revealArea(1, 4 * 1024 + 512, 4 * 1024 + 512, 2 * 1024, 2);
  f.vision.revealArea(1, 6 * 1024 + 512, 4 * 1024 + 512, 2 * 1024, 4);
  f.vision.revealArea(1, 4 * 1024 + 512, 4 * 1024 + 512, 2 * 1024, 1);
  expect(f.kernel.world.query(AreaReveal)).toHaveLength(2);
  step(f.kernel, []);
  step(f.kernel, []);
  const restored = fixture({ reveal: true });
  restored.kernel.world.load(f.kernel.world.serialize());
  restored.kernel.tick = f.kernel.tick;
  restored.vision.load(f.vision.serialize());
  expect(restored.vision.copyGrid(1)).toEqual(f.vision.copyGrid(1));
  expect(checkpointHash(restored.kernel)).toBe(checkpointHash(f.kernel));
  for (let tick = 3; tick <= 6; tick++) {
    step(f.kernel, []);
    step(restored.kernel, []);
    expect(checkpointHash(restored.kernel)).toBe(checkpointHash(f.kernel));
    expect(restored.vision.copyGrid(1)).toEqual(f.vision.copyGrid(1));
    expect(f.vision.cellState(1, 2, 4)).toBe(CELL_VISION.explored);
    expect(f.vision.cellState(1, 5, 4)).toBe(tick < 5 ? CELL_VISION.visible : CELL_VISION.explored);
    expect(f.vision.cellState(1, 8, 4)).toBe(CELL_VISION.visible);
    const hash = checkpointHash(f.kernel),
      grid = f.vision.copyGrid(1);
    f.vision.load(f.vision.serialize());
    expect(f.vision.copyGrid(1)).toEqual(grid);
    expect(checkpointHash(f.kernel)).toBe(hash);
  }
});

test("sensor validation and capacity fail closed, refresh at capacity, and expire even with fog off", () => {
  const f = fixture({ reveal: true, fog: "off" });
  for (const [force, x, y, radius, duration] of [
    [99, 512, 512, 1024, 1],
    [1, -1, 512, 1024, 1],
    [1, 16384, 512, 1024, 1],
    [1, 512, 512, 0, 1],
    [1, 512, 512, 1024, 0],
    [1, 512, 512, 1.5, 1],
    [1, 512, 512, 1024, Number.NaN],
  ] as const)
    expect(f.vision.revealArea(force, x, y, radius, duration)).toBe(false);
  expect(fixture().vision.revealArea(1, 512, 512, 1024, 1)).toBe(false);
  for (let i = 0; i < MAX_AREA_REVEALS; i++)
    expect(f.vision.revealArea(1, 512 + i, 512, 1024, 1)).toBe(true);
  expect(f.vision.revealArea(1, 512, 512, 1024, 3)).toBe(true);
  expect(f.vision.revealArea(1, 1024, 512, 1024, 1)).toBe(false);
  step(f.kernel, []);
  step(f.kernel, []);
  expect(f.kernel.world.query(AreaReveal)).toHaveLength(1);
  expect(f.vision.revealArea(1, 1024, 512, 1024, 1)).toBe(true);
  step(f.kernel, []);
  step(f.kernel, []);
  expect(f.kernel.world.query(AreaReveal)).toEqual([]);
});

test("circular vision uses exact integer unit centers, includes the radius boundary and copies grids", () => {
  const { kernel, vision, spawn } = fixture();
  const scout = spawn(0, 5, 5);
  step(kernel, []);
  expect(vision.canSeeCell(1, 7, 5)).toBe(true);
  expect(vision.canSeeCell(1, 6, 6)).toBe(true);
  expect(vision.cellState(1, 7, 6)).toBe(CELL_VISION.shroud);
  expect(vision.canSeeEntity(1, scout)).toBe(true);
  const copied = vision.copyGrid(1) as VisionGrid;
  expect(copied).toMatchObject({ group: 1, width: 16, height: 16 });
  copied.cells.fill(2);
  expect(vision.canSeeCell(1, 15, 15)).toBe(false);
  kernel.world.set(scout, Transform, "x", 6 * 1024);
  step(kernel, []);
  expect(vision.cellState(1, 3, 5)).toBe(CELL_VISION.explored);
  expect(vision.canSeeCell(1, 7, 5)).toBe(true);
  expect(vision.copyGrid(999)).toBeUndefined();
  for (const [force, x, y] of [
    [999, 5, 5],
    [1, -1, 0],
    [1, 16, 0],
    [1, 0, 16],
    [1, 0.5, 0],
  ] as const)
    expect(vision.cellState(force, x, y)).toBe(CELL_VISION.shroud);
});

test("shared teammates pool sources, while overlap, death, ownership and completion leave no stale stamps", () => {
  const { kernel, vision, spawn } = fixture({ shared: true });
  const first = spawn(0, 5, 5),
    second = spawn(0, 5, 5, 2);
  expect(vision.groupForForce(1)).toBe(1);
  expect(vision.groupForForce(2)).toBe(1);
  expect(vision.groupForForce(3)).toBe(3);
  step(kernel, []);
  expect(vision.copyGrid(1)?.cells).toEqual(vision.copyGrid(2)?.cells);
  expect(vision.canSeeCell(3, 5, 5)).toBe(false);
  kernel.world.destroy(first);
  step(kernel, []);
  expect(vision.canSeeCell(1, 7, 5)).toBe(true);
  kernel.world.set(second, OwnerForce, "force", 3);
  step(kernel, []);
  expect(vision.cellState(1, 5, 5)).toBe(CELL_VISION.explored);
  expect(vision.canSeeCell(3, 5, 5)).toBe(true);
  kernel.world.set(second, Health, "current", 0);
  step(kernel, []);
  expect(vision.cellState(3, 5, 5)).toBe(CELL_VISION.explored);
  expect(vision.canSeeEntity(3, second)).toBe(false);
  const site = spawn(1, 10, 10);
  kernel.world.add(site, ConstructionSite);
  step(kernel, []);
  expect(vision.cellState(1, 10, 10)).toBe(CELL_VISION.shroud);
  kernel.world.remove(site, ConstructionSite);
  step(kernel, []);
  expect(vision.canSeeCell(1, 12, 10)).toBe(true);
  kernel.world.destroy(site);
  for (let i = 0; i < 3; i++) step(kernel, []);
  expect(vision.copyGrid(1)?.cells.some((state) => state === CELL_VISION.visible)).toBe(false);
});

test("structures use all rotated footprint cell centers for both vision and entity visibility", () => {
  const { kernel, vision, spawn } = fixture();
  const tower = spawn(1, 5, 5, 1, 0x8000);
  step(kernel, []);
  expect(vision.canSeeCell(1, 5, 7)).toBe(true);
  expect(vision.canSeeCell(1, 7, 5)).toBe(false);
  kernel.world.set(tower, Transform, "facing", 0x4000);
  step(kernel, []);
  expect(vision.canSeeCell(1, 7, 5)).toBe(true);
  expect(vision.cellState(1, 5, 7)).toBe(CELL_VISION.explored);
  const enemy = spawn(1, 7, 5, 2);
  expect(vision.canSeeEntity(1, enemy)).toBe(true);
  kernel.world.set(enemy, Transform, "x", 8 * 1024);
  expect(vision.canSeeEntity(1, enemy)).toBe(false);
});

test("higher ground hides cells from below, including behind a ridge; high sources can see lower ground", () => {
  const map = flatMap(16);
  const level = [...map.terrain.level];
  for (let y = 0; y < 16; y++) level[y * 16 + 6] = 1;
  const { kernel, vision, spawn } = fixture({
    map: { ...map, terrain: { ...map.terrain, level } },
    radius: 5 * 1024,
  });
  const scout = spawn(0, 4, 5);
  step(kernel, []);
  expect(vision.canSeeCell(1, 5, 5)).toBe(true);
  expect(vision.canSeeCell(1, 6, 5)).toBe(false);
  expect(vision.canSeeCell(1, 7, 5)).toBe(false);
  kernel.world.set(scout, Transform, "x", 6 * 1024 + 512);
  step(kernel, []);
  expect(vision.canSeeCell(1, 4, 5)).toBe(true);
  expect(vision.canSeeCell(1, 8, 5)).toBe(true);
});

test("opaque props are visible themselves, block all heights beyond, and invalidate unchanged sources on removal/movement", () => {
  const { kernel, vision, spawn } = fixture({ radius: 7 * 1024 });
  spawn(0, 4, 5);
  const tree = spawn(3, 6, 5);
  const rock = spawn(2, 6, 7);
  const fence = spawn(4, 6, 4);
  step(kernel, []);
  expect(vision.canSeeEntity(1, tree)).toBe(true);
  expect(vision.canSeeCell(1, 6, 5)).toBe(true);
  expect(vision.canSeeCell(1, 7, 5)).toBe(false);
  expect(vision.canSeeEntity(1, rock)).toBe(true); // health 0 means permanent, not dead
  expect(vision.canSeeCell(1, 7, 8)).toBe(false);
  expect(vision.canSeeEntity(1, fence)).toBe(true);
  kernel.world.set(tree, Health, "current", 0);
  step(kernel, []);
  expect(vision.canSeeCell(1, 7, 5)).toBe(true);
  kernel.world.set(rock, Transform, "y", 10 * 1024);
  step(kernel, []);
  expect(vision.canSeeCell(1, 7, 8)).toBe(true);
  const blocker = spawn(3, 6, 5);
  step(kernel, []);
  expect(vision.cellState(1, 7, 5)).toBe(CELL_VISION.explored);
  kernel.world.destroy(blocker);
  step(kernel, []);
  expect(vision.canSeeCell(1, 7, 5)).toBe(true);
});

test("integer supercover rejects diagonal corner peeking in every quadrant", () => {
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const { kernel, vision, spawn } = fixture({ radius: 6 * 1024 });
      spawn(0, 7, 7);
      spawn(3, 7 + sx, 7);
      step(kernel, []);
      expect(vision.canSeeCell(1, 7 + sx, 7 + sy)).toBe(false);
      expect(vision.canSeeCell(1, 7 + 2 * sx, 7 + 2 * sy)).toBe(false);
    }
});

test("static map opaque props block without becoming ECS entities; a source inside opacity sees only its cell", () => {
  const map = flatMap(16);
  const { kernel, vision, spawn } = fixture({
    radius: 6 * 1024,
    map: {
      ...map,
      objects: [
        {
          definition: (definitions[3] as Definition).id,
          position: [6 * 1024, 5 * 1024],
          rotation: 0,
          owner: "neutral",
        },
      ],
    },
  });
  const scout = spawn(0, 4, 5);
  step(kernel, []);
  expect(kernel.world.query().length).toBe(1);
  expect(vision.canSeeCell(1, 6, 5)).toBe(true);
  expect(vision.canSeeCell(1, 7, 5)).toBe(false);
  kernel.world.set(scout, Transform, "x", 6 * 1024 + 512);
  step(kernel, []);
  expect(vision.canSeeCell(1, 6, 5)).toBe(true);
  expect(vision.canSeeCell(1, 5, 5)).toBe(false);
});

test("explored and off modes remove shroud while unknown Forces still fail closed", () => {
  for (const fog of ["explored", "off"] as const) {
    const { kernel, vision, spawn } = fixture({ fog });
    expect(vision.cellState(1, 15, 15)).toBe(
      fog === "off" ? CELL_VISION.visible : CELL_VISION.explored,
    );
    const scout = spawn(0, 5, 5);
    step(kernel, []);
    expect(vision.canSeeCell(1, 5, 5)).toBe(true);
    kernel.world.destroy(scout);
    step(kernel, []);
    expect(vision.cellState(1, 5, 5)).toBe(
      fog === "off" ? CELL_VISION.visible : CELL_VISION.explored,
    );
    expect(vision.cellState(99, 5, 5)).toBe(CELL_VISION.shroud);
    const before = checkpointHash(kernel);
    const state = vision.serialize();
    vision.load(state);
    expect(checkpointHash(kernel)).toBe(before);
    const bad = structuredClone(state);
    (bad.groups[0]?.explored as number[])[0] = 0;
    expect(() => vision.load(bad)).toThrow("Invalid vision state");
  }
});

test("explored memory is canonical, copied, restored atomically, and derived stamps rebuild after load", () => {
  const { kernel, vision, spawn } = fixture();
  const scout = spawn(0, 5, 5);
  step(kernel, []);
  const initial = vision.serialize();
  const initialGrid = vision.copyGrid(1);
  kernel.world.set(scout, Transform, "x", 10 * 1024 + 512);
  step(kernel, []);
  const traveled = vision.serialize();
  kernel.world.set(scout, Transform, "x", 5 * 1024 + 512);
  step(kernel, []);
  const traveledHash = checkpointHash(kernel);
  vision.load(initial);
  expect(vision.copyGrid(1)).toEqual(initialGrid);
  expect(checkpointHash(kernel)).not.toBe(traveledHash);
  vision.load(traveled);
  expect(checkpointHash(kernel)).toBe(traveledHash);
  const before = vision.serialize();
  const invalid: unknown[] = [
    null,
    {},
    { ...before, width: 8 },
    { ...before, mode: 2 },
    { ...before, extra: 0 },
    { ...before, groups: [...before.groups].reverse() },
    { ...before, groups: Array(3) },
    {
      ...before,
      groups: before.groups.map((group, i) => (i ? group : { ...group, explored: Array(256) })),
    },
    {
      ...before,
      groups: before.groups.map((group, i) =>
        i ? group : { ...group, explored: [...group.explored.slice(0, -1), 0.5] },
      ),
    },
  ];
  for (const value of invalid) {
    expect(() => vision.load(value)).toThrow();
    expect(vision.serialize()).toEqual(before);
  }
  for (const group of traveled.groups) (group.explored as number[]).fill(0);
  expect(vision.serialize()).toEqual(before);
  kernel.world.destroy(scout);
  step(kernel, []);
  expect(vision.copyGrid(1)?.cells.some((state) => state === CELL_VISION.visible)).toBe(false);
});

test("vision runs after movement/destruction and before snapshot, preserving the previous AI observation", () => {
  const kernel = createKernel({ seed: 1, debug: true, map: flatMap(16) });
  register(kernel, entitiesFeature(definitions));
  const definition = definitions[0] as Definition;
  const scout = spawnEntity(kernel, 0, definition, {
    definition: definition.id,
    force: 1,
    x: 5 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  let destroy = false;
  const observed: boolean[] = [];
  register(kernel, {
    systems: {
      movement: [() => kernel.world.set(scout, Transform, "x", 10 * 1024 + 512)],
      destruction: [
        () => {
          if (destroy) kernel.world.destroy(scout);
        },
      ],
    },
  });
  const vision = initializeVision(kernel, {
    definitions,
    forces: [{ index: 1, faction: "faction:test" }],
  });
  registerController(kernel, 1, () => {
    observed.push(vision.canSeeCell(1, 5, 5));
    return [];
  });
  register(kernel, { systems: { snapshot: [() => observed.push(vision.canSeeCell(1, 5, 5))] } });
  step(kernel, []);
  expect(observed).toEqual([true, false]);
  destroy = true;
  step(kernel, []);
  expect(vision.canSeeCell(1, 10, 5)).toBe(false);
});

test("debug can opt into vision without broadening controlled snapshots", () => {
  const setup: MatchSetup = {
    map: flatMap(16),
    seed: 1,
    debug: true,
    forces: [1, 2].map((index) => ({ index, faction: "faction:test" })),
    seats: [1],
    grants: [{ force: 1, seat: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
    definitions,
  };
  const kernel = createMatch(setup);
  expect(kernel.vision).toBeUndefined();
  initializeVision(kernel, setup);
  const definition = definitions[0] as Definition;
  const first = spawnEntity(kernel, 0, definition, {
    definition: definition.id,
    force: 1,
    x: 5 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  const enemy = spawnEntity(kernel, 0, definition, {
    definition: definition.id,
    force: 2,
    x: 6 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  step(kernel, []);
  expect(kernel.vision?.canSeeEntity(1, enemy)).toBe(true);
  expect(createProjection(setup, 1, "controlled").snapshot(kernel).entities).toHaveLength(1);
  kernel.world.destroy(first);
  step(kernel, []);
  expect(kernel.vision?.canSeeEntity(1, enemy)).toBe(false);
});

test("authored vision converts once, validates its bounded integer range and rejects prop sources", () => {
  expect(toDefinition({ id: "unit:test/scout", health: 1, vision: 1.25 }).visionSubcells).toBe(
    1280,
  );
  for (const vision of [-1, 41, Number.NaN])
    expect(() => toDefinition({ id: "unit:test/scout", health: 1, vision })).toThrow();
  expect(() => toDefinition({ id: "prop:test/tree", vision: 1 })).toThrow("only units/structures");
  const blind = fixture();
  blind.spawn(5, 5, 5);
  step(blind.kernel, []);
  expect(blind.vision.copyGrid(1)?.cells.every((state) => state === CELL_VISION.shroud)).toBe(true);
});
