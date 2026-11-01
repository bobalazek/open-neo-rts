import { expect, test } from "bun:test";
import { OwnerForce, Template, Transform } from "./features/entities";
import { MoveIntent } from "./features/movement";
import { checkpointHash, step } from "./kernel";
import {
  createMatch,
  type MatchMap,
  type MatchSetup,
  SIM_VERSION,
  serializeMatchMap,
} from "./match";
import { parseScenario, SCENARIO_FORMAT } from "./snapshots";
import { flatMap, terrainMap } from "./testing";

const setup: MatchSetup = {
  map: flatMap(),
  seed: 1,
  debug: true,
  forces: [{ index: 2, faction: "faction:eastern-collective" }],
  seats: [1],
  grants: [{ seat: 1, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 }],
  definitions: [
    { id: "unit:eastern-collective/dragon-tank", health: 900, speed: 92, turnRate: 728 },
  ],
};

test("registers entities before movement and gives movement the setup grants and definitions", () => {
  const kernel = createMatch(setup);
  expect([...kernel.handlers.keys()]).toEqual([
    "debug.spawn",
    "debug.setHealth",
    "debug.remove",
    "unit.move",
    "unit.stop",
  ]);
  expect(kernel.world.query(Template)).toEqual([]);
  step(kernel, [
    {
      tick: 0,
      sequence: 0,
      seat: 0,
      type: "debug.spawn",
      payload: { definition: setup.definitions[0]?.id, force: 2, x: 0, y: 0, facing: 0 },
    },
    { tick: 0, sequence: 1, seat: 1, type: "unit.move", payload: { entities: [1], x: 1024, y: 0 } },
  ]);
  expect(kernel.world.get(1, OwnerForce, "force")).toBe(2);
  expect(kernel.world.get(1, Transform, "x")).toBe(92);
  expect(kernel.world.has(1, MoveIntent)).toBe(true);
  expect(createMatch(setup).world.query(Template)).toEqual([]);
});

const westSpawn = { id: "west", position: [0, 0] as const, facing: 0xffff };
const staticObject = {
  definition: "unit:eastern-collective/dragon-tank",
  position: [8191, 8191] as const,
  rotation: 270,
  owner: "west",
};

function mapWithObjects(): MatchMap {
  return {
    ...terrainMap(),
    spawns: [{ ...westSpawn, position: [...westSpawn.position] }],
    objects: [{ ...staticObject, position: [...staticObject.position] }],
  };
}

function parseMap(map: unknown) {
  return parseScenario({
    format: SCENARIO_FORMAT,
    simVersion: SIM_VERSION,
    setup: { ...setup, map },
    commands: [],
  });
}

test("copies and freezes map data independently of callers and other worlds, without creating entities", () => {
  const map = mapWithObjects();
  const a = createMatch({ ...setup, map });
  const b = createMatch({ ...setup, map });
  const before = checkpointHash(a);
  expect(a.map).toEqual(map);
  expect(a.map).not.toBe(map);
  expect(a.map).not.toBe(b.map);
  expect(a.map?.terrain.level).not.toBe(b.map?.terrain.level);
  expect(Object.isFrozen(a.map?.objects[0]?.position)).toBe(true);
  expect(Object.isFrozen(a.map?.terrain.surface)).toBe(true);
  expect(Object.isFrozen(a.map?.objects)).toBe(true);
  expect(Reflect.set(a.map?.terrain.surface as object, "0", 7)).toBe(false);
  expect(Reflect.set(map.terrain.surface, "0", 1)).toBe(true);
  expect(Reflect.set(map.objects[0]?.position as object, "0", 1)).toBe(true);
  expect(checkpointHash(a)).toBe(before);
  expect(checkpointHash(b)).toBe(before);
  expect(a.world.query()).toEqual([]);
});

test("canonical map serialization ignores object key order and hashes actual terrain and static input", () => {
  const map = mapWithObjects();
  const reversed = Object.fromEntries(Object.entries(map).reverse()) as unknown as MatchMap;
  expect(serializeMatchMap(reversed)).toBe(serializeMatchMap(map));
  const hash = (value: MatchMap) => checkpointHash(createMatch({ ...setup, map: value }));
  expect(hash(reversed)).toBe(hash(map));
  const surface = [...map.terrain.surface];
  surface[0] = 1;
  expect(hash({ ...map, terrain: { ...map.terrain, surface } })).not.toBe(hash(map));
  expect(hash({ ...map, id: "map:other" })).not.toBe(hash(map));
  expect(hash({ ...map, objects: [] })).not.toBe(hash(map));
  expect(hash({ ...map, spawns: [{ ...westSpawn, facing: 1 }] })).not.toBe(hash(map));
});

