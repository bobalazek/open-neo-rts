import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type PackInput, resolvePacks, schemaRef } from "@open-neo-rts/content";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { createMatchKeyframe } from "../../snapshots";
import { flatMap } from "../../testing/maps";
import { AttackOrder } from "../combat";
import { ConstructionSite } from "../construction";
import { ConstructionPayment } from "../construction/sites";
import { StructurePower } from "../economy";
import {
  compileGameplayCatalog,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
} from "../entities";
import { Remains, SalvageOrder } from "../salvage";
import { createNormalMatchSetup } from "./normal-match";

const root = new URL("../../../../../content/core/", import.meta.url);
const files = [
  "factions/eastern-collective/faction.json",
  ...[
    "command-center",
    "industrial-reactor",
    "supply-depot",
    "barracks-complex",
    "war-factory",
  ].map((id) => `factions/eastern-collective/structures/${id}/structure.json`),
  ...["field-technician", "supply-truck", "collective-soldier", "dragon-tank"].map(
    (id) => `factions/eastern-collective/units/${id}/unit.json`,
  ),
  "neutral/structures/resource-extractor/structure.json",
];
const json = new Map<string, unknown>(),
  groups: Record<string, string[]> = {},
  layers = new Map<string, Uint8Array>();
for (const file of files) {
  const data = JSON.parse(readFileSync(new URL(file, root), "utf8"));
  const kind = String(data.id).split(":")[0] as "unit" | "structure" | "faction";
  data.$schema = schemaRef(file, kind);
  json.set(file, data);
  groups[`${kind}s`] ??= [];
  groups[`${kind}s`]?.push(file);
  // Asset validation belongs to the content suite; these tests compile original gameplay JSON only.
  for (const asset of [
    data.presentation?.model,
    data.presentation?.icon,
    data.presentation?.wreck,
    ...Object.values(data.presentation?.sounds ?? {}),
  ])
    if (asset) layers.set(file.slice(0, file.lastIndexOf("/") + 1) + asset, new Uint8Array([1]));
}
json.set("manifest.json", {
  $schema: schemaRef("manifest.json", "manifest"),
  id: "core",
  version: "0.1.0",
  engine: ">=0.1.0",
  name: "Original tier one test",
  description: "Original roster in a small deterministic match.",
  dependencies: {},
  files: groups,
});
const input: PackInput = { id: "core", json, layers, files: [...json.keys(), ...layers.keys()] };
const catalog = compileGameplayCatalog(resolvePacks([input], "0.1.0"));
const structure = (name: string) => `core.structure:eastern-collective/${name}`;
const unit = (name: string) => `core.unit:eastern-collective/${name}`;
function setup(bots = true): MatchSetup {
  const map = flatMap(48);
  return createNormalMatchSetup({
    catalog,
    seed: 7,
    map: {
      ...map,
      spawns: [{ id: "west", position: [12 * 1024, 12 * 1024], facing: 0x4000 }],
      resources: [
        { kind: "ore", position: [18 * 1024, 15 * 1024], radius: 2 * 1024, amount: 50000 },
        { kind: "materials", position: [18 * 1024, 10 * 1024], amount: 5000 },
        { kind: "oil", position: [40 * 1024, 40 * 1024] },
      ],
    },
    mapSupport: { start: "faction", players: { min: 1, max: 1 } },
    forces: [{ index: 1, faction: "core.faction:eastern-collective", team: 1, spawn: "west" }],
    seats: [1, 2],
    grants: [1, 2].map((seat) => ({
      seat,
      force: 1,
      scopes: ["unit.orders", "economy.build", "production.queue"],
      grantedAtTick: 0,
    })),
    ...(bots && { bots: [{ seat: 1, kind: "basic-skirmish", force: 1 }] }),
  });
}
const ids = (kernel: ReturnType<typeof createMatch>, definition: string) =>
  kernel.world
    .query(Template)
    .filter(
      (id) =>
        kernel.world.get(id, Template, "definition") ===
        catalog.definitions.findIndex((row) => row.id === definition),
    );

test("normal basic skirmish validates explicit Force, approved roster and scoped starting grants", () => {
  const value = setup();
  expect(createMatch(value).bots?.hasSeat(1)).toBe(true);
  const normal = value.normal;
  if (!normal) throw new Error("Missing normal setup");
  for (const bot of [
    { seat: 1, kind: "basic-skirmish" },
    { seat: 1, kind: "basic-skirmish", force: 2 },
    { seat: 1, kind: "idle", force: 1 },
  ])
    expect(() => createMatch({ ...value, normal: { ...normal, bots: [bot as never] } })).toThrow();
  expect(() =>
    createMatch({
      ...value,
      grants: value.grants.map((row) =>
        row.seat === 1 ? { ...row, scopes: ["unit.orders"] } : row,
      ),
    }),
  ).toThrow("grants");
  expect(() =>
    createMatch({ ...value, forces: [{ index: 1, faction: "core.faction:phoenix-initiative" }] }),
  ).toThrow("Eastern Collective");
});

