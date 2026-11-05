// Engine, neutral scene and lighting. Map quality is owned by the renderer.
/// <reference path="./webgpu-assets.d.ts" />

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
import glslangJs from "@babylonjs/core/assets/glslang/glslang.js" with { type: "file" };
import glslangWasm from "@babylonjs/core/assets/glslang/glslang.wasm" with { type: "file" };
import twgslJs from "@babylonjs/core/assets/twgsl/twgsl.js" with { type: "file" };
import twgslWasm from "@babylonjs/core/assets/twgsl/twgsl.wasm" with { type: "file" };

// ponytail: imports the whole of @babylonjs/core; switch to deep imports if bundle size matters.
export async function createEngine(
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<AbstractEngine> {
  signal?.throwIfAborted();
  const gpuSupported = await WebGPUEngine.IsSupportedAsync;
  signal?.throwIfAborted();
  if (gpuSupported) {
    const engine = new WebGPUEngine(canvas, { antialias: true });
    const abort = () => engine.dispose();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      // Root paths in dev and build (publicPath "/"); dev import.meta.url is file://.
      await engine.initAsync(
        { jsPath: glslangJs, wasmPath: glslangWasm },
        { jsPath: twgslJs, wasmPath: twgslWasm },
      );
      signal?.throwIfAborted();
      return engine;
    } catch {
      engine.dispose();
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }
  signal?.throwIfAborted();
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