const validMap = mapWithObjects();
for (const [name, map, error] of [
  ["identity", { ...validMap, id: "fixture" }, ".id"],
  ["zero width", { ...validMap, terrain: { ...validMap.terrain, width: 0 } }, ".width"],
  ["fractional height", { ...validMap, terrain: { ...validMap.terrain, height: 8.5 } }, ".height"],
  ["oversized width", { ...validMap, terrain: { ...validMap.terrain, width: 513 } }, ".width"],
  ["short layer", { ...validMap, terrain: { ...validMap.terrain, level: [0] } }, ".level"],
  [
    "long layer",
    { ...validMap, terrain: { ...validMap.terrain, level: Array(65).fill(0) } },
    ".level",
  ],
  ["unknown layer", { ...validMap, terrain: { ...validMap.terrain, ice: [] } }, ".ice"],
  [
    "unknown object definition",
    { ...validMap, objects: [{ ...validMap.objects[0], definition: "prop:temperate/boulder" }] },
    ".definition",
  ],
  [
    "unknown owner",
    { ...validMap, objects: [{ ...validMap.objects[0], owner: "east" }] },
    ".owner",
  ],
  ["rotation", { ...validMap, objects: [{ ...validMap.objects[0], rotation: 45 }] }, ".rotation"],
  [
    "object outside x",
    { ...validMap, objects: [{ ...validMap.objects[0], position: [8192, 0] }] },
    ".position",
  ],
  [
    "object outside y",
    { ...validMap, objects: [{ ...validMap.objects[0], position: [0, 8192] }] },
    ".position",
  ],
  [
    "negative object position",
    { ...validMap, objects: [{ ...validMap.objects[0], position: [-1, 0] }] },
    ".position",
  ],
  [
    "fractional position",
    { ...validMap, objects: [{ ...validMap.objects[0], position: [0.5, 0] }] },
    ".position",
  ],
  [
    "spawn outside",
    { ...validMap, spawns: [{ ...validMap.spawns[0], position: [0, 8192] }] },
    ".position",
  ],
  ["duplicate spawn", { ...validMap, spawns: [validMap.spawns[0], validMap.spawns[0]] }, ".id"],
] as const) {
  test(`both setup boundaries reject ${name}`, () => {
    expect(() => parseMap(map)).toThrow(error);
    expect(() => createMatch({ ...setup, map: map as unknown as MatchMap })).toThrow(error);
  });
}

for (const [layer, bad] of [
  ["level", 8],
  ["ramp", 5],
  ["surface", 8],
  ["water", 3],
  ["biome", 4],
] as const)
  test(`both setup boundaries reject unknown ${layer} values before byte conversion`, () => {
    for (const value of [bad, -1, 0.5, 256, Number.NaN]) {
      const values = [...validMap.terrain[layer]];
      values[0] = value;
      const map = { ...validMap, terrain: { ...validMap.terrain, [layer]: values } };
      expect(() => parseMap(map)).toThrow(`.terrain.${layer}`);
      expect(() => createMatch({ ...setup, map })).toThrow(`.terrain.${layer}`);
    }
  });

test("both setup boundaries enforce terrain geometry and accept neutral objects at the last subcell", () => {
  const map = flatMap();
  const ramp = [...map.terrain.ramp];
  ramp[0] = 1;
  const broken = { ...map, terrain: { ...map.terrain, ramp } };
  expect(() => parseMap(broken)).toThrow("ramp");
  expect(() => createMatch({ ...setup, map: broken })).toThrow("ramp");
  const neutral = { ...validMap, objects: [{ ...staticObject, owner: "neutral" }] };
  expect(parseMap(neutral).setup.map).toEqual(neutral);
  expect(createMatch({ ...setup, map: neutral }).map).toEqual(neutral);
});

test("rejects version-1 flat scenarios explicitly rather than supplying a default map", () => {
  const { map: _map, ...flatSetup } = setup;
  expect(() => parseScenario({ format: 1, simVersion: 1, setup: flatSetup, commands: [] })).toThrow(
    "$.format",
  );
  expect(() =>
    parseScenario({
      format: SCENARIO_FORMAT,
      simVersion: SIM_VERSION,
      setup: flatSetup,
      commands: [],
    }),
  ).toThrow("$.setup.map: is required");
});