test("original tier-one bot pays/builds its base, harvests, extracts materials and produces a real Dragon Tank", () => {
  const kernel = createMatch(setup());
  let ticks = 0,
    bounded = true;
  while (!ids(kernel, unit("dragon-tank")).length && ticks < 10000) {
    step(kernel, []);
    ticks++;
    bounded &&= (kernel.bots?.serialize().bots[0]?.used ?? 0) <= 64;
  }
  const completed = kernel.world
    .query(Template)
    .filter((id) => !kernel.world.has(id, ConstructionSite))
    .map((id) => catalog.definitions[kernel.world.get(id, Template, "definition")]?.id);
  expect(completed).toEqual(
    expect.arrayContaining([
      structure("industrial-reactor"),
      structure("supply-depot"),
      structure("barracks-complex"),
      structure("war-factory"),
      "core.structure:neutral/resource-extractor",
      unit("dragon-tank"),
    ]),
  );
  expect(bounded).toBe(true);
  expect(
    kernel.world.query(OwnerForce).every((id) => kernel.world.get(id, OwnerForce, "force") === 1),
  ).toBe(true);
  const built = kernel.log.flatMap((entry) => {
    const command = entry.command as { type?: string; payload?: { definition?: string } };
    return entry.result === "accepted" && command.type === "economy.build"
      ? [command.payload?.definition]
      : [];
  });
  expect(built.slice(0, 4)).toEqual([
    structure("industrial-reactor"),
    structure("supply-depot"),
    structure("barracks-complex"),
    structure("war-factory"),
  ]);
  expect(
    kernel.log.some((entry) =>
      String((entry.command as { type: string }).type).startsWith("debug."),
    ),
  ).toBe(false);
  expect(
    kernel.log.some((entry) => (entry.command as { type: string }).type === "unit.attackMove"),
  ).toBe(true);
  // Existing completed structures + paid Dragon exceed the 5,000 initial credits; income was necessary.
  expect(kernel.economy?.balance(1)?.materials).toBeGreaterThanOrEqual(0);
}, 30000);

test("a hosted bot scouts and clears a destroyed remote extractor, then rebuilds and extracts after restore", () => {
  const value = setup();
  const normal = value.normal!;
  value.normal = {
    ...normal,
    settings: { ...normal.settings, startingCredits: 10000 },
    forces: normal.forces.map((force) => ({
      ...force,
      start: { ...force.start, resources: { ...force.start.resources, credits: 10000 } },
    })),
  };
  value.map = {
    ...value.map,
    resources: [
      { kind: "ore", position: [18 * 1024, 15 * 1024], radius: 2 * 1024, amount: 50000 },
      { kind: "materials", position: [30 * 1024, 10 * 1024], amount: 5000 },
    ],
  };
  const kernel = createMatch(value);
  const spawn = (id: string, x: number, y: number) => {
    const index = catalog.definitions.findIndex((definition) => definition.id === id);
    const entity = spawnEntity(kernel, index, catalog.definitions[index]!, {
      definition: id,
      force: 1,
      x: x * 1024,
      y: y * 1024,
      facing: 0x4000,
    });
    const cost = catalog.definitions[index]!.construction!.cost;
    expect(kernel.economy?.spend(1, 1, cost, "economy.build").ok).toBe(true);
    kernel.world.add(entity, ConstructionPayment, {
      credits: cost.credits ?? 0,
      materials: cost.materials ?? 0,
      industrialCapacity: cost["industrial-capacity"] ?? 0,
      salvagePoints: cost["salvage-points"] ?? 0,
    });
    return entity;
  };
  // Fixture only: pay for completed original buildings to isolate recovery from their build durations.
  spawn(structure("industrial-reactor"), 6, 10);
  spawn(structure("supply-depot"), 10, 4);
  spawn(structure("barracks-complex"), 17, 10);
  spawn(structure("war-factory"), 10, 17);
  const extractor = "core.structure:neutral/resource-extractor";
  const target = spawn(extractor, 30, 10);
  step(kernel, []);
  kernel.world.set(target, Health, "current", 0);
  step(kernel, []);
  const rubble = kernel.world.query(Remains)[0]!;
  expect(rubble).toBeDefined();
  expect(createProjection(value, 1, "controlled").snapshot(kernel).remains).toEqual([]);
  while (!kernel.world.query(SalvageOrder).length && kernel.tick < 1500) step(kernel, []);
  expect(kernel.world.query(SalvageOrder).length).toBeGreaterThan(0);
  const twin = createMatchKeyframe(kernel, value).restore(value);
  while (kernel.tick < 2000) {
    step(kernel, []);
    step(twin, []);
  }
  expect(checkpointHash(kernel)).toBe(checkpointHash(twin));
  expect(kernel.world.isAlive(rubble)).toBe(false);
  expect(ids(kernel, extractor).some((id) => !kernel.world.has(id, ConstructionSite))).toBe(true);
  expect(
    kernel.log.some(
      (entry) =>
        entry.source === "controller" &&
        entry.result === "accepted" &&
        (entry.command as { type: string }).type === "economy.salvage",
    ),
  ).toBe(true);
  expect(kernel.economy?.balance(1)?.materials).toBeGreaterThan(10);
}, 30_000);

