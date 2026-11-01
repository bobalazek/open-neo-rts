import { expect, test } from "bun:test";
import { flatMap, terrainMap } from "../../testing/maps";
import { compileNavigation, labelReachability, nearestReachable } from ".";

test("components reuse cliff/corner rules and resolve blocked, off-map and tied targets", () => {
  const flat = flatMap(5, 3);
  const map = {
    ...flat,
    terrain: { ...flat.terrain, level: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0] },
  };
  const grid = compileNavigation(map, [], { domain: "foot", radiusSubcells: 0 });
  const labels = labelReachability(grid);
  expect([...labels]).toEqual([1, 1, 2, 3, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 3]);
  expect(nearestReachable(grid, labels, 0, { x: 4, y: 1 })).toBe(6);
  expect(nearestReachable(grid, labels, 0, { x: -3, y: 1 })).toBe(5);
  expect(nearestReachable(grid, labels, 0, { x: 2, y: 0 })).toBe(1);
  grid.cost[0] = 0;
  expect(nearestReachable(grid, labelReachability(grid), 0, { x: 0, y: 0 })).toBeUndefined();
});

test("ramps join components while diagonal corner blocks and equal-distance ties stay canonical", () => {
  const ramp = compileNavigation(terrainMap(), [], { domain: "foot", radiusSubcells: 0 });
  const labels = labelReachability(ramp);
  expect(labels[18]).toBe(labels[21]);
  const corner = {
    width: 2,
    height: 2,
    cost: Uint16Array.from([1, 0, 0, 1]),
    connections: new Uint8Array(4).fill(255),
  };
  expect([...labelReachability(corner)]).toEqual([1, 0, 0, 2]);
  const tied = {
    width: 3,
    height: 3,
    cost: Uint16Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]),
    connections: new Uint8Array(9).fill(255),
  };
  expect(nearestReachable(tied, labelReachability(tied), 0, { x: 1, y: 1 })).toBe(1);
});
