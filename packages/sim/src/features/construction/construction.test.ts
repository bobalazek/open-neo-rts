import { describe, expect, test } from "bun:test";
import {
  checkTerrain,
  parseTerrain,
  RAMP,
  SURFACES,
  type TerrainGrid,
  WATER,
} from "@open-neo-rts/content";
import { checkPlacement, type PlacementWorld } from ".";

type Structure = Parameters<typeof checkPlacement>[1];
const open: PlacementWorld = { isBlocked: () => false };
const block = { footprint: [2, 2] };
/** The shipyard's, naval yard's and raft dock's rows: back on land, middle on shore, front in deep water. */
const shipyard = { footprint: [4, 3], cells: ["llll", "ssss", "wwww"] };

/** Sets `layer` to `value` on cells x0 ≤ x < x1, y0 ≤ y < y1. */
function box(
  t: TerrainGrid,
  layer: "level" | "ramp" | "surface" | "water",
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) t[layer][y * t.width + x] = value;
  return t;
}

/** Failing cells as "x,y code". */
const fails = (t: TerrainGrid, s: Structure, x: number, y: number, r = 0, world = open) =>
  checkPlacement(t, s, x, y, r, world)
    .cells.filter((c) => c.failure)
    .map((c) => `${c.x},${c.y} ${c.failure}`);

/** Every corner where `s` fits at rotation `r`, as "x,y". */
function fits(t: TerrainGrid, s: Structure, r: number) {
  const out: string[] = [];
  for (let y = 0; y < t.height; y++)
    for (let x = 0; x < t.width; x++)
      if (checkPlacement(t, s, x, y, r, open).ok) out.push(`${x},${y}`);
  return out;
}

/**
 * 32 × 32: a square lake (deep 10 ≤ x, y < 14) ringed by one shallow cell, and an east coast with a one-cell
 * shallow band at x 23 and deep sea from x 24.
 */
function water(band = 1) {
  const t = parseTerrain(32, 32, {});
  box(t, "water", 9, 9, 15, 15, WATER.shallow);
  box(t, "water", 10, 10, 14, 14, WATER.deep);
  box(t, "water", 24 - band, 0, 32, 32, WATER.shallow);
  return box(t, "water", 24, 0, 32, 32, WATER.deep);
}

describe("checkPlacement: land", () => {
  test("a 2×2 structure fits flat ground", () => {
    expect(checkPlacement(parseTerrain(16, 16, {}), block, 6, 6, 0, open)).toEqual({
      ok: true,
      cells: [
        { x: 6, y: 6, rule: "land" },
        { x: 7, y: 6, rule: "land" },
        { x: 6, y: 7, rule: "land" },
        { x: 7, y: 7, rule: "land" },
      ],
    });
  });
  test("ramps can't be built on", () => {
    // Level 1 north of y 8, and a ramp at y 8 rising to it.
    const t = box(
      box(parseTerrain(16, 16, {}), "level", 0, 0, 16, 8, 1),
      "ramp",
      4,
      8,
      12,
      9,
      RAMP.north,
    );
    expect(fails(t, block, 6, 8)).toEqual(["6,8 ramp", "7,8 ramp"]);
  });
  test("a footprint doesn't span a cliff: cells off its most common level fail, the higher on a tie", () => {
    const t = box(parseTerrain(16, 16, {}), "level", 8, 0, 16, 16, 1);
    expect(fails(t, block, 7, 6)).toEqual(["8,6 level", "8,7 level"]);
    expect(fails(t, { footprint: [3, 2] }, 7, 6)).toEqual(["7,6 level", "7,7 level"]);
    expect(fails(t, block, 8, 6)).toEqual([]);
  });
  test("land is dry and buildable", () => {
    const t = box(parseTerrain(16, 16, {}), "water", 7, 0, 16, 16, WATER.shallow);
    box(t, "water", 9, 0, 16, 16, WATER.deep);
    expect(fails(t, block, 6, 6)).toEqual(["7,6 water", "7,7 water"]);
    expect(fails(t, block, 9, 6)).toEqual(["9,6 water", "10,6 water", "9,7 water", "10,7 water"]);
    box(t, "surface", 0, 0, 7, 16, SURFACES.indexOf("rubble"));
    expect(fails(t, block, 5, 6)).toEqual([
      "5,6 surface",
      "6,6 surface",
      "5,7 surface",
      "6,7 surface",
    ]);
  });
  test("the map edge and its 4-cell margin can't be built on", () => {
    const t = parseTerrain(16, 16, {});
    expect(fails(t, block, 4, 10)).toEqual([]);
    expect(fails(t, block, 3, 10)).toEqual(["3,10 edge", "3,11 edge"]);
    expect(fails(t, block, 10, 11)).toEqual(["10,12 edge", "11,12 edge"]);
    const asked: string[] = [];
    const world = {
      isBlocked: (x: number, y: number) => {
        asked.push(`${x},${y}`);
        return false;
      },
    };
    expect(fails(t, block, -1, -1, 0, world)).toHaveLength(4);
    expect(asked).toEqual([]);
  });
  test("blocked cells fail; the world is asked in row-major order", () => {
    const asked: string[] = [];
    const world = {
      isBlocked: (x: number, y: number) => {
        asked.push(`${x},${y}`);
        return x === 7 && y === 6;
      },
    };
    expect(fails(parseTerrain(16, 16, {}), block, 6, 6, 0, world)).toEqual(["7,6 blocked"]);
    expect(asked).toEqual(["6,6", "7,6", "6,7", "7,7"]);
  });
  test("node cells fail until a node lookup is supplied", () => {
    const t = parseTerrain(16, 16, {});
    const derrick = { footprint: [1, 1], cells: ["n"] };
    expect(fails(t, derrick, 6, 6)).toEqual(["6,6 node_undecided"]);
    const world = { isBlocked: () => false, isNode: (x: number, y: number) => x === 6 && y === 6 };
    expect(fails(t, derrick, 6, 6, 0, world)).toEqual([]);
    expect(fails(t, derrick, 7, 6, 0, world)).toEqual(["7,6 not_node"]);
  });
});

