import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import { step } from "../../kernel";
import { createMatch, type MatchSetup, SIM_VERSION, toMatchResources } from "../../match";
import { createProjection } from "../../projection";
import { parseScenario, SCENARIO_FORMAT } from "../../snapshots";
import { debugSpawnPlacement, Template, toDefinition } from ".";

const structure = toDefinition({ id: "structure:test/block", health: 100, footprint: [3, 2] });
const prop = toDefinition({
  id: "prop:test/boulder",
  footprint: [2, 1],
  blocks: "movement",
  destructible: { health: 10 },
});
const decoration = toDefinition({ id: "prop:test/reeds", footprint: [1, 1], blocks: "nothing" });
const unit = toDefinition({ id: "unit:test/soldier", health: 10, movement: { speed: 1 } });
function setup(): MatchSetup {
  const terrain = parseTerrain(32, 32, {});
  return {
    map: {
      id: "map:fixture-placement",
      terrain: {
        ...terrain,
        level: [...terrain.level],
        ramp: [...terrain.ramp],
        surface: [...terrain.surface],
        water: [...terrain.water],
        biome: [...terrain.biome],
      },
      spawns: [],
      objects: [],
    },
    definitions: [structure, prop, decoration, unit],
    seed: 1,
    debug: true,
    forces: [{ index: 1, faction: "faction:test" }],
    seats: [1],
    grants: [],
  };
}
const payload = (definition = prop.id, x = 8, y = 8, rotation = 0) => ({
  definition,
  force: 1,
  x: x * 1024,
  y: y * 1024,
  facing: ((rotation + 1) & 3) * 0x4000,
});
const spawn = (tick: number, sequence: number, data = payload()) => ({
  tick,
  sequence,
  seat: 1,
  type: "debug.spawn" as const,
  payload: data,
});

test("static footprints rotate from original data at every quarter turn and block units", () => {
  for (let r = 0; r < 4; r++) {
    const kernel = createMatch(setup());
    expect(step(kernel, [spawn(0, 0, payload(prop.id, 8, 8, r))])[0]?.result).toBe("accepted");
    const inside = r % 2 ? [8, 9] : [9, 8];
    expect(step(kernel, [spawn(1, 0, payload(unit.id, inside[0], inside[1]))])[0]?.result).toBe(
      "placement_failed",
    );
    expect(kernel.world.query(Template)).toEqual([1]);
    expect(
      debugSpawnPlacement(
        kernel,
        [structure, prop, decoration, unit],
        payload(prop.id, 8, 8),
      ).cells?.some((c) => c.failure === "blocked"),
    ).toBe(true);
  }
});

test("removal and death release derived occupancy; rejection consumes no entity IDs", () => {
  const kernel = createMatch(setup());
  expect(step(kernel, [spawn(0, 0), spawn(0, 1)]).map((e) => e.result)).toEqual([
    "accepted",
    "placement_failed",
  ]);
  step(kernel, [
    { tick: 1, sequence: 0, seat: 1, type: "debug.remove", payload: { entity: 1 } },
    spawn(1, 1),
  ]);
  expect(kernel.world.query()).toEqual([2]);
  step(kernel, [
    { tick: 2, sequence: 0, seat: 1, type: "debug.setHealth", payload: { entity: 2, health: 0 } },
    spawn(2, 1),
  ]);
  expect(kernel.world.query()).toEqual([3]);
});

test("authored objects occupy rotated static footprints without creating ECS entities", () => {
  const input = setup();
  const kernel = createMatch({
    ...input,
    map: {
      ...input.map,
      objects: [
        { definition: prop.id, position: [8 * 1024, 8 * 1024], rotation: 90, owner: "neutral" },
      ],
    },
  });
  expect(kernel.world.query()).toEqual([]);
  expect(
    step(kernel, [spawn(0, 0, payload(unit.id, 8, 9)), spawn(0, 1, payload(unit.id, 9, 8))]).map(
      (e) => e.result,
    ),
  ).toEqual(["placement_failed", "accepted"]);
});

