import { expect, test } from "bun:test";
import { step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createCommandLog, flatMap } from "../../testing";
import { Transform, toDefinition } from "../entities";
import { MoveIntent, MovementFailure } from ".";
import { compileNavigation } from "./navigation";
import { clearSegment } from "./segment";

const unit = toDefinition({
  id: "unit:fixture",
  health: 10,
  radius: 0.25,
  movement: { domain: "foot", speed: 4 },
});
const block = toDefinition({ id: "structure:fixture", health: 100, footprint: [3, 3] });
const setup = (map = flatMap(16)): MatchSetup => ({
  map,
  seed: 1,
  debug: true,
  forces: [{ index: 1, faction: "faction:fixture" }],
  seats: [1],
  grants: [{ seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
  definitions: [unit, block],
});
const point = (kernel: ReturnType<typeof createMatch>) => ({
  x: kernel.world.get(1, Transform, "x"),
  y: kernel.world.get(1, Transform, "y"),
});

test("tick-boundary blockers replace active routes before any unit can enter their clearance", () => {
  const kernel = createMatch(setup());
  const c = createCommandLog();
  step(kernel, [c.spawn(0, 0, unit.id, 1, 2560, 6656), c.move(0, 1, [1], 12800, 6656)]);
  step(kernel, [c.spawn(1, 0, block.id, 1, 5120, 5120)]);
  if (!kernel.map) throw new Error("Expected a map");
  const grid = compileNavigation(
    kernel.map,
    [unit, block],
    { domain: "foot", radiusSubcells: 256 },
    [{ definition: block.id, position: [5120, 5120], rotation: 270, owner: "neutral" }],
  );
  let previous = point(kernel);
  for (let tick = 0; tick < 180; tick++) {
    step(kernel, []);
    const next = point(kernel);
    expect(clearSegment(grid, previous, next)).toBe(true);
    previous = next;
  }
  expect(point(kernel)).toEqual({ x: 12800, y: 6656 });
  expect(kernel.world.has(1, MovementFailure)).toBe(false);
});

test("spawn/remove during pending A* cancels every obsolete search against the old grid", () => {
  const flat = flatMap(128);
  const surface = [...flat.terrain.surface];
  surface[0] = 6; // A distant cheap road keeps this fixture searching beyond one tick's quota.
  const map = {
    ...flat,
    terrain: { ...flat.terrain, surface },
    objects: [
      {
        definition: block.id,
        position: [64 * 1024, 64 * 1024] as const,
        rotation: 0,
        owner: "neutral",
      },
    ],
  };
  const kernel = createMatch(setup(map));
  const c = createCommandLog();
  step(kernel, [c.spawn(0, 0, unit.id, 1, 4608, 4608), c.move(0, 1, [1], 123392, 123392)]);
  const movement = kernel.movement;
  if (!movement) throw new Error("Expected map movement");
  expect(movement.snapshot().scheduler.queues.flat().length).toBe(1);
  step(kernel, [c.spawn(1, 0, block.id, 1, 8192, 8192)]);
  let queue = movement.snapshot().scheduler.queues.flat();
  expect(queue.map((p) => [p.request.issueTick, p.request.kind])).toEqual([[1, "repath"]]);
  step(kernel, [{ tick: 2, seat: 0, sequence: 0, type: "debug.remove", payload: { entity: 2 } }]);
  queue = movement.snapshot().scheduler.queues.flat();
  expect(queue.map((p) => [p.request.issueTick, p.request.kind])).toEqual([[2, "repath"]]);
  step(kernel, [c.stop(3, 1, [1])]);
  expect(movement.snapshot().scheduler.queues.flat()).toEqual([]);
});

test("zero physical progress terminates after bounded repaths and a new order clears the failure", () => {
  const flat = flatMap(8);
  const map = { ...flat, terrain: { ...flat.terrain, water: Array(64).fill(1) } };
  const slow = { ...unit, domain: "wheeled" as const, speed: 1, radiusSubcells: 0 };
  const kernel = createMatch({ ...setup(map), definitions: [slow] });
  const c = createCommandLog();
  step(kernel, [c.spawn(0, 0, unit.id, 1, 1536, 1536), c.move(0, 1, [1], 6656, 1536)]);
  for (let tick = 0; tick < 125; tick++) step(kernel, []);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  expect(kernel.world.get(1, MovementFailure, "reason")).toBe(2);
  expect(kernel.movement?.snapshot().routes).toEqual([]);
  expect(kernel.movement?.snapshot().scheduler.queues.flat()).toEqual([]);
  step(kernel, [c.move(126, 1, [1], 1536, 1536)]);
  expect(kernel.world.has(1, MovementFailure)).toBe(false);
});

test("clear LOS retains cheaper road routes instead of bypassing their weights", () => {
  const flat = flatMap(16);
  const surface = Array(256).fill(0);
  for (let x = 2; x <= 12; x++) surface[4 * 16 + x] = 6;
  const map = { ...flat, terrain: { ...flat.terrain, surface } };
  const kernel = createMatch(setup(map));
  const c = createCommandLog();
  step(kernel, [c.spawn(0, 0, unit.id, 1, 2560, 6656), c.move(0, 1, [1], 12800, 6656)]);
  let nearestRoad = point(kernel).y;
  for (let tick = 0; tick < 180; tick++) {
    step(kernel, []);
    nearestRoad = Math.min(nearestRoad, point(kernel).y);
  }
  expect(nearestRoad).toBeLessThanOrEqual(4 * 1024 + 512);
  expect(point(kernel)).toEqual({ x: 12800, y: 6656 });
});