describe("checkPlacement: shore structures", () => {
  test("rotation turns the rows clockwise; row 0 is the back and faces north at rotation 0", () => {
    const s = { footprint: [3, 2], cells: ["lsw", "nnn"] };
    const layout = (r: number) => {
      const rows: string[] = [];
      for (const c of checkPlacement(parseTerrain(16, 16, {}), s, 6, 6, r, open).cells)
        rows[c.y - 6] = (rows[c.y - 6] ?? "") + c.rule[0];
      return rows;
    };
    expect(layout(0)).toEqual(["lsw", "nnn"]); // front faces south
    expect(layout(1)).toEqual(["nl", "ns", "nw"]); // west
    expect(layout(2)).toEqual(["nnn", "wsl"]); // north
    expect(layout(3)).toEqual(["wn", "sn", "ln"]); // east
    expect(layout(4)).toEqual(layout(0));
  });
  test("the shipyard fits only facing deep water across one shore cell, on every side of a lake", () => {
    const t = water();
    expect(checkTerrain(t)).toEqual([]);
    expect(fits(t, shipyard, 0)).toEqual(["10,8"]); // north shore
    expect(fits(t, shipyard, 1)).toEqual(["13,10"]); // east shore, front west
    expect(fits(t, shipyard, 2)).toEqual(["10,13"]); // south shore
    const coast = Array.from({ length: 21 }, (_, i) => `22,${4 + i}`); // down to the 4-cell margin
    expect(fits(t, shipyard, 3).sort()).toEqual(["8,10", ...coast].sort());
  });
  test("the shipyard fails inland and in open sea", () => {
    const t = water();
    expect(fails(t, shipyard, 16, 20, 3)).toEqual(
      ["18,20", "18,21", "18,22", "18,23"].map((c) => `${c} not_deep_water`),
    );
    expect(fails(t, shipyard, 24, 20, 3)).toEqual(
      [20, 21, 22, 23].flatMap((y) => [`24,${y} water`, `25,${y} deep_water`]),
    );
  });
  test("a two-cell shallow band needs two shore rows", () => {
    const t = water(2);
    expect(checkTerrain(t)).toEqual([]);
    expect(fits(t, shipyard, 3)).toEqual(["8,10"]); // the lake only
    const wide = { footprint: [4, 4], cells: ["llll", "ssss", "ssss", "wwww"] }; // structures.md's 4×4
    expect(fits(t, wide, 3)).toContain("21,4"); // land at x 21, shore 22 and 23, deep water 24
  });
  test("turning the map and the shipyard together gives the same result at every corner", () => {
    const t = water();
    // A quarter clockwise: cell (x, y) moves to (31 - y, x).
    const turned = parseTerrain(32, 32, {});
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) turned.water[x * 32 + 31 - y] = t.water[y * 32 + x] ?? 0;
    for (let r = 0; r < 4; r++)
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const rows = r % 2 ? 4 : 3;
          const a = checkPlacement(t, shipyard, x, y, r, open).cells.map((c) => ({
            ...c,
            x: 31 - c.y,
            y: c.x,
          }));
          a.sort((p, q) => p.y - q.y || p.x - q.x);
          expect(checkPlacement(turned, shipyard, 32 - y - rows, x, r + 1, open).cells).toEqual(a);
        }
  });
});