test("decorations retain authored blocking semantics and indestructible props cannot gain health", () => {
  const kernel = createMatch(setup());
  expect(
    step(kernel, [spawn(0, 0, payload(decoration.id)), spawn(0, 1)]).map((e) => e.result),
  ).toEqual(["accepted", "accepted"]);
  expect(
    step(kernel, [
      {
        tick: 1,
        sequence: 0,
        seat: 1,
        type: "debug.setHealth",
        payload: { entity: 1, health: 10 },
      },
    ])[0]?.result,
  ).toBe("bad_payload");
});

test("bounds, margins, snapping, quarter turns and occupied unit cells refuse atomically", () => {
  const kernel = createMatch(setup());
  for (const [data, failure] of [
    [payload(unit.id, 32, 8), "outside_map"],
    [{ ...payload(), x: 8193 }, "not_grid_aligned"],
    [{ ...payload(), facing: 1 }, "not_quarter_turn"],
  ] as const) {
    expect(debugSpawnPlacement(kernel, setup().definitions, data).failure).toBe(failure);
    expect(step(kernel, [spawn(kernel.tick, 0, data)])[0]?.result).toBe("placement_failed");
  }
  expect(
    debugSpawnPlacement(kernel, setup().definitions, payload(prop.id, 3, 8)).cells?.[0]?.failure,
  ).toBe("edge");
  expect(kernel.world.query()).toEqual([]);
  step(kernel, [spawn(kernel.tick, 0, payload(unit.id))]);
  expect(debugSpawnPlacement(kernel, setup().definitions, payload()).cells?.[0]?.failure).toBe(
    "blocked",
  );
});

test("actual debug-only gate rejects spawning and diagnostics in normal matches", () => {
  const kernel = createMatch({ ...setup(), debug: false });
  expect(step(kernel, [spawn(0, 0)])[0]?.result).toBe("debug_only");
  expect(kernel.world.query()).toEqual([]);
  expect(() => debugSpawnPlacement(kernel, setup().definitions, payload())).toThrow(
    "require debug mode",
  );
});

test("conversion copies original metadata and rejects malformed footprints, rows and motion", () => {
  const source = { id: structure.id, health: 10, footprint: [2, 1], cells: ["ls"] };
  const definition = toDefinition(source);
  source.footprint[0] = 8;
  expect(definition.footprint).toEqual([2, 1]);
  for (const content of [
    { ...source, footprint: [0, 1] },
    { ...source, footprint: [1.5, 1] },
    { ...source, footprint: [1, 1], cells: ["ll"] },
    { ...source, cells: ["z"] },
    { ...source, movement: { speed: 1 } },
    { id: unit.id, health: 10, movement: { speed: Number.NaN } },
    { id: prop.id, blocks: "unknown" },
  ])
    expect(() => toDefinition(content)).toThrow();
});

test("both setup boundaries reject malformed definition metadata", () => {
  for (const change of [
    { footprint: [2, 0] },
    { footprint: [2.5, 1] },
    { footprint: [1, 1], cells: ["ll"] },
    { cells: ["l"] },
    { speed: 1 },
    { blocks: "movement" },
  ]) {
    const input = {
      ...setup(),
      definitions: [{ ...structure, ...change }],
    } as unknown as MatchSetup;
    expect(() => createMatch(input)).toThrow("$.setup.definitions");
    expect(() =>
      parseScenario({
        format: SCENARIO_FORMAT,
        simVersion: SIM_VERSION,
        setup: input,
        commands: [],
      }),
    ).toThrow("$.setup.definitions");
  }
});

