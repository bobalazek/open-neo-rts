import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseTerrain } from "@open-neo-rts/content";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchMap, SIM_VERSION, toMatchResources } from "../../match";
import { parseScenario, runScenario, SCENARIO_FORMAT } from "../../snapshots";
import { StructurePower } from "../economy";
import {
  type Definition,
  type GameplayCatalog,
  type GameplayDefinition,
  Health,
  OwnerForce,
  Template,
  Transform,
  toDefinition,
} from "../entities";
import { createNormalMatchSetup, type NormalMatchOptions } from "./normal-match";

const root = new URL("../../../../../content/core/", import.meta.url);
const json = (file: string) => JSON.parse(readFileSync(new URL(file, root), "utf8"));
const faction = json("factions/eastern-collective/faction.json");
const source = [
  "factions/eastern-collective/structures/command-center/structure.json",
  "factions/eastern-collective/units/field-technician/unit.json",
  "factions/eastern-collective/units/supply-truck/unit.json",
  "factions/eastern-collective/units/collective-soldier/unit.json",
].map(json);
const catalog: GameplayCatalog = {
  gameplayHash: "1234567890abcdef",
  // This task exercises initialization with the owner's starter data; compiler behavior has its own tests.
  definitions: source
    .map(
      (raw): GameplayDefinition => ({
        ...toDefinition({ ...raw, id: `core.${raw.id}` }),
        kind: raw.id.startsWith("unit:") ? "unit" : "structure",
        role: raw.role,
        pop: raw.pop,
        tags: raw.tags ?? [],
        construction: null,
        requires: [],
        producedBy: [],
        produces: [],
        builds: [],
        spawnsWith: [],
        weapons: [],
        abilities: [],
        research: [],
        adjacency: [],
      }),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  factions: [
    {
      id: `core.${faction.id}`,
      start: {
        structures: faction.start.structures.map((id: string) => `core.${id}`),
        units: faction.start.units.map((unit: { unit: string; count: number }) => ({
          unit: `core.${unit.unit}`,
          count: unit.count,
        })),
        resources: faction.start.resources,
      },
    },
  ],
};

function options(): NormalMatchOptions {
  const raw = json("maps/training-grounds/map.json");
  const terrain = parseTerrain(
    raw.size.width,
    raw.size.height,
    {
      height: new Uint8Array(readFileSync(new URL("maps/training-grounds/height.r8", root))),
      ramps: new Uint8Array(readFileSync(new URL("maps/training-grounds/ramps.r8", root))),
    },
    raw.biome,
  );
  const map: MatchMap = {
    id: `core.${raw.id}`,
    terrain: {
      width: terrain.width,
      height: terrain.height,
      level: [...terrain.level],
      ramp: [...terrain.ramp],
      surface: [...terrain.surface],
      water: [...terrain.water],
      biome: [...terrain.biome],
    },
    spawns: raw.spawns.map((spawn: { id: string; position: number[]; facing: number }) => ({
      id: spawn.id,
      position: spawn.position.map((coordinate) => Math.round(coordinate * 1024)),
      facing: Math.round((spawn.facing * 0x10000) / 360),
    })) as MatchMap["spawns"],
    resources: toMatchResources(raw.resources),
    objects: [],
  };
  return {
    map,
    mapSupport: { start: raw.start, players: raw.players },
    seed: 42,
    catalog,
    forces: [
      { index: 2, faction: `core.${faction.id}`, spawn: "south-east", team: 2 },
      { index: 1, faction: `core.${faction.id}`, spawn: "north-west", team: 1 },
    ],
    seats: [2, 1],
    grants: [1, 2].map((seat) => ({
      seat,
      force: seat,
      scopes: ["unit.orders"],
      grantedAtTick: 0,
    })),
  };
}

function state() {
  return createNormalMatchSetup(options());
}

test("normal initialization creates the authored headquarters, two builders, harvester and three infantry per Force without commands", () => {
  const setup = state();
  const kernel = createMatch(setup);
  const ids = kernel.world.query(Template, OwnerForce, Health, Transform);
  expect(checkpointHash(kernel)).toMatchInlineSnapshot(`"6b57c6d06dca4510"`);
  expect(ids).toHaveLength(14);
  expect(kernel.tick).toBe(0);
  expect(kernel.log).toEqual([]);
  expect(kernel.queued).toEqual([]);
  expect(kernel.world.query(StructurePower)).toHaveLength(2);
  for (const force of [1, 2]) {
    expect(kernel.economy?.balance(force)?.credits).toBe(5000);
    expect(kernel.power?.balance(force)).toEqual({ force, used: 0, produced: 20, brownout: false });
    const counts = new Map<string, number>();
    for (const id of ids.filter((id) => kernel.world.get(id, OwnerForce, "force") === force)) {
      const definition = setup.definitions[
        kernel.world.get(id, Template, "definition")
      ] as Definition;
      counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
      expect(kernel.world.get(id, Health, "current")).toBe(definition.health);
    }
    expect(counts).toEqual(
      new Map<string, number>([
        ...(catalog.factions[0]?.start.structures ?? []).map((id): [string, number] => [id, 1]),
        ...(catalog.factions[0]?.start.units ?? []).map(({ unit, count }): [string, number] => [
          unit,
          count,
        ]),
      ]),
    );
    expect(
      setup.normal?.forces.find((entry) => entry.index === force)?.start.resources.credits,
    ).toBe(5000);
  }
  const points = ids.map((id) =>
    [kernel.world.get(id, Transform, "x"), kernel.world.get(id, Transform, "y")].join(":"),
  );
  expect(new Set(points).size).toBe(ids.length);
  expect(createMatch(setup).world.serialize()).toEqual(kernel.world.serialize());
});

test("normal matches reject debug commands and retain real grant checks for ordinary orders", () => {
  const kernel = createMatch(state());
  const entries = step(kernel, [
    {
      tick: 0,
      sequence: 0,
      seat: 0,
      type: "debug.spawn",
      payload: { definition: catalog.definitions[0]?.id, force: 1, x: 0, y: 0, facing: 0 },
    },
    { tick: 0, sequence: 1, seat: 0, type: "debug.remove", payload: { entity: 1 } },
    { tick: 0, sequence: 2, seat: 0, type: "debug.setHealth", payload: { entity: 1, health: 0 } },
    { tick: 0, sequence: 3, seat: 2, type: "unit.stop", payload: { entities: [3] } },
  ]);
  expect(entries.map((entry) => entry.result)).toEqual([
    "debug_only",
    "debug_only",
    "debug_only",
    "no_grant",
  ]);
  expect(kernel.world.query(Template)).toHaveLength(14);
});

test("normal setup survives JSON scenario/worker validation and canonical replays", () => {
  const setup = state();
  const scenario = parseScenario(
    JSON.parse(
      JSON.stringify({ format: SCENARIO_FORMAT, simVersion: SIM_VERSION, setup, commands: [] }),
    ),
  );
  expect(checkpointHash(createMatch(scenario.setup))).toBe(checkpointHash(createMatch(setup)));
  expect(runScenario(scenario, { ticks: 2 })).toMatchInlineSnapshot(`
    [
      {
        "hash": "36853bd25b4f04d0",
        "tick": 2,
      },
    ]
  `);
});

test("Force/seat/grant/key order is canonical, while settings, teams and content identity affect hashes", () => {
  const first = options();
  const initial = createNormalMatchSetup(first);
  const initialHash = checkpointHash(createMatch(initial));
  const reordered = createNormalMatchSetup({
    ...first,
    forces: [...first.forces].reverse(),
    seats: [...first.seats].reverse(),
    grants: [...first.grants].reverse().map((grant) => ({
      grantedAtTick: grant.grantedAtTick,
      scopes: grant.scopes,
      force: grant.force,
      seat: grant.seat,
    })),
  });
  expect(checkpointHash(createMatch(reordered))).toBe(initialHash);
  for (const next of [
    { ...first, seed: 43 },
    { ...first, settings: { startingCredits: 1234 } },
    { ...first, catalog: { ...catalog, gameplayHash: "abcdef1234567890" } },
    { ...first, forces: first.forces.map((force) => ({ ...force, team: 9 })) },
  ])
    expect(checkpointHash(createMatch(createNormalMatchSetup(next)))).not.toBe(initialHash);
});

test("normal setup owns permission and starting-kit metadata after creation", () => {
  const setup = state();
  const kernel = createMatch(setup);
  const before = checkpointHash(kernel);
  expect(Object.isFrozen(setup.normal?.forces[0]?.start.units[0])).toBe(true);
  expect(Reflect.set(setup.grants[0] as object, "force", 999)).toBe(false);
  expect(checkpointHash(kernel)).toBe(before);
});

test("invalid settings, faction, spawn, duplicate slots, caps and grants fail before a match is returned", () => {
  const base = options();
  for (const next of [
    { ...base, settings: { startingCredits: -1 } },
    {
      ...base,
      forces: base.forces.map((force) => ({ ...force, faction: "core.faction:missing" })),
    },
    { ...base, forces: base.forces.map((force) => ({ ...force, spawn: "missing" })) },
    { ...base, forces: base.forces.map((force) => ({ ...force, spawn: "north-west" })) },
    { ...base, grants: [] },
    {
      ...base,
      grants: [{ seat: 99, force: 1, scopes: ["unit.orders"] as const, grantedAtTick: 0 }],
    },
    { ...base, mapSupport: { start: "faction" as const, players: { min: 3, max: 4 } } },
  ])
    expect(() => createMatch(createNormalMatchSetup(next))).toThrow("Invalid normal match");
  const overCap = state();
  Reflect.set(overCap, "normal", {
    ...overCap.normal,
    forces: overCap.normal?.forces.map((force) => ({
      ...force,
      start: {
        ...force.start,
        units: force.start.units.map((unit) => ({ ...unit, count: 50, pop: 10 })),
      },
    })),
  });
  expect(() => createMatch(overCap)).toThrow("exceeds its caps");
  const debug = { ...state(), debug: true };
  expect(() => createMatch(debug)).toThrow("cannot enable debug");
});

test("blocked headquarters, disconnected spawns and missing reachable ore refuse normal initialization", () => {
  const base = options();
  expect(() =>
    createMatch(createNormalMatchSetup({ ...base, map: { ...base.map, resources: [] } })),
  ).toThrow("cannot reach ore");
  const blocked = {
    ...base.map,
    resources: [
      { kind: "materials" as const, position: [20 * 1024, 20 * 1024] as const, amount: 1 },
    ],
  };
  expect(() => createMatch(createNormalMatchSetup({ ...base, map: blocked }))).toThrow(
    "headquarters does not fit",
  );
  const water = [...base.map.terrain.water];
  for (let y = 0; y < base.map.terrain.height; y++) {
    water[y * base.map.terrain.width + 63] = 1;
    water[y * base.map.terrain.width + 64] = 2;
    water[y * base.map.terrain.width + 65] = 1;
  }
  const disconnected = { ...base.map, terrain: { ...base.map.terrain, water } };
  expect(() => createMatch(createNormalMatchSetup({ ...base, map: disconnected }))).toThrow(
    "disconnected",
  );
});
