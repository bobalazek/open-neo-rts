import { expect, test } from "bun:test";
import type { Grant } from "../commands";
import {
  BuilderConstruction,
  ConstructionApproach,
  ConstructionProgress,
  ConstructionSite,
  constructionStage,
} from "../features/construction";
import {
  type Definition,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
} from "../features/entities";
import { canObserveEventSource, emitProductionExit } from "../features/events";
import { MoveIntent } from "../features/movement";
import { checkpointHash, register, registerController, step } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { flatMap } from "../testing/maps";
import { createProjection } from ".";

const definitions: Definition[] = [
  {
    id: "structure:test/headquarters",
    health: 100,
    speed: 0,
    turnRate: 0,
    role: "headquarters",
    footprint: [1, 1],
    visionSubcells: 1024,
    power: 20,
  },
  {
    id: "unit:test/scout",
    health: 20,
    speed: 1024,
    turnRate: 65536,
    domain: "foot",
    radiusSubcells: 0,
    role: "builder",
    builds: ["structure:test/factory"],
    visionSubcells: 3 * 1024,
  },
  {
    id: "structure:test/factory",
    health: 200,
    speed: 0,
    turnRate: 0,
    role: "production",
    footprint: [2, 1],
    power: -5,
    construction: { cost: { credits: 0 }, buildTicks: 10 },
  },
];