test("authoritative structure placement checks land, shore, water, cliffs and nodes in every rotation", () => {
  for (let r = 0; r < 4; r++) {
    const shore = toDefinition({
      id: "structure:test/dock",
      health: 10,
      footprint: [1, 3],
      cells: ["l", "s", "w"],
    });
    const input = setup();
    const base = { ...input, definitions: [shore] };
    const previewKernel = createMatch(base);
    const cells =
      debugSpawnPlacement(previewKernel, [shore], payload(shore.id, 8, 8, r)).cells ?? [];
    const water = [...input.map.terrain.water];
    // Give the water row a shallow border so the authored terrain itself remains valid.
    const deep = cells.find((c) => c.rule === "water");
    if (!deep) throw new Error("Expected water footprint cell");
    for (let y = deep.y - 1; y <= deep.y + 1; y++)
      for (let x = deep.x - 1; x <= deep.x + 1; x++) water[y * 32 + x] = 1;
    water[deep.y * 32 + deep.x] = 2;
    const land = cells.find((c) => c.rule === "land");
    if (!land) throw new Error("Expected land footprint cell");
    water[land.y * 32 + land.x] = 0;
    const kernel = createMatch({
      ...base,
      map: { ...input.map, terrain: { ...input.map.terrain, water } },
    });
    expect(debugSpawnPlacement(kernel, [shore], payload(shore.id, 8, 8, r)).ok).toBe(true);
    expect(step(kernel, [spawn(0, 0, payload(shore.id, 8, 8, r))])[0]?.result).toBe("accepted");
    expect(step(kernel, [spawn(1, 0, payload(shore.id, 8, 8, r))])[0]?.result).toBe(
      "placement_failed",
    );
  }
  const input = setup();
  const level = [...input.map.terrain.level];
  level[8 * 32 + 8] = 1;
  const kernel = createMatch({
    ...input,
    map: { ...input.map, terrain: { ...input.map.terrain, level } },
  });
  expect(
    debugSpawnPlacement(kernel, input.definitions, payload(structure.id)).cells?.[0]?.failure,
  ).toBe("level");
  expect(step(kernel, [spawn(0, 0, payload(structure.id))])[0]?.result).toBe("placement_failed");
  const node = toDefinition({
    id: "structure:test/node",
    health: 10,
    footprint: [1, 1],
    cells: ["n"],
  });
  const nodeKernel = createMatch({ ...setup(), definitions: [node] });
  expect(debugSpawnPlacement(nodeKernel, [node], payload(node.id)).cells?.[0]?.failure).toBe(
    "node_undecided",
  );
  expect(step(nodeKernel, [spawn(0, 0, payload(node.id))])[0]?.result).toBe("placement_failed");
});

test("ore discs and centred material nodes block static placement while units drive over resources", () => {
  const input = setup();
  const resources = toMatchResources([
    { kind: "ore", position: [12, 12], amount: 100, radius: 2 },
    { kind: "materials", position: [20, 20], amount: 100 },
  ]);
  const kernel = createMatch({ ...input, map: { ...input.map, resources } });
  for (const [x, y] of [
    [14, 12],
    [12, 14],
    [19, 19],
    [20, 20],
  ]) {
    expect(debugSpawnPlacement(kernel, input.definitions, payload(decoration.id, x, y)).ok).toBe(
      false,
    );
    expect(step(kernel, [spawn(kernel.tick, 0, payload(unit.id, x, y))])[0]?.result).toBe(
      "accepted",
    );
  }
  expect(debugSpawnPlacement(kernel, input.definitions, payload(decoration.id, 14, 14)).ok).toBe(
    true,
  );
  expect(debugSpawnPlacement(kernel, input.definitions, payload(decoration.id, 21, 20)).ok).toBe(
    true,
  );
  resources[0] = { kind: "ore", position: [8 * 1024, 8 * 1024], amount: 1, radius: 0 };
  expect(debugSpawnPlacement(kernel, input.definitions, payload(decoration.id, 14, 12)).ok).toBe(
    false,
  );
  expect(
    toMatchResources([{ kind: "ore", position: [1.25, 2.5], amount: 1 }])[0]?.position,
  ).toEqual([1280, 2560]);
  for (const resource of [
    { kind: "oil", position: [1, 1], amount: 1 },
    { kind: "ore", position: [Number.NaN, 1], amount: 1 },
    { kind: "ore", position: [1, 1], amount: 0 },
    { kind: "ore", position: [1, 1], amount: 1, radius: -1 },
  ])
    expect(() => toMatchResources([resource])).toThrow("Invalid resource");
});

