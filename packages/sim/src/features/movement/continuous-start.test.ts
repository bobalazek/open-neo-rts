import { expect, test } from "bun:test";
import { createMatch, step } from "../../index";
import { createCommandLog, flatMap } from "../../testing";
import { Transform, toDefinition } from "../entities";
import { MoveIntent, MovementFailure } from ".";
import { compileNavigation } from "./navigation";
import { labelReachability, nearestReachable, reachableStart } from "./reachability";
import { clearSegment } from "./segment";

const unit = toDefinition({
  id: "unit:fixture",
  health: 10,
  radius: 0.85,
  movement: { domain: "tracked", speed: 1.8 },
});
const block = toDefinition({ id: "structure:block", health: 100, footprint: [3, 3] });
const corner = { x: 4 * 1024 + 100, y: 4 * 1024 + 100 };
const target = { x: 10 * 1024 + 512, y: 4 * 1024 + 512 };
const object = {
  definition: block.id,
  position: [5 * 1024, 5 * 1024] as const,
  rotation: 0,
  owner: "neutral",
};
const mapWithBlock = { ...flatMap(16), objects: [object] };
const setup = (map = flatMap(16), definition = unit) => ({
  map,
  seed: 1,
  debug: true,
  definitions: [definition, block],
  forces: [{ index: 1, faction: "faction:fixture" }],
  seats: [1],
  grants: [{ seat: 1, force: 1, scopes: ["unit.orders" as const], grantedAtTick: 0 }],
});
const point = (kernel: ReturnType<typeof createMatch>) => ({
  x: kernel.world.get(1, Transform, "x"),
  y: kernel.world.get(1, Transform, "y"),
});
function finish(kernel: ReturnType<typeof createMatch>, expected: typeof corner) {
  for (let tick = 0; tick < 500 && kernel.world.has(1, MoveIntent); tick++) step(kernel, []);
  expect(kernel.world.has(1, MovementFailure)).toBe(false);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  expect(point(kernel)).toEqual(expected);
}

test("a clearance-blocked centre retains physical speed and accepts same-position and new orders", () => {
  const grid = compileNavigation(mapWithBlock, [block], {
    domain: "tracked",
    radiusSubcells: unit.radiusSubcells as number,
  });
  expect(grid.cost[68]).toBe(0);
  expect(grid.speedPercent[68]).toBe(100);
  expect(clearSegment(grid, corner, corner)).toBe(true);
  const kernel = createMatch(setup(mapWithBlock));
  const c = createCommandLog();
  step(kernel, [c.spawn(0, 0, unit.id, 1, corner.x, corner.y, 123)]);
  step(kernel, [c.move(1, 1, [1], corner.x, corner.y)]);
  expect(point(kernel)).toEqual(corner);
  expect(kernel.world.get(1, Transform, "facing")).toBe(123);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  step(kernel, [c.move(2, 1, [1], target.x, target.y)]);
  expect(kernel.world.has(1, MoveIntent)).toBe(true);
  expect(point(kernel)).not.toEqual(corner);
  finish(kernel, target);
});

test("occupancy replanning joins a clear anchor without teleporting or changing the goal", () => {
  const kernel = createMatch(setup());
  const c = createCommandLog();
  step(kernel, [
    c.spawn(0, 0, unit.id, 1, corner.x, corner.y),
    c.move(0, 1, [1], target.x, target.y),
  ]);
  const before = point(kernel);
  step(kernel, [c.spawn(1, 0, block.id, 1, 5 * 1024, 5 * 1024)]);
  const after = point(kernel);
  expect(kernel.log.at(-1)?.result).toBe("accepted");
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(unit.speed);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(unit.speed);
  const route = kernel.movement?.snapshot().routes[0];
  expect(route?.requested).toEqual(target);
  expect(route?.target).toEqual(target);
  finish(kernel, target);
});

test("true physical obstruction still refuses movement while shallow-wheel speed remains 50 percent", () => {
  const kernel = createMatch(setup(mapWithBlock));
  const c = createCommandLog();
  step(kernel, [
    c.spawn(0, 0, unit.id, 1, 5 * 1024 - 100, 5 * 1024 - 100),
    c.move(0, 1, [1], target.x, target.y),
  ]);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  expect(kernel.world.get(1, MovementFailure, "reason")).toBe(1);
  const flat = flatMap(16);
  const shallow = {
    ...mapWithBlock,
    terrain: { ...flat.terrain, water: Array(256).fill(1) },
  };
  const wheeled = { ...unit, domain: "wheeled" as const };
  const grid = compileNavigation(shallow, [block], {
    domain: "wheeled",
    radiusSubcells: unit.radiusSubcells as number,
  });
  expect(grid.cost[68]).toBe(0);
  expect(grid.speedPercent[68]).toBe(50);
  expect(grid.speedPercent[85]).toBe(0);
  const wheels = createMatch(setup(shallow, wheeled));
  const log = createCommandLog();
  step(wheels, [
    log.spawn(0, 0, unit.id, 1, corner.x, corner.y),
    log.move(0, 1, [1], 6 * 1024 + 512, 1024 + 512),
  ]);
  const moved = point(wheels);
  expect(Math.abs(moved.x - corner.x)).toBeLessThanOrEqual(Math.floor(unit.speed / 2));
  expect(Math.abs(moved.y - corner.y)).toBeLessThanOrEqual(Math.floor(unit.speed / 2));
  finish(wheels, { x: 6 * 1024 + 512, y: 1024 + 512 });
});

test("anchor choice preserves goal components, row-major ties and legitimate distant joins", () => {
  const grid = compileNavigation(flatMap(5, 3), [], { domain: "foot", radiusSubcells: 0 });
  for (let y = 0; y < 3; y++) grid.cost[y * 5 + 2] = 0;
  const labels = labelReachability(grid);
  const position = { x: 2 * 1024 + 100, y: 1024 + 512 };
  const start = reachableStart(grid, labels, position, { x: 4, y: 1 });
  expect(start).toBe(8);
  expect(labels[start as number]).toBe(labels[9]);
  const tied = compileNavigation(flatMap(3), [], { domain: "foot", radiusSubcells: 0 });
  tied.cost[4] = 0;
  expect(reachableStart(tied, labelReachability(tied), { x: 1536, y: 1536 }, { x: 0, y: 0 })).toBe(
    1,
  );
  const far = compileNavigation(flatMap(32), [], { domain: "foot", radiusSubcells: 0 });
  far.cost.fill(0);
  far.cost[20 + 10 * 32] = 1;
  expect(reachableStart(far, labelReachability(far), { x: 2560, y: 10752 }, { x: 20, y: 10 })).toBe(
    340,
  );
});

test("a genuinely disconnected goal keeps nearest-reachable fallback and never crosses the wall", () => {
  const flat = flatMap(8);
  const level = [...flat.terrain.level];
  for (let y = 0; y < 8; y++) level[y * 8 + 3] = 1;
  const grid = compileNavigation({ ...flat, terrain: { ...flat.terrain, level } }, [], {
    domain: "tracked",
    radiusSubcells: unit.radiusSubcells as number,
  });
  const labels = labelReachability(grid);
  const position = { x: 2 * 1024 + 100, y: 2 * 1024 + 512 };
  const start = reachableStart(grid, labels, position, { x: 6, y: 2 });
  expect(start).toBe(17);
  expect(nearestReachable(grid, labels, start as number, { x: 6, y: 2 })).toBe(17);
  expect(clearSegment(grid, position, { x: 6 * 1024 + 512, y: position.y })).toBe(false);
});
