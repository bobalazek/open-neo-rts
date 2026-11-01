// Engine, scene, lighting. Phase 1b; quality presets come later.

import {
  type AbstractEngine,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";

// ponytail: imports the whole of @babylonjs/core; switch to deep imports if bundle size matters.
export async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  if (await WebGPUEngine.IsSupportedAsync) {
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return engine;
  }
  return new Engine(canvas, true);
}

export function createScene(engine: AbstractEngine): Scene {
  const scene = new Scene(engine);
  // Right-handed like glTF, so grid cell (x, y) maps to world (x, z) with north up on screen.
  scene.useRightHandedSystem = true;
  scene.skipPointerMovePicking = true;
  scene.clearColor = new Color4(0.07, 0.08, 0.1, 1);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.65;
  sky.groundColor = new Color3(0.6, 0.6, 0.65);
  // Soft sun from the south-west, so the cliff faces the camera sees read apart.
  const sun = new DirectionalLight("sun", new Vector3(0.5, -1, -0.35), scene);
  sun.intensity = 0.55;
  return scene;
}