function fixture(shared = false) {
  const map = flatMap(48);
  const grants: Grant[] = [
    { seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
    { seat: 2, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 },
    { seat: 4, force: 1, scopes: ["economy.build"], grantedAtTick: 0 },
    { seat: 5, force: 1, scopes: ["unit.orders"], grantedAtTick: 0, expiresAtTick: 3 },
    { seat: 6, force: 1, scopes: [], grantedAtTick: 0 },
    { seat: 7, force: 1, scopes: ["economy.build"], grantedAtTick: 2, expiresAtTick: 3 },
  ];
  const setup: MatchSetup = {
    map: {
      ...map,
      spawns: [1, 2, 3].map((index) => ({
        id: `spawn-${index}`,
        position: [index * 12 * 1024, 12 * 1024] as const,
        facing: 0x4000,
      })),
    },
    seed: 1,
    debug: false,
    definitions,
    forces: [1, 2, 3].map((index) => ({ index, faction: "faction:test" })),
    seats: [1, 2, 3, 4, 5, 6, 7],
    grants: [
      ...grants,
      { seat: 3, force: 3, scopes: ["unit.orders"], grantedAtTick: 0, revokedAtTick: 0 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 3, max: 3 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150 },
      forces: [1, 2, 3].map((index) => ({
        index,
        team: shared && index === 2 ? 1 : index,
        spawn: `spawn-${index}`,
        start: {
          structures: [definitions[0]?.id as string],
          units: [{ unit: definitions[1]?.id as string, count: 1, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  // Normal initialization requires a controller for each Force at tick zero.
  setup.grants = [
    ...setup.grants,
    { seat: 2, force: 3, scopes: ["unit.orders"], grantedAtTick: 0, expiresAtTick: 1 },
  ];
  const kernel = createMatch(setup);
  for (const id of kernel.world.query(Template)) kernel.world.destroy(id);
  const spawn = (definition: number, force: number, x: number, y: number) => {
    const def = definitions[definition] as Definition;
    return spawnEntity(kernel, definition, def, {
      definition: def.id,
      force,
      x: x * 1024 + (definition === 1 ? 512 : 0),
      y: y * 1024 + (definition === 1 ? 512 : 0),
      facing: 0x4000,
    });
  };
  const scout = spawn(1, 1, 8, 8),
    ally = spawn(1, 2, 30, 8),
    enemy = spawn(1, 3, 10, 8),
    hidden = spawn(1, 3, 35, 35);
  const factory = spawn(2, 3, 10, 9);
  const refresh = () => {
    kernel.vision?.update();
    kernel.visibility?.update();
  };
  refresh();
  const projection = createProjection(setup, 1, "controlled");
  return { kernel, setup, scout, ally, enemy, hidden, factory, spawn, refresh, projection };
}

test("visible active builders expose only a public tool target, never private work or hidden associations", () => {
  const f = fixture();
  const world = f.kernel.world;
  world.add(f.factory, ConstructionSite);
  world.add(f.factory, ConstructionProgress, { completedTicks: 3, buildersWorking: 1 });
  world.add(f.enemy, BuilderConstruction, { target: f.factory });
  world.add(f.enemy, ConstructionApproach, {
    site: f.factory,
    state: 1,
    x: world.get(f.enemy, Transform, "x"),
    y: world.get(f.enemy, Transform, "y"),
  });
  const pose = () => {
    const view = f.projection.snapshot(f.kernel);
    const builder = view.entities.find(
      (entity) => entity.force === 3 && entity.definition === definitions[1]!.id,
    );
    const site = view.entities.find((entity) => entity.definition === definitions[2]!.id);
    expect(builder?.constructionOrder).toBeUndefined();
    expect(site?.construction).toBeUndefined();
    return { view, builder, site };
  };
  const first = pose();
  expect(first.builder?.buildTarget).toBe(first.site?.handle);
  expect(first.builder?.buildTarget).toBeDefined();
  const hash = checkpointHash(f.kernel);
  pose();
  expect(checkpointHash(f.kernel)).toBe(hash);
  world.set(f.factory, ConstructionProgress, "buildersWorking", 0);
  expect(pose().builder?.buildTarget).toBeUndefined();
  world.set(f.factory, ConstructionProgress, "buildersWorking", 1);
  world.set(f.enemy, ConstructionApproach, "state", 0);
  expect(pose().builder?.buildTarget).toBeUndefined();
  world.set(f.enemy, ConstructionApproach, "state", 1);
  world.add(f.enemy, MoveIntent, { x: 12 * 1024, y: 8 * 1024 });
  expect(pose().builder?.buildTarget).toBeUndefined();
  world.remove(f.enemy, MoveIntent);
  world.set(f.enemy, ConstructionApproach, "x", 12 * 1024);
  expect(pose().builder?.buildTarget).toBeUndefined();
  world.set(f.enemy, ConstructionApproach, "x", world.get(f.enemy, Transform, "x"));
  world.set(f.factory, Transform, "x", 35 * 1024);
  world.set(f.factory, Transform, "y", 35 * 1024);
  f.refresh();
  const hiddenSite = pose();
  expect(hiddenSite.builder).toBeDefined();
  expect(hiddenSite.builder?.buildTarget).toBeUndefined();
  expect(hiddenSite.site).toBeUndefined();
  expect(hiddenSite.view.ghosts?.some((ghost) => "buildTarget" in ghost)).toBe(false);
  world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  world.set(f.scout, Transform, "y", 20 * 1024 + 512);
  f.refresh();
  expect(pose().builder).toBeUndefined();
});

test("normal controlled snapshots expose only own and sight-visible entities, copied group fog, and scoped private data", () => {
  const f = fixture(true);
  f.kernel.world.add(f.enemy, MoveIntent, { x: 40 * 1024, y: 40 * 1024 });
  f.kernel.world.add(f.factory, ConstructionSite);
  f.kernel.world.add(f.factory, ConstructionProgress, {
    completedTicks: 3,
    quarter: 1,
    buildersWorking: 2,
  });
  const snapshot = f.projection.snapshot(f.kernel);
  expect(snapshot.entities.map((entity) => entity.force)).toEqual([1, 2, 3, 3]);
  expect(snapshot.fog?.map((grid) => grid.group)).toEqual([1]);
  const enemy = snapshot.entities.find(
    (entity) => entity.force === 3 && entity.definition.includes("unit:"),
  );
  const factory = snapshot.entities.find((entity) => entity.definition.includes("factory"));
  expect(enemy?.order).toBeNull();
  expect(factory?.constructionSite).toBe(true);
  expect(factory?.constructionStage).toBe(32);
  expect(factory?.construction).toBeUndefined();
  expect(factory?.power).toBeUndefined();
  expect(factory?.extraction).toBeUndefined();
  expect(snapshot.banks).toEqual([]);
  expect(snapshot.power).toEqual([]);
  expect(f.projection.resolve(enemy?.handle)).toBe(f.enemy);
  expect(f.projection.resolve(enemy?.handle, "unit.orders")).toBeUndefined();
  const grid = snapshot.fog?.[0];
  if (!grid) throw new Error("Missing fog grid");
  grid.cells.fill(2);
  expect(f.projection.snapshot(f.kernel).fog?.[0]?.cells[47 * 48 + 47]).toBe(0);
  const economic = createProjection(f.setup, 4, "controlled").snapshot(f.kernel);
  expect(economic.banks?.map((bank) => bank.force)).toEqual([1]);
  expect(economic.entities.find((entity) => entity.force === 3)?.power).toBeUndefined();
  expect(createProjection(f.setup, 6, "controlled").snapshot(f.kernel)).toMatchObject({
    entities: [],
    fog: [],
    ghosts: [],
    banks: [],
    power: [],
  });
  expect(createProjection(f.setup, 3, "controlled").snapshot(f.kernel).entities).toEqual([]);
});

test("hidden units disappear and stale live/ghost handles cannot resolve, including between snapshots and grant expiry", () => {
  const f = fixture();
  const first = f.projection.snapshot(f.kernel);
  const handle = first.entities.find(
    (entity) => entity.force === 3 && entity.definition.includes("unit:"),
  )?.handle;
  expect(f.projection.resolve(handle)).toBe(f.enemy);
  f.kernel.world.set(f.enemy, Transform, "x", 35 * 1024 + 512);
  expect(f.projection.resolve(handle)).toBeUndefined();
  f.refresh();
  expect(
    f.projection
      .snapshot(f.kernel)
      .entities.filter((entity) => entity.force === 3 && entity.definition.includes("unit:")),
  ).toEqual([]);
  const expiring = createProjection(f.setup, 5, "controlled");
  const own = expiring.snapshot(f.kernel).entities.find((entity) => entity.force === 1)?.handle;
  f.kernel.tick = 3;
  expect(expiring.resolve(own)).toBeUndefined();
  expect(expiring.snapshot(f.kernel)).toMatchObject({ entities: [], fog: [], ghosts: [] });
  f.kernel.world.set(f.enemy, Transform, "x", 10 * 1024 + 512);
  f.refresh();
  const next = f.projection
    .snapshot(f.kernel)
    .entities.find((entity) => entity.force === 3 && entity.definition.includes("unit:"))?.handle;
  expect(next).not.toBe(handle);
  expect(f.projection.resolve(handle)).toBeUndefined();
});

test("structure ghosts retain the observed health, ownership and site state through hidden changes and death until re-observed", () => {
  const f = fixture();
  f.kernel.world.add(f.factory, ConstructionSite);
  f.kernel.world.add(f.factory, ConstructionProgress, {
    completedTicks: 3,
    quarter: 1,
    buildersWorking: 2,
  });
  f.refresh();
  f.projection.snapshot(f.kernel);
  f.kernel.world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  f.kernel.world.set(f.scout, Transform, "y", 20 * 1024 + 512);
  f.refresh();
  const ghost = f.projection.snapshot(f.kernel).ghosts?.[0];
  expect(ghost).toMatchObject({
    definition: definitions[2]?.id,
    health: 200,
    force: 3,
    constructionSite: true,
    constructionStage: 32,
  });
  expect(f.projection.resolve(ghost?.handle)).toBeUndefined();
  f.kernel.world.set(f.factory, ConstructionProgress, "completedTicks", 8);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts?.[0]?.constructionStage).toBe(32);
  f.kernel.world.set(f.factory, Health, "current", 1);
  f.kernel.world.set(f.factory, OwnerForce, "force", 2);
  f.kernel.world.remove(f.factory, ConstructionSite);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts?.[0]).toEqual(ghost);
  f.kernel.world.destroy(f.factory);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts?.[0]).toEqual(ghost);
  const recreated = createProjection(f.setup, 1, "controlled").snapshot(f.kernel);
  expect(recreated.ghosts?.[0]).toEqual(ghost);
  f.kernel.world.set(f.scout, Transform, "x", 8 * 1024 + 512);
  f.kernel.world.set(f.scout, Transform, "y", 8 * 1024 + 512);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts).toEqual([]);
});

test("producer exits disclose only currently projected actors without allocating hidden handles or animating ghosts", () => {
  const f = fixture();
  const initial = f.projection.snapshot(f.kernel),
    allocation = f.projection.serialize();
  emitProductionExit(f.kernel, f.factory);
  emitProductionExit(f.kernel, f.hidden);
  emitProductionExit(f.kernel, 1000000);
  const packet = f.projection.snapshot(f.kernel);
  const factory = initial.entities.find((row) => f.projection.resolve(row.handle) === f.factory)!;
  expect(packet.productionExits).toEqual([factory.handle]);
  expect(f.projection.serialize()).toEqual(allocation);
  expect(packet.entities.find((row) => row.handle === factory.handle)?.production).toBeUndefined();
  f.kernel.world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  f.kernel.world.set(f.scout, Transform, "y", 20 * 1024 + 512);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).productionExits).toEqual([]);
  expect(
    f.projection.snapshot(f.kernel).ghosts?.some((row) => row.definition.includes("factory")),
  ).toBe(true);
});

test("memory is canonical and copied, rejects malformed loads atomically, and does not depend on projector polling", () => {
  const f = fixture();
  f.kernel.world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  f.refresh();
  const memory = f.kernel.visibility;
  if (!memory) throw new Error("Missing memory");
  const state = memory.serialize(),
    hash = checkpointHash(f.kernel);
  for (let i = 0; i < 4; i++) f.projection.snapshot(f.kernel);
  expect(checkpointHash(f.kernel)).toBe(hash);
  const empty = { ...state, groups: state.groups.map((group) => ({ ...group, records: [] })) };
  memory.load(empty);
  expect(checkpointHash(f.kernel)).not.toBe(hash);
  memory.load(state);
  expect(checkpointHash(f.kernel)).toBe(hash);
  for (const value of [
    null,
    { ...state, extra: 1 },
    { ...state, format: 1 },
    ...[-1, 101, 0.5, undefined, 0].map((stage) => ({
      ...state,
      groups: state.groups.map((group) => ({
        ...group,
        records: group.records.map((record) => ({ ...record, stage })),
      })),
    })),
    { ...state, groups: [...state.groups].reverse() },
    { ...state, groups: Array(state.groups.length) },
    {
      ...state,
      groups: state.groups.map((group) => ({
        ...group,
        records: [...group.records, ...group.records],
      })),
    },
    {
      ...state,
      groups: state.groups.map((group) => ({
        ...group,
        records: group.records.map((record) => ({ ...record, definition: 1 })),
      })),
    },
  ]) {
    expect(() => memory.load(value)).toThrow();
    expect(memory.serialize()).toEqual(state);
  }
  for (const group of state.groups) group.records.length = 0;
  expect(checkpointHash(f.kernel)).toBe(hash);
});

test("public construction stages clamp quarter-work and disappear only on actual completion", () => {
  const f = fixture();
  const definition = definitions[2]!;
  f.kernel.world.add(f.factory, ConstructionSite);
  expect(constructionStage(f.kernel, f.factory, definition)).toBe(0);
  f.kernel.world.add(f.factory, ConstructionProgress, { completedTicks: 9, quarter: 3 });
  expect(constructionStage(f.kernel, f.factory, definition)).toBe(97);
  expect(
    constructionStage(f.kernel, f.factory, {
      ...definition,
      construction: { cost: {}, buildTicks: 0 },
    }),
  ).toBe(0);
  f.kernel.world.set(f.factory, ConstructionProgress, "completedTicks", 11);
  expect(constructionStage(f.kernel, f.factory, definition)).toBe(100);
  f.kernel.world.remove(f.factory, ConstructionSite);
  const completed = f.projection
    .snapshot(f.kernel)
    .entities.find((row) => row.definition === definition.id);
  expect(completed).toBeDefined();
  expect(completed?.constructionStage).toBeUndefined();
  expect(completed?.constructionSite).toBeUndefined();
});

test("re-observation refreshes structure state and replaces a remembered destroyed structure without retaining its ghost", () => {
  const f = fixture();
  f.kernel.world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts?.[0]?.health).toBe(200);
  f.kernel.world.set(f.factory, Health, "current", 7);
  f.kernel.world.set(f.scout, Transform, "x", 8 * 1024 + 512);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts).toEqual([]);
  f.kernel.world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts?.[0]?.health).toBe(7);
  f.kernel.world.destroy(f.factory);
  const replacement = f.spawn(2, 3, 10, 9);
  f.kernel.world.set(replacement, Health, "current", 99);
  f.kernel.world.set(f.scout, Transform, "x", 8 * 1024 + 512);
  f.refresh();
  f.kernel.world.set(f.scout, Transform, "x", 20 * 1024 + 512);
  f.refresh();
  expect(f.projection.snapshot(f.kernel).ghosts?.map((ghost) => ghost.health)).toEqual([99]);
});

