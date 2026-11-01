// Terrain vocabulary the engine understands. Cell values in map layers index into these; see
// docs/design/terrain-and-biomes.md.

export const SURFACES = ["grass", "dirt", "sand", "rock", "snow", "ice", "road", "rubble"] as const;
export type Surface = (typeof SURFACES)[number];

/** Whether structures can be built on a surface. Rubble is what a destroyed structure leaves until cleared. */
export const BUILDABLE: Record<Surface, boolean> = {
  grass: true,
  dirt: true,
  sand: true,
  rock: true,
  snow: true,
  ice: true,
  road: true,
  rubble: false,
};

/** Biome layer values index into this. A map's `biome` is its base: the biome of every cell without a layer. */
export const BIOMES = ["temperate", "desert", "arctic", "urban"] as const;
export type Biome = (typeof BIOMES)[number];

/** Water layer values. */
export const WATER = { none: 0, shallow: 1, deep: 2 } as const;

/**
 * Ramp layer values: the direction a ramp cell rises toward. A ramp cell's level is its low end; the cell it
 * rises toward is one level higher.
 */
export const RAMP = { none: 0, north: 1, east: 2, south: 3, west: 4 } as const;

/** Height levels per cell: 0 to MAX_LEVEL. */
export const MAX_LEVEL = 7;

/** Spawns, resource fields, objects and structures keep at least this many cells from the map edge. */
export const EDGE_MARGIN = 4;
