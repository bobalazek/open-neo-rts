// Babylon renderer: scene, RTS camera and terrain. Reads sim presentation, never writes sim state.

import type { TerrainGrid } from "@open-neo-rts/content";
import { createRtsCamera } from "./camera";
import { createEngine, createScene } from "./scene";
import { CELL_SIZE, createTerrain } from "./terrain";

export type { Biome } from "@open-neo-rts/content";
export {
  createMapPresentation,
  type MapDecoration,
  type MapResource,
  resourceInstances,
  type StaticMapInstance,
} from "./terrain/objects";
export { createEntityPresentation } from "./units";
export { createModelPreview } from "./units/preview";

export interface RendererOptions {
  terrain: TerrainGrid;
}

export async function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions) {
  const engine = await createEngine(canvas);
  const scene = createScene(engine);
  const grid = options.terrain;
  const terrain = createTerrain(scene, grid);
  const camera = createRtsCamera(scene, canvas, {
    minX: 0,
    maxX: grid.width * CELL_SIZE,
    minZ: 0,
    maxZ: grid.height * CELL_SIZE,
  });

  const render = () => scene.render();
  const resize = () => engine.resize();
  engine.runRenderLoop(render);
  addEventListener("resize", resize);
  return {
    engine,
    scene,
    camera,
    terrain,
    dispose() {
      removeEventListener("resize", resize);
      engine.stopRenderLoop(render);
      scene.dispose();
      engine.dispose();
    },
  };
}
