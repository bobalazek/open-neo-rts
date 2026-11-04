/// <reference path="../../assets.d.ts" />
import {
  checkTerrain,
  parseTerrain,
  SCHEMAS,
  type TerrainLayers,
  validate,
} from "@open-neo-rts/content";
import type { MapDecoration, MapResource } from "@open-neo-rts/render";
import biomeLayer from "../../../../../content/core/maps/sandbox-biomes/biome.r8";
import biomes from "../../../../../content/core/maps/sandbox-biomes/map.json";
import biomeSurface from "../../../../../content/core/maps/sandbox-biomes/surface.r8";
import flat from "../../../../../content/core/maps/sandbox-flat/map.json";
import resources from "../../../../../content/core/maps/sandbox-resources/map.json";
import terrainHeight from "../../../../../content/core/maps/sandbox-terrain/height.r8";
import terrain from "../../../../../content/core/maps/sandbox-terrain/map.json";
import terrainRamps from "../../../../../content/core/maps/sandbox-terrain/ramps.r8";
import water from "../../../../../content/core/maps/sandbox-water/map.json";
import waterLayer from "../../../../../content/core/maps/sandbox-water/water.r8";
import trainingHeight from "../../../../../content/core/maps/training-grounds/height.r8";
import training from "../../../../../content/core/maps/training-grounds/map.json";
import trainingRamps from "../../../../../content/core/maps/training-grounds/ramps.r8";

interface MapEntry {
  definition: {
    id: string;
    name: string;
    players: { min: number; max: number };
    biome: string;
    size: { width: number; height: number };
    objects: readonly MapDecoration[];
    resources: readonly (MapResource & { amount?: number })[];
    spawns: readonly { id: string; position: readonly number[]; facing: number }[];
  };
  layers: Partial<Record<keyof TerrainLayers, string>>;
}

// shortcut: built-in maps are registered by hand until pack loading arrives in phase 2.
export const MAPS: readonly MapEntry[] = [
  { definition: flat, layers: {} },
  { definition: terrain, layers: { height: terrainHeight, ramps: terrainRamps } },
  { definition: water, layers: { water: waterLayer } },
  { definition: resources, layers: {} },
  { definition: biomes, layers: { biome: biomeLayer, surface: biomeSurface } },
  { definition: training, layers: { height: trainingHeight, ramps: trainingRamps } },
];

export async function loadMap(id: string) {
  const entry = MAPS.find(({ definition }) => `core.${definition.id}` === id);
  if (!entry) throw new Error(`Unknown map: ${id}`);
  const issues = validate(SCHEMAS.map, entry.definition);
  if (issues.length)
    throw new Error(`Invalid map: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  const layers: TerrainLayers = {};
  await Promise.all(
    Object.entries(entry.layers).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Map layer request failed: ${response.status}`);
      layers[key as keyof TerrainLayers] = new Uint8Array(await response.arrayBuffer());
    }),
  );
  const { width, height } = entry.definition.size;
  const grid = parseTerrain(width, height, layers, entry.definition.biome);
  const errors = checkTerrain(grid);
  if (errors.length) throw new Error(errors.join("; "));
  return { definition: entry.definition, grid };
}
