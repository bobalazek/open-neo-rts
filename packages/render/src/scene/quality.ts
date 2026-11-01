import {
  ArcRotateCamera,
  type Camera,
  DefaultRenderingPipeline,
  type DirectionalLight,
  type Scene,
  ShadowGenerator,
  SSAO2RenderingPipeline,
} from "@babylonjs/core";
import { setSceneShadows } from "./shadows";

export type GraphicsQuality = "low" | "medium" | "high" | "ultra";

/** Owns only map-scene quality resources; isolated model previews keep neutral lighting. */
export function createQuality(scene: Scene, camera: Camera, sun: DirectionalLight) {
  const engine = scene.getEngine();
  const nativeScale = engine.getHardwareScalingLevel();
  let shadows: ShadowGenerator | undefined;
  let pipeline: DefaultRenderingPipeline | undefined;
  let ao: SSAO2RenderingPipeline | undefined;
  let focus: ReturnType<typeof scene.onBeforeRenderObservable.add>;
  let disposed = false;
  function clear() {
    setSceneShadows(scene, undefined, false);
    shadows?.dispose();
    shadows = undefined;
    if (ao) {
      ao.dispose();
      scene.disablePrePassRenderer();
    }
    ao = undefined;
    if (pipeline?.depthOfFieldEnabled) scene.disableDepthRenderer(camera);
    pipeline?.dispose();
    pipeline = undefined;
    scene.onBeforeRenderObservable.remove(focus);
    focus = null;
    scene.imageProcessingConfiguration.contrast = 1;
  }
  return {
    setQuality(quality: GraphicsQuality, tiltShift = false) {
      if (disposed) throw new Error("Renderer quality is disposed");
      clear();
      engine.setHardwareScalingLevel(nativeScale / (quality === "low" ? 0.75 : 1));
      engine.resize();
      if (quality === "low") {
        setSceneShadows(scene, undefined, true);
        return;
      }
      shadows = new ShadowGenerator(quality === "medium" ? 1024 : 2048, sun);
      shadows.bias = 0.001;
      shadows.normalBias = 0.04;
      sun.autoCalcShadowZBounds = true;
      shadows.usePercentageCloserFiltering = quality === "ultra";
      setSceneShadows(scene, shadows, false);
      // SSAO2 supports both WebGL2 and WebGPU; omit it on devices without the required MRT support.
      if (quality !== "medium" && SSAO2RenderingPipeline.IsSupported) {
        ao = new SSAO2RenderingPipeline("quality AO", scene, quality === "ultra" ? 1 : 0.5, [
          camera,
        ]);
        ao.samples = quality === "ultra" ? 16 : 8;
        ao.expensiveBlur = quality === "ultra";
        ao.radius = 1;
        ao.totalStrength = 0.5;
      }
      pipeline = new DefaultRenderingPipeline("quality", false, scene, [camera]);
      scene.imageProcessingConfiguration.contrast = 1.08;
      pipeline.bloomEnabled = quality !== "medium";
      pipeline.bloomThreshold = 0.85;
      pipeline.bloomWeight = 0.15;
      pipeline.bloomKernel = 32;
      // Babylon's world-space depth of field follows the RTS focus plane as the camera zooms.
      pipeline.depthOfFieldEnabled = quality === "ultra" && tiltShift;
      if (pipeline.depthOfFieldEnabled && camera instanceof ArcRotateCamera) {
        const depth = pipeline.depthOfField;
        depth.fStop = 4;
        depth.focalLength = 100;
        focus = scene.onBeforeRenderObservable.add(() => {
          depth.focusDistance = camera.radius * 1000;
        });
      }
    },
    dispose() {
      if (disposed) return;
      clear();
      engine.setHardwareScalingLevel(nativeScale);
      disposed = true;
    },
  };
}