test("AI receives the completed previous tick's copied permitted observation, with handle-based normal orders", () => {
  const f = fixture();
  step(f.kernel, []);
  const initialX = f.kernel.world.get(f.enemy, Transform, "x");
  register(f.kernel, {
    systems: { ingest: [() => f.kernel.world.set(f.enemy, Transform, "x", 35 * 1024 + 512)] },
  });
  let seen = false;
  registerController(f.kernel, 1, (view) => {
    expect(Object.keys(view).sort()).toEqual(["observation", "tick"]);
    expect("world" in view).toBe(false);
    expect("hash" in view.observation).toBe(false);
    if (view.tick === 1) {
      expect(
        view.observation.entities.find(
          (entity) => entity.force === 3 && entity.definition.includes("unit:"),
        )?.x,
      ).toBe(initialX);
      const handle = view.observation.entities.find((entity) => entity.force === 1)
        ?.handle as string;
      seen = true;
      return [
        {
          type: "unit.move",
          payload: { entities: [handle], x: 9 * 1024 + 512, y: 8 * 1024 + 512 },
        },
      ];
    }
    expect(
      view.observation.entities.some(
        (entity) => entity.force === 3 && entity.definition.includes("unit:"),
      ),
    ).toBe(false);
    return [];
  });
  step(f.kernel, []);
  expect(seen).toBe(true);
  step(f.kernel, []);
  expect(
    f.kernel.log.filter((entry) => entry.source === "controller").map((entry) => entry.result),
  ).toEqual(["accepted"]);
  const first = f.kernel.observe?.(1),
    second = f.kernel.observe?.(1);
  const entity = first?.entities[0];
  if (!entity) throw new Error("Missing own observation");
  entity.health = 0;
  first?.fog?.[0]?.cells.fill(0);
  expect(f.kernel.observe?.(1)).toEqual(second);
});

