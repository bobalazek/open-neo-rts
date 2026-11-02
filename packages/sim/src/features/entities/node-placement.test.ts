import { expect, test } from "bun:test";
import { parseTerrain, SURFACES, WATER } from "@open-neo-rts/content";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup, toMatchResources } from "../../match";
import { debugSpawnPlacement, toDefinition } from ".";

const extractor = toDefinition({
  id: "structure:fixture/extractor",
  health: 100,
  footprint: [2, 2],
  nodeKinds: ["materials", "oil"],
});
function setup(): MatchSetup {
  const t = parseTerrain(32, 32, {});
  return {
    seed: 1,
    debug: true,
    forces: [
      { index: 0, faction: "faction:fixture" },
      { index: 1, faction: "faction:fixture" },
    ],
    seats: [1],
    grants: [],
    definitions: [extractor],
    map: {
      id: "map:fixture",
      terrain: {
        ...t,
        level: [...t.level],
        ramp: [...t.ramp],
        water: [...t.water],
        surface: [...t.surface],
        biome: [...t.biome],
      },
      spawns: [],
      objects: [],
      resources: toMatchResources([
        { kind: "materials", position: [10, 10], amount: 200 },
        { kind: "oil", position: [20.5, 20.5] },
      ]),
    },
  };
}
const payload = (x = 9, y = 9, rotation = 0, force = 0) => ({
  definition: extractor.id,
  x: x * 1024,
  y: y * 1024,
  facing: ((rotation + 1) & 3) * 16384,
  force,
});

test("one shared extractor binds both marker sizes at a stable anchor in every rotation and Force", () => {
  for (const rotation of [0, 1, 2, 3])
    for (const force of [0, 1]) {
      const input = setup(),
        kernel = createMatch(input);
      for (const [x, y] of [
        [9, 9],
        [19, 19],
      ]) {
        const spawn = payload(x, y, rotation, force),
          before = checkpointHash(kernel);
        expect(debugSpawnPlacement(kernel, input.definitions, spawn).ok).toBe(true);
        expect(checkpointHash(kernel)).toEqual(before);
        expect(
          step(kernel, [
            { tick: kernel.tick, sequence: 0, seat: 0, type: "debug.spawn", payload: spawn },
          ])[0]?.result,
        ).toBe("accepted");
        expect(debugSpawnPlacement(kernel, input.definitions, spawn).ok).toBe(false);
      }
      const resources = JSON.stringify(kernel.map?.resources);
      expect(
        step(kernel, [
          { tick: kernel.tick, sequence: 0, seat: 0, type: "debug.remove", payload: { entity: 1 } },
        ])[0]?.result,
      ).toBe("accepted");
      expect(
        debugSpawnPlacement(kernel, input.definitions, payload(9, 9, rotation, force)).ok,
      ).toBe(true);
      expect(JSON.stringify(kernel.map?.resources)).toBe(resources);
    }
});

test("node binding refuses absent/wrong kinds, ordinary buildings, neighbours and competing claims", () => {
  const input = setup();
  const materialOnly = { ...extractor, nodeKinds: ["materials"] as const };
  const kernel = createMatch({ ...input, definitions: [materialOnly] });
  expect(debugSpawnPlacement(kernel, [materialOnly], payload(19, 19)).ok).toBe(false);
  expect(
    debugSpawnPlacement(kernel, [materialOnly], payload(8, 9)).cells?.some(
      (c) => c.failure === "not_node",
    ),
  ).toBe(true);
  const ordinary = { ...extractor, nodeKinds: undefined };
  // Omit optional metadata entirely at the strict input boundary.
  const { nodeKinds: _nodeKinds, ...building } = ordinary;
  expect(
    debugSpawnPlacement(createMatch({ ...input, definitions: [building] }), [building], payload())
      .ok,
  ).toBe(false);
  const overlap = {
    ...input,
    map: {
      ...input.map,
      resources: [
        ...(input.map.resources ?? []),
        ...toMatchResources([{ kind: "ore", position: [9, 9], amount: 1, radius: 0 }]),
      ],
    },
  };
  expect(debugSpawnPlacement(createMatch(overlap), input.definitions, payload()).ok).toBe(false);
  const commands = [0, 1].map((sequence) => ({
    tick: 0,
    sequence,
    seat: 0,
    type: "debug.spawn" as const,
    payload: payload(),
  }));
  const competing = createMatch(input);
  expect(step(competing, commands).map((c) => c.result)).toEqual(["accepted", "placement_failed"]);
});

test("eligible nodes never bypass land surface, water, height or four-cell edge checks", () => {
  for (const [layer, value, failure] of [
    ["water", WATER.shallow, "water"],
    ["surface", SURFACES.indexOf("rubble"), "surface"],
    ["level", 1, "level"],
  ] as const) {
    const input = setup();
    const terrain = {
      ...input.map.terrain,
      [layer]: input.map.terrain[layer].map((v, i) => (i === 9 * 32 + 9 ? value : v)),
    };
    const kernel = createMatch({ ...input, map: { ...input.map, terrain } });
    expect(
      debugSpawnPlacement(kernel, input.definitions, payload()).cells?.some(
        (c) => c.failure === failure,
      ),
    ).toBe(true);
  }
  const input = setup(),
    map = {
      ...input.map,
      resources: toMatchResources([{ kind: "materials", position: [4, 4], amount: 1 }]),
    };
  expect(
    debugSpawnPlacement(
      createMatch({ ...input, map }),
      input.definitions,
      payload(3, 3),
    ).cells?.some((c) => c.failure === "edge"),
  ).toBe(true);
  expect(() => toMatchResources([{ kind: "materials", position: [8, 8] }])).toThrow("amount");
  expect(() =>
    createMatch({
      ...input,
      map: { ...input.map, resources: [{ kind: "materials", position: [8192, 8192] }] },
    }),
  ).toThrow("amount");
});