test("indestructible props keep the existing projection protocol with health 0/0", () => {
  const input = setup();
  const kernel = createMatch(input);
  step(kernel, [spawn(0, 0, payload(decoration.id))]);
  expect(createProjection(input, 1, "debug-no-fog").snapshot(kernel).entities[0]).toMatchObject({
    health: 0,
    maxHealth: 0,
  });
  expect(
    step(kernel, [
      { tick: 1, seat: 1, sequence: 0, type: "debug.remove", payload: { entity: 1 } },
    ])[0]?.result,
  ).toBe("accepted");
  expect(kernel.world.query()).toEqual([]);
});

test("resource wire inputs and static object extents are validated at both setup boundaries", () => {
  const input = setup();
  for (const resource of [
    { kind: "ore", position: [8192, 8192], amount: 1, radius: 1.5 },
    { kind: "ore", position: [32768, 8192], amount: 1 },
    { kind: "materials", position: [8192, 8192], amount: 0 },
    { kind: "oil", position: [8192, 8192], amount: 1 },
  ]) {
    const bad = { ...input, map: { ...input.map, resources: [resource] } } as unknown as MatchSetup;
    expect(() => createMatch(bad)).toThrow("$.setup.map.resources");
    expect(() =>
      parseScenario({ format: SCENARIO_FORMAT, simVersion: SIM_VERSION, setup: bad, commands: [] }),
    ).toThrow("$.setup.map.resources");
  }
  for (const position of [
    [31 * 1024, 8 * 1024],
    [8193, 8192],
  ]) {
    const bad = {
      ...input,
      map: {
        ...input.map,
        objects: [{ definition: prop.id, position, rotation: 0, owner: "neutral" }],
      },
    } as unknown as MatchSetup;
    expect(() => createMatch(bad)).toThrow("$.setup.map.objects[0].position");
    expect(() =>
      parseScenario({ format: SCENARIO_FORMAT, simVersion: SIM_VERSION, setup: bad, commands: [] }),
    ).toThrow("$.setup.map.objects[0].position");
  }
});

test("the match owns original footprint metadata and defaults absent ore radius to one cell", () => {
  const input = setup();
  const mutable = { ...prop, footprint: [2, 1] as [number, number] };
  const kernel = createMatch({
    ...input,
    definitions: [mutable],
    map: {
      ...input.map,
      resources: toMatchResources([{ kind: "ore", position: [20, 20], amount: 1 }]),
    },
  });
  mutable.footprint[0] = 8;
  mutable.blocks = "nothing";
  expect(
    step(kernel, [spawn(0, 0, payload(prop.id, 8, 8)), spawn(0, 1, payload(prop.id, 10, 8))]).map(
      (e) => e.result,
    ),
  ).toEqual(["accepted", "accepted"]);
  expect(step(kernel, [spawn(1, 0, payload(prop.id, 19, 20))])[0]?.result).toBe("placement_failed");
  expect(() =>
    debugSpawnPlacement(kernel, input.definitions, { ...payload(), x: Number.NaN }),
  ).toThrow("Invalid spawn diagnostic payload");
});

test("simulation-version-2 scenarios are rejected rather than reinterpreted", () => {
  expect(() =>
    parseScenario({ format: SCENARIO_FORMAT, simVersion: 2, setup: setup(), commands: [] }),
  ).toThrow("$.simVersion");
});
