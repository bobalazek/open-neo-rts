import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseTerrain, SCHEMAS, validate } from "@open-neo-rts/content";
import {
  createMatch,
  MoveIntent,
  MovementFailure,
  step,
  Transform,
  toMatchResources,
} from "@open-neo-rts/sim";
import { createCommandLog } from "@open-neo-rts/sim/testing";
import training from "../../../../content/core/maps/training-grounds/map.json";
import { catalogEntry } from "../../../../packages/client/src/features/debug/catalog";
import {
  oppositeBase,
  performanceScene,
} from "../../../../packages/client/src/features/debug/performance-scene";

test("the original 200-tank Training Grounds setup reaches every original goal without failures", async () => {
  const root = resolve(import.meta.dir, "../../../../content/core");
  const files = Array.from(
    new Bun.Glob("**/{unit,structure,prop}.json").scanSync({ cwd: root }),
  ).sort();
  // The same original, schema-validated definition order and pure setup as the worker debug scene.
  const catalog = await Promise.all(
    files.map(async (file) => catalogEntry(await Bun.file(resolve(root, file)).json())),
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
  const scene = performanceScene();
  const kernel = createMatch({
    map: {
      id: scene.map,
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
    seed: scene.seed,
    debug: true,
    forces: scene.forces.map(({ index, faction }) => ({ index, faction })),
    seats: [1],
    grants: [{ seat: 1, force: scene.controlled, scopes: ["unit.orders"], grantedAtTick: 0 }],
    definitions: catalog.map((entry) => entry.definition),
  });
  const log = createCommandLog();
  const spawns = scene.spawns.map((spawn) =>
    log.spawn(
      0,
      1,
      spawn.definition,
      spawn.force,
      spawn.x * 1024 + 512,
      spawn.y * 1024 + 512,
      0x4000,
    ),
  );
  expect(step(kernel, spawns).every((entry) => entry.result === "accepted")).toBe(true);
  const goals = scene.spawns.map((spawn) => oppositeBase(spawn.x, spawn.y));
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
