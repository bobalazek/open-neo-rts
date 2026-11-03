// Babylon renderer: scene, RTS camera and terrain. Reads sim presentation, never writes sim state.

import { DirectionalLight, Viewport } from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import { createRtsCamera } from "./camera";
import { createEngine, createScene } from "./scene";
import { createQuality, type GraphicsQuality } from "./scene/quality";
import { CELL_SIZE, createTerrain } from "./terrain";

export type { Biome } from "@open-neo-rts/content";
export { cameraGroundView } from "./camera";
export { createCombatEffects } from "./effects";
export { createFogPresentation } from "./fog";
export { createDebugOverlays, type DebugOverlayVisibility } from "./overlays";
export { createPlacementOverlay } from "./overlays/placement";
export {
  type BattlefieldAction,
  type BattlefieldHudContent,
  createBattlefieldHud,
} from "./scene/battlefield-hud";
export { createMenuScene, type MenuAction } from "./scene/menu";
export { createPanelScene, type PanelContent } from "./scene/panel";
export type { PanelBlock } from "./scene/panel-content";
export { createRenderCounters } from "./scene/performance";
export type { GraphicsQuality } from "./scene/quality";
export { createSkirmishScene, type SkirmishField } from "./scene/skirmish";
export { CELL_SIZE, LEVEL_HEIGHT, PALETTES } from "./terrain";
export {
  createMapPresentation,
  type MapDecoration,
  type MapResource,
  resourceInstances,
  type StaticMapInstance,
} from "./terrain/objects";
export { createEntityPresentation } from "./units";
export { createModelPreview } from "./units/preview";
export { createOrderWaypoints } from "./units/waypoints";

export interface RendererOptions {
  terrain: TerrainGrid;
  quality?: GraphicsQuality;
  tiltShift?: boolean;
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
  const sun = scene.getLightByName("sun");
  if (!(sun instanceof DirectionalLight)) throw new Error("Scene has no directional sun");
  const quality = createQuality(scene, camera, sun);
  const setQuality = (next: GraphicsQuality, tiltShift = false) => {
    terrain.setQuality(next);
    quality.setQuality(next, tiltShift);
  };
  setQuality(options.quality ?? "medium", options.tiltShift);

  const render = () => scene.render();
  const resize = () => engine.resize();
  engine.runRenderLoop(render);
  addEventListener("resize", resize);
  return {
    engine,
    scene,
    camera,
    terrain,
    setQuality,
    /** Keep the camera's target in the playable area rather than behind fixed HUD panels. */
    setViewInsets(top: number, bottom: number) {
      const height = Math.max(1, canvas.clientHeight);
      const insetTop = Math.max(0, Math.min(height - 1, top));
      const insetBottom = Math.max(0, Math.min(height - insetTop - 1, bottom));
      camera.viewport = new Viewport(
        0,
        insetBottom / height,
        1,
        (height - insetTop - insetBottom) / height,
      );
    },
    /** Pick only authored ground/water, never a model that covers the intended cell. */
    pickCell(clientX: number, clientY: number) {
      const bounds = canvas.getBoundingClientRect();
      const hit = scene.pick(
        clientX - bounds.left,
        clientY - bounds.top,
        (mesh) => mesh.parent === terrain && mesh.isPickable,
      );
      const point = hit?.pickedPoint;
      if (!point) return null;
      const x = Math.floor(point.x / CELL_SIZE);
      const y = Math.floor(point.z / CELL_SIZE);
      return x >= 0 && y >= 0 && x < grid.width && y < grid.height ? { x, y } : null;
    },
    dispose() {
      removeEventListener("resize", resize);
      engine.stopRenderLoop(render);
      quality.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
