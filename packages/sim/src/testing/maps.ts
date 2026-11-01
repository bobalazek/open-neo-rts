import type { MatchMap } from "../match";

/** Fresh, tiny flat input, including explicit zero-valued terrain layers. */
export function flatMap(width = 8, height = width): MatchMap {
  return {
    id: "map:fixture-flat",
    terrain: {
      width,
      height,
      level: Array(width * height).fill(0),
      ramp: Array(width * height).fill(0),
      surface: Array(width * height).fill(0),
      water: Array(width * height).fill(0),
      biome: Array(width * height).fill(0),
    },
    spawns: [],
    objects: [],
  };
}

/** Two-cell-wide east ramp onto a plateau, shallows/deep water and all four biomes. */
export function terrainMap(): MatchMap {
  const map = flatMap();
  const { terrain } = map;
  const level = [...terrain.level];
  const ramp = [...terrain.ramp];
  const water = [...terrain.water];
  const surface = [...terrain.surface];
  const biome = [...terrain.biome];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const cell = y * 8 + x;
      if (x >= 4 && y < 4) level[cell] = 1;
      if (x === 3 && (y === 1 || y === 2)) ramp[cell] = 2;
      if (x >= 5 && y >= 5) water[cell] = x >= 6 && y >= 6 ? 2 : 1;
      surface[cell] = x % 8;
      biome[cell] = Math.floor(x / 4) + 2 * Math.floor(y / 4);
    }
  return {
    ...map,
    id: "map:fixture-terrain",
    terrain: { ...terrain, level, ramp, water, surface, biome },
  };
}
