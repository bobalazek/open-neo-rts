import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseTerrain, SCHEMAS, validate } from "@open-neo-rts/content";
import {
  createMatch,
  MoveIntent,
  MovementFailure,
  step,
  Transform,
  toDefinition,
  toMatchResources,
} from "@open-neo-rts/sim";
import { createCommandLog } from "@open-neo-rts/sim/testing";
import training from "../../../../content/core/maps/training-grounds/map.json";

test("the original 200-tank Training Grounds setup reaches every original goal without failures", async () => {
  const root = resolve(import.meta.dir, "../../../../content/core");
  const files = Array.from(
    new Bun.Glob("**/{unit,structure,prop}.json").scanSync({ cwd: root }),
  ).sort();
  const definitions = await Promise.all(
    files.map(async (file) => {
      const raw: unknown = await Bun.file(resolve(root, file)).json();
      const kind = file.endsWith("/unit.json")
        ? "unit"
        : file.endsWith("/structure.json")
          ? "structure"
          : "prop";
      const issues = validate(SCHEMAS[kind], raw);
      if (issues.length) throw new Error(`Invalid original content: ${file}`);
      const content = raw as Parameters<typeof toDefinition>[0];
      return toDefinition({ ...content, id: `core.${content.id}` });
    }),
  );
  expect(validate(SCHEMAS.map, training)).toEqual([]);
  const terrain = parseTerrain(128, 128, {
    height: new Uint8Array(
      await Bun.file(resolve(root, "maps/training-grounds/height.r8")).arrayBuffer(),
    ),
    ramps: new Uint8Array(
      await Bun.file(resolve(root, "maps/training-grounds/ramps.r8")).arrayBuffer(),
    ),
  });
  // Frozen issue147 input: preserve the original four 50-tank groups if the UI scene changes.
  const initial = Array.from({ length: 200 }, (_, index) => ({
    x: (Math.floor(index / 50) % 2 === 0 ? 12 : 94) + (index % 10) * 2,
    y: (index < 100 ? 12 : 94) + Math.floor((index % 50) / 10) * 2,
  }));
  const kernel = createMatch({
    map: {
      id: "core.map:training-grounds",
      terrain: {
        width: terrain.width,
        height: terrain.height,
        level: Array.from(terrain.level),
        ramp: Array.from(terrain.ramp),
        surface: Array.from(terrain.surface),
        water: Array.from(terrain.water),
        biome: Array.from(terrain.biome),
      },
      spawns: training.spawns.map((spawn) => ({
        id: spawn.id,
        position: [(spawn.position[0] ?? 0) * 1024, (spawn.position[1] ?? 0) * 1024],
        facing: Math.round(((90 - spawn.facing) * 65536) / 360) & 0xffff,
      })),
      resources: toMatchResources(training.resources),
      objects: [],
    },
    seed: 1,
    debug: true,
    forces: [{ index: 0, faction: "core.faction:eastern-collective" }],
    seats: [1],
    grants: [{ seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 }],
    definitions,
  });
  const log = createCommandLog();
  const spawns = initial.map((spawn) =>
    log.spawn(
      0,
      1,
      "core.unit:eastern-collective/dragon-tank",
      0,
      spawn.x * 1024 + 512,
      spawn.y * 1024 + 512,
      0x4000,
    ),
  );
  expect(step(kernel, spawns).every((entry) => entry.result === "accepted")).toBe(true);
  const goals = initial.map(({ x, y }) => ({
    x: (127 - x) * 1024 + 512,
    y: (127 - y) * 1024 + 512,
  }));
  expect(
    step(
      kernel,
      goals.map((goal, index) => log.move(1, 1, [index + 1], goal.x, goal.y)),
    ).every((entry) => entry.result === "accepted"),
  ).toBe(true);
  while (kernel.tick < 2000 && kernel.world.query(MoveIntent).length) {
    step(kernel, []);
    expect(kernel.world.query(MovementFailure)).toEqual([]);
  }
  expect(kernel.world.query(MoveIntent)).toEqual([]);
  expect(
    goals.map((_goal, index) => ({
      x: kernel.world.get(index + 1, Transform, "x"),
      y: kernel.world.get(index + 1, Transform, "y"),
    })),
  ).toEqual(goals);
  expect(kernel.movement?.snapshot().scheduler.budget).toBe(4096);
  expect(kernel.movement?.snapshot().scheduler.queues.flat()).toEqual([]);
});
