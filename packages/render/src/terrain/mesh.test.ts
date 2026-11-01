import { describe, expect, test } from "bun:test";
import { BIOMES, checkTerrain, RAMP, type TerrainGrid } from "@open-neo-rts/content";
import { PALETTES } from "./biomes";
import { createDemoGrid } from "./demo";
import {
  BORDER,
  buildTerrainGeometry,
  CHUNK_SIZE,
  cornerHeights,
  type Geometry,
  LEVEL_HEIGHT,
  terrainHeight,
  waterHeight,
} from "./mesh";

function grid(width: number, height: number, levels: number[] = []): TerrainGrid {
  const n = width * height;
  const level = new Uint8Array(n);
  level.set(levels);
  return {
    width,
    height,
    level,
    ramp: new Uint8Array(n),
    surface: new Uint8Array(n),
    water: new Uint8Array(n),
    biome: new Uint8Array(n),
  };
}

const all = (g: TerrainGrid) => buildTerrainGeometry(g);
const quads = (geos: (Geometry | null)[]) =>
  geos.reduce((n, g) => n + (g?.indices.length ?? 0) / 6, 0);

describe("terrain geometry", () => {
  test("entity heights follow all ramp planes and the existing water surface", () => {
    const g = grid(3, 3, Array(9).fill(2));
    for (const [ramp, low, high] of [
      [RAMP.north, [1.5, 2], [1.5, 1]],
      [RAMP.east, [1, 1.5], [2, 1.5]],
      [RAMP.south, [1.5, 1], [1.5, 2]],
      [RAMP.west, [2, 1.5], [1, 1.5]],
    ] as const) {
      g.ramp[4] = ramp;
      // At the far edge the next cell owns the coordinate, so sample just within this ramp.
      const within = ([x, y]: readonly number[]) =>
        [Math.min(x ?? 0, 2 - 1e-8), Math.min(y ?? 0, 2 - 1e-8)] as const;
      expect(terrainHeight(g, ...within(low))).toBeCloseTo(3.5);
      expect(terrainHeight(g, ...within(high))).toBeCloseTo(5.3);
      expect(terrainHeight(g, 1.5, 1.5)).toBeCloseTo(4.4);
    }
    g.ramp[4] = RAMP.none;
    expect(terrainHeight(g, 1.5, 1.5)).toBeCloseTo(3.6);
    g.water[4] = 2;
    expect(terrainHeight(g, 1.5, 1.5)).toBeCloseTo(1.8);
    expect(waterHeight(g, 1.5, 1.5)).toBeCloseTo(3.4);
    expect(terrainHeight(g, -1, -1)).toBeCloseTo(3.6);
    expect(terrainHeight(g, 20, 20)).toBeCloseTo(3.6);
  });
  test("demo grid passes the map rules", () => {
    for (const biome of BIOMES) {
      const g = createDemoGrid(biome);
      expect(checkTerrain(g)).toEqual([]);
      expect([...new Set(g.biome)]).toEqual([BIOMES.indexOf(biome)]);
    }
  });

  test("chunks cover the map plus border", () => {
    const chunks = all(grid(40, 20));
    const xs = new Set(chunks.map((c) => c.cx));
    const ys = new Set(chunks.map((c) => c.cy));
    // x from -8 to 48, y from -8 to 28, in 16-cell chunks.
    expect([...xs].sort()).toEqual([-1, 0, 1, 2]);
    expect([...ys].sort()).toEqual([-1, 0, 1]);
    expect(CHUNK_SIZE).toBe(16);
  });

  test("a flat map is bevelled tops plus the outer skirt only", () => {
    const g = grid(4, 4);
    const side = 4 + 2 * BORDER;
    const skirtFaces = 4 * side;
    const tops = side * side * 5;
    const total = quads(all(g).map((c) => c.terrain));
    // Skirt walls are 5 courses; odd courses split in two.
    expect(total).toBeGreaterThan(tops + skirtFaces * 5);
    expect(total).toBeLessThan(tops + skirtFaces * 10);
  });

  test("a one-level cliff is three brick courses", () => {
    const flat = quads(all(grid(4, 4)).map((c) => c.terrain));
    const cliff = quads(all(grid(4, 4, [0, 0, 0, 0, 0, 1])).map((c) => c.terrain));
    // Cell (1, 1) faces 4 lower neighbours: 3 courses each, one of them split.
    expect(cliff - flat).toBe(4 * 4);
  });

  test("a ramp lifts the corners on the side it faces by one level", () => {
    const g = grid(3, 3, [0, 1, 0, 0, 0, 0, 0, 0, 0]);
    g.ramp[4] = RAMP.north;
    const c = cornerHeights(g);
    const o = ((1 + BORDER) * (3 + 2 * BORDER) + 1 + BORDER) * 4;
    const [nw = 0, ne = 0, se = 0, sw = 0] = c.slice(o, o + 4);
    expect(nw - sw).toBeCloseTo(LEVEL_HEIGHT);
    expect(ne - se).toBeCloseTo(LEVEL_HEIGHT);
    expect(nw).toBeCloseTo(ne);
  });

  test("each cell is coloured by its own biome's palette", () => {
    // Flat grass, two cells: west desert, east arctic. Tops are shaded, so compare hue (r / g, b / g) only.
    const g = grid(2, 1);
    g.biome.set([BIOMES.indexOf("desert"), BIOMES.indexOf("arctic")]);
    const hue = (hex: number) => [
      (hex >> 16) / ((hex >> 8) & 255),
      (hex & 255) / ((hex >> 8) & 255),
    ];
    const tops = new Map<number, number[]>();
    for (const { terrain: t } of all(g)) {
      for (let v = 0; v < t.positions.length / 3; v++) {
        const [x = 0, y = 0, z = 0] = t.positions.subarray(v * 3, v * 3 + 3);
        if (z <= 0 || z >= 2 || x <= 0 || x >= 4 || Math.abs(y) > 1e-3) continue;
        const [r = 0, gr = 1, b = 0] = t.colors.subarray(v * 4, v * 4 + 3);
        tops.set(Math.floor(x / 2), [r / gr, b / gr]);
      }
    }
    const expected = [hue(PALETTES.desert.surfaces.grass), hue(PALETTES.arctic.surfaces.grass)];
    expect([0, 1].map((x) => tops.get(x)?.map((c) => c.toFixed(3)))).toEqual(
      expected.map((h) => h.map((c) => c.toFixed(3))),
    );
  });

  test("normals are unit length and never point down", () => {
    for (const chunk of all(createDemoGrid())) {
      for (const geo of [chunk.terrain, chunk.water]) {
        if (!geo) continue;
        const n = geo.normals;
        for (let i = 0; i < n.length; i += 3) {
          const [x = 0, y = 0, z = 0] = n.subarray(i, i + 3);
          expect(Math.abs(Math.hypot(x, y, z) - 1)).toBeLessThan(1e-3);
          expect(y).toBeGreaterThan(-1e-3);
        }
      }
    }
  });

  test("demo has water and a 128×128 map builds quickly", () => {
    expect(all(createDemoGrid()).some((c) => c.water)).toBe(true);
    const demo = createDemoGrid();
    const big = grid(128, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const i = (y % 64) * 64 + (x % 64);
        const j = y * 128 + x;
        big.level[j] = demo.level[i] ?? 0;
        big.ramp[j] = demo.ramp[i] ?? 0;
        big.surface[j] = demo.surface[i] ?? 0;
        big.water[j] = demo.water[i] ?? 0;
        big.biome[j] = (x >> 6) + 2 * (y >> 6); // a quadrant per biome
      }
    const start = performance.now();
    const chunks = all(big);
    const ms = performance.now() - start;
    const verts = chunks.reduce((n, c) => n + c.terrain.positions.length / 3, 0);
    console.log(`128×128: ${chunks.length} chunks, ${verts} vertices, ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
