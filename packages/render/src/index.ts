// Babylon renderer: scene, RTS camera and terrain. Reads sim presentation, never writes sim state.

import { BIOMES, type Biome, type TerrainGrid } from "@open-neo-rts/content";
import { createRtsCamera } from "./camera";
import { createEngine, createScene } from "./scene";
import { CELL_SIZE, createDemoGrid, createTerrain } from "./terrain";

export type { Biome } from "@open-neo-rts/content";

export interface RendererOptions {
  terrain?: TerrainGrid;
  biome?: Biome;
}

export async function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
  const engine = await createEngine(canvas);
  const scene = createScene(engine);
  // shortcut: demo grid and ?biome= stand in until the client passes a loaded map and its biome.
  const grid = options.terrain ?? createDemoGrid(options.biome ?? demoBiome());
  const terrain = createTerrain(scene, grid);
  const camera = createRtsCamera(scene, canvas, {
    minX: 0,
    maxX: grid.width * CELL_SIZE,
    minZ: 0,
    maxZ: grid.height * CELL_SIZE,
  });

  engine.runRenderLoop(() => scene.render());
  addEventListener("resize", () => engine.resize());
  return { engine, scene, camera, terrain };
}

function demoBiome(): Biome {
  const name = new URLSearchParams(location.search).get("biome") ?? "";
  return BIOMES.find((biome) => biome === name) ?? "temperate";
}