test("bot decision memory, private mappings, random stream and queues restore with deterministic twin continuation", () => {
  const value = setup(),
    a = createMatch(value),
    b = createMatch(value);
  for (let i = 0; i < 350; i++) {
    step(a, []);
    step(b, []);
  }
  const saved = a.bots?.serialize();
  if (!saved || !a.bots) throw new Error("Missing host");
  const hash = checkpointHash(a);
  const malformed = structuredClone(saved);
  const memory = malformed.bots[0]?.state.memory;
  if (!memory) throw new Error("Missing policy memory");
  memory.placement = 0.5;
  expect(() => a.bots?.load(malformed)).toThrow("memory");
  expect(checkpointHash(a)).toBe(hash);
  a.queued = [];
  a.bots.load(saved);
  for (let i = 0; i < 200; i++) {
    step(a, []);
    step(b, []);
  }
  expect(checkpointHash(a)).toBe(checkpointHash(b));
  expect(a.log).toEqual(b.log);
});

test("the normal basic policy attacks a currently observed hostile through opaque host commands", () => {
  const value = setup(),
    normal = value.normal;
  if (!normal) throw new Error("Missing normal setup");
  const west = normal.forces[0];
  if (!west) throw new Error("Missing Force");
  const kernel = createMatch({
    ...value,
    map: {
      ...value.map,
      spawns: [
        ...value.map.spawns,
        { id: "east", position: [36 * 1024, 36 * 1024], facing: 0x4000 },
      ],
    },
    forces: [...value.forces, { index: 2, faction: "core.faction:eastern-collective" }],
    grants: value.grants.map((grant) => (grant.seat === 2 ? { ...grant, force: 2 } : grant)),
    normal: {
      ...normal,
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      forces: [west, { ...west, index: 2, team: 2, spawn: "east" }],
    },
  });
  const enemy = ids(kernel, unit("collective-soldier")).find(
    (id) => kernel.world.get(id, OwnerForce, "force") === 2,
  ) as number;
  kernel.world.set(enemy, Transform, "x", 15 * 1024 + 512);
  kernel.world.set(enemy, Transform, "y", 15 * 1024 + 512);
  kernel.vision?.update();
  kernel.visibility?.update();
  kernel.captureObservations?.();
  const observedHealth = kernel.world.get(enemy, Health, "current");
  step(kernel, []);
  step(kernel, []);
  expect(
    kernel.log.some(
      (entry) =>
        entry.source === "controller" &&
        entry.result === "accepted" &&
        (entry.command as { type: string }).type === "unit.attack",
    ),
  ).toBe(true);
  expect(
    kernel.world
      .query(AttackOrder)
      .some((id) => kernel.world.get(id, AttackOrder, "target") === enemy),
  ).toBe(true);
  const saved = kernel.bots?.serialize();
  if (!saved || !kernel.bots) throw new Error("Missing bot state");
  expect(saved.bots[0]?.state.memory?.goal?.health).toBe(observedHealth);
  const before = checkpointHash(kernel);
  for (const health of [0, 100.5, 0x100000000]) {
    const malformed = structuredClone(saved),
      goal = malformed.bots[0]?.state.memory?.goal;
    if (!goal) throw new Error("Missing observed assault goal");
    goal.health = health;
    expect(() => kernel.bots?.load(malformed)).toThrow("memory");
    expect(checkpointHash(kernel)).toBe(before);
  }
  kernel.queued = [];
  kernel.bots.load(saved);
  expect(checkpointHash(kernel)).toBe(before);
});

