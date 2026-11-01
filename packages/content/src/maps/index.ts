// Map source format, map compiler (nav grids, height levels) and map validators. Phase 1b.

import { BIOMES, MAX_LEVEL, RAMP, SURFACES, WATER } from "../rules/terrain";

/**
 * A map's terrain as integer cell grids, row-major: cell (x, y) is at index `y * width + x`, with y growing
 * southward. `width` and `height` are the map's `size` in cells. Values come from rules/terrain.ts.
 */
export interface TerrainGrid {
  width: number;
  height: number;
  /** Height level, 0 to MAX_LEVEL. */
  level: Uint8Array;
  /** RAMP value. */
  ramp: Uint8Array;
  /** Index into SURFACES. */
  surface: Uint8Array;
  /** WATER value. */
  water: Uint8Array;
  /** Index into BIOMES. */
  biome: Uint8Array;
}

/** A map's `.r8` layers, by their `map.layers` key: one byte per cell, row-major, no header. */
export type TerrainLayers = Partial<
  Record<"height" | "ramps" | "surface" | "water" | "biome", Uint8Array>
>;

/**
 * Builds a map's terrain from its layers. A missing layer is all zeros (level 0, no ramp, grass, no water),
 * except the biome layer, which is the map's base `biome` everywhere. Throws if a layer isn't exactly
 * width × height bytes, or if the base biome isn't one of BIOMES.
 */
export function parseTerrain(
  width: number,
  height: number,
  layers: TerrainLayers,
  biome = "temperate",
): TerrainGrid {
  const cells = width * height;
  const base = (BIOMES as readonly string[]).indexOf(biome);
  if (base < 0) throw new Error(`biome "${biome}" isn't one of ${BIOMES.join(", ")}`);
  const layer = (name: keyof TerrainLayers) => {
    const bytes = layers[name];
    if (!bytes) return new Uint8Array(cells).fill(name === "biome" ? base : 0);
    if (bytes.length !== cells)
      throw new Error(
        `layers.${name} is ${bytes.length} bytes, expected ${width} × ${height} = ${cells}`,
      );
    return bytes;
  };
  return {
    width,
    height,
    level: layer("height"),
    ramp: layer("ramps"),
    surface: layer("surface"),
    water: layer("water"),
    biome: layer("biome"),
  };
}

const STEP: Record<number, [number, number]> = {
  [RAMP.north]: [0, -1],
  [RAMP.east]: [1, 0],
  [RAMP.south]: [0, 1],
  [RAMP.west]: [-1, 0],
};

/**
 * Terrain rules: known values (biomes included), each ramp cell one level below the cell it rises toward and part of a run at
 * least 2 cells wide, and deep water never touching land (not even diagonally). One message per broken rule,
 * naming the first cell and how many more break it.
 */
export function checkTerrain(t: TerrainGrid): string[] {
  const { width: w, height: h } = t;
  const found = new Map<string, { x: number; y: number; n: number }>();
  const bad = (rule: string, x: number, y: number) => {
    const f = found.get(rule);
    if (f) f.n++;
    else found.set(rule, { x, y, n: 1 });
  };
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const level = t.level[i] ?? 0;
      const ramp = t.ramp[i] ?? 0;
      const water = t.water[i] ?? 0;
      if (level > MAX_LEVEL) bad(`level above ${MAX_LEVEL}`, x, y);
      if ((t.surface[i] ?? 0) >= SURFACES.length) bad("unknown surface", x, y);
      if ((t.biome[i] ?? 0) >= BIOMES.length) bad("unknown biome", x, y);
      if (water > WATER.deep) bad("unknown water value", x, y);
      if (water === WATER.deep) {
        let land = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) land ||= t.water[at(x + dx, y + dy)] === WATER.none;
        if (land) bad("deep water touches land without a shallow cell between", x, y);
      }
      if (ramp === RAMP.none) continue;
      const step = STEP[ramp];
      if (!step) {
        bad("unknown ramp value", x, y);
        continue;
      }
      const [dx, dy] = step;
      if (t.level[at(x + dx, y + dy)] !== level + 1)
        bad("ramp doesn't rise exactly one level toward its direction", x, y);
      const same = (j: number) => t.ramp[j] === ramp && t.level[j] === level;
      if (!same(at(x - dy, y + dx)) && !same(at(x + dy, y - dx)))
        bad("ramp is narrower than 2 cells", x, y);
    }
  }
  return [...found].map(
    ([rule, { x, y, n }]) => `${rule} at (${x}, ${y})${n > 1 ? ` and ${n - 1} more` : ""}`,
  );
}