test("event source seam permits owned victims and visible locations without revealing hidden attacker origins", () => {
  const f = fixture();
  expect(canObserveEventSource(f.kernel, 1, { entity: f.scout })).toBe(true);
  expect(canObserveEventSource(f.kernel, 1, { entity: f.hidden })).toBe(false);
  expect(canObserveEventSource(f.kernel, 1, { x: 8, y: 8 })).toBe(true);
  expect(canObserveEventSource(f.kernel, 1, { x: 35, y: 35 })).toBe(false);
  expect(canObserveEventSource(f.kernel, 6, { entity: f.scout })).toBe(false);
});

test("normal AI rejects raw IDs and noncontrolled enemy handles, and observations expire with grants", () => {
  const f = fixture();
  step(f.kernel, []);
  registerController(f.kernel, 1, ({ tick, observation }) =>
    tick === 1
      ? [
          { type: "unit.move", payload: { entities: [f.scout], x: 8192, y: 8192 } },
          {
            type: "unit.move",
            payload: {
              entities: [
                observation.entities.find((entity) => entity.force === 3)?.handle as string,
              ],
              x: 8192,
              y: 8192,
            },
          },
        ]
      : [],
  );
  registerController(f.kernel, 5, ({ tick, observation }) => {
    if (tick === 3) expect(observation).toMatchObject({ entities: [], fog: [], ghosts: [] });
    return [];
  });
  step(f.kernel, []);
  step(f.kernel, []);
  expect(
    f.kernel.log.filter((entry) => entry.source === "controller").map((entry) => entry.result),
  ).toEqual(["bad_payload", "bad_payload"]);
  step(f.kernel, []);
});

test("scheduled economic grant activation gives AI the same completed-state banks and fog as a human", () => {
  const f = fixture();
  const economic = createProjection(f.setup, 7, "controlled");
  registerController(f.kernel, 7, ({ tick, observation }) => {
    expect(observation.banks).toEqual(economic.snapshot(f.kernel).banks);
    expect(observation.fog).toEqual(economic.snapshot(f.kernel).fog);
    expect(observation.banks?.map((bank) => bank.force)).toEqual(tick === 2 ? [1] : []);
    return [];
  });
  for (let i = 0; i < 4; i++) step(f.kernel, []);
});