test("lost builders are replaced by the real headquarters queue and manually disabled power is restored", () => {
  const kernel = createMatch(setup());
  for (const id of ids(kernel, unit("field-technician"))) kernel.world.destroy(id);
  const hq = ids(kernel, structure("command-center"))[0] as number;
  kernel.world.set(hq, StructurePower, "enabled", 0);
  kernel.captureObservations?.();
  let ticks = 0;
  while (
    (!ids(kernel, unit("field-technician")).length ||
      !kernel.world.get(hq, StructurePower, "enabled")) &&
    ticks++ < 500
  )
    step(kernel, []);
  expect(ids(kernel, unit("field-technician"))).not.toHaveLength(0);
  expect(kernel.world.get(hq, StructurePower, "enabled")).toBe(1);
  expect(kernel.economy?.balance(1)?.credits).toBeLessThan(5000);
});

test("a hosted bot pays for and legally outputs reinforcements when its 24 survivors retreat", () => {
  const kernel = createMatch(setup());
  const spawn = (id: string, x: number, y: number) => {
    const index = catalog.definitions.findIndex((definition) => definition.id === id);
    const definition = catalog.definitions[index];
    if (!definition) throw new Error("Missing original definition");
    return spawnEntity(kernel, index, definition, {
      definition: id,
      force: 1,
      x,
      y,
      facing: 0x4000,
    });
  };
  // Fixture only: a completed original producer and wounded reserves isolate the observed starvation.
  spawn(structure("barracks-complex"), 26 * 1024, 20 * 1024);
  while (ids(kernel, unit("collective-soldier")).length < 24)
    spawn(unit("collective-soldier"), 8 * 1024, 8 * 1024);
  for (const id of ids(kernel, unit("collective-soldier")))
    kernel.world.set(id, Health, "current", 34);
  kernel.vision?.update();
  kernel.visibility?.update();
  kernel.captureObservations?.();
  expect(ids(kernel, unit("collective-soldier"))).toHaveLength(24);
  const before = kernel.economy?.balance(1)?.credits;
  for (let tick = 0; tick < 500 && ids(kernel, unit("collective-soldier")).length === 24; tick++)
    step(kernel, []);
  expect(ids(kernel, unit("collective-soldier")).length).toBeGreaterThan(24);
  expect(kernel.economy?.balance(1)?.credits).toBeLessThan(before!);
  expect(
    kernel.log.some((entry) => {
      const command = entry.command as { type?: string; payload?: { definition?: string } };
      return (
        entry.result === "accepted" &&
        command.type === "production.enqueue" &&
        command.payload?.definition === unit("collective-soldier")
      );
    }),
  ).toBe(true);
  expect(
    kernel.log.some((entry) => (entry.command as { type: string }).type.startsWith("debug.")),
  ).toBe(false);
});

test("discovered node observations follow canonical exploration and active grants without stock or claims", () => {
  const original = setup(false),
    value = { ...original, seats: [...original.seats, 3] },
    kernel = createMatch(value);
  const projection = createProjection(value, 1, "controlled");
  const initial = projection.snapshot(kernel);
  expect(initial.resourceNodes).toEqual([{ kind: "materials", x: 17 * 1024, y: 9 * 1024 }]);
  const builder = ids(kernel, unit("field-technician"))[0] as number;
  kernel.world.set(builder, Transform, "x", 40 * 1024);
  kernel.world.set(builder, Transform, "y", 40 * 1024);
  kernel.vision?.update();
  kernel.visibility?.update();
  kernel.captureObservations?.();
  const observed = kernel.observe?.(1);
  expect(observed?.resourceNodes).toHaveLength(2);
  if (observed?.resourceNodes?.[0]) observed.resourceNodes[0].x = 0;
  expect(kernel.observe?.(1)?.resourceNodes?.[0]?.x).toBe(17 * 1024);
  kernel.world.set(builder, Transform, "x", 12 * 1024);
  kernel.world.set(builder, Transform, "y", 12 * 1024);
  kernel.vision?.update();
  expect(projection.snapshot(kernel).resourceNodes).toHaveLength(2);
  expect(createProjection(value, 3, "controlled").snapshot(kernel).resourceNodes).toEqual([]);
  // Static discovery survives depleted/removed operating rows; it carries no live remaining stock.
  for (const id of kernel.world.query(Health)) kernel.world.set(id, Health, "current", 0);
  expect(Object.keys(projection.snapshot(kernel).resourceNodes?.[0] ?? {}).sort()).toEqual([
    "kind",
    "x",
    "y",
  ]);
});
