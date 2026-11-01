import { expect, test } from "bun:test";
import { compileNavigation, labelReachability, nearestReachable } from ".";
import { flatMap } from "../../testing/maps";

test("components reuse cliff/corner rules and resolve blocked, off-map and tied targets", () => {
  const flat = flatMap(5, 3);
  const map = { ...flat, terrain: { ...flat.terrain,
    level: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0] } };
  const grid = compileNavigation(map, [], { domain: "foot", radiusSubcells: 0 });
  const labels = labelReachability(grid);
  expect([...labels]).toEqual([1, 1, 2, 3, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 3]);
  expect(nearestReachable(grid, labels, 0, { x: 4, y: 1 })).toBe(6);
  expect(nearestReachable(grid, labels, 0, { x: -3, y: 1 })).toBe(5);
  expect(nearestReachable(grid, labels, 0, { x: 2, y: 0 })).toBe(1);
  grid.cost[0] = 0;
  expect(nearestReachable(grid, labelReachability(grid), 0, { x: 0, y: 0 })).toBeUndefined();
});
