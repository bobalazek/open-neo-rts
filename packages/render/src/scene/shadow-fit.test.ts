import { expect, spyOn, test } from "bun:test";
import {
  ArcRotateCamera,
  type DirectionalLight,
  Matrix,
  MeshBuilder,
  NullEngine,
  type ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { createScene } from ".";
import { createQuality } from "./quality";
import { registerShadowCaster } from "./shadows";

test("shadow refresh refits dynamic bounds after readiness and reuses that fit for receivers", () => {
  const engine = new NullEngine();
  const scene = createScene(engine);
  const camera = new ArcRotateCamera("test", 1, 1, 60, Vector3.Zero(), scene);
  const sun = scene.getLightByName("sun") as DirectionalLight;
  const quality = createQuality(scene, camera, sun);
  const caster = MeshBuilder.CreateBox("moving rotated caster", { size: 2 }, scene);
  registerShadowCaster(caster);
  const bounds = spyOn(caster, "getBoundingInfo");
  try {
    for (const preset of ["medium", "high", "ultra"] as const) {
      quality.setQuality(preset);
      const generator = sun.getShadowGenerator() as ShadowGenerator;
      const map = generator.getShadowMap();
      if (!map) throw new Error("Missing shadow map");
      // Exercise an early transform cache plus Babylon's real readiness callbacks.
      generator.getTransformMatrix();
      map.isReadyForRendering();
      caster.position.set(-20, 4, 20);
      caster.rotation.y += 0.7;
      caster.computeWorldMatrix(true);
      const added = MeshBuilder.CreateBox("new tall corner caster", { height: 80 }, scene);
      added.position.set(80, 40, -80);
      added.rotation.z = 0.3;
      added.computeWorldMatrix(true);
      registerShadowCaster(added);
      let fitting = false;
      map.onBeforeRenderObservable.add(() => {
        fitting = sun.autoUpdateExtends;
      });
      map.render();
      expect(fitting).toBe(true);
      expect(sun.autoUpdateExtends).toBe(false);
      const fitted = generator.projectionMatrix.clone();
      bounds.mockClear();
      // Receiver material binding runs with a different public render-phase ID.
      scene.incrementRenderId();
      generator.getTransformMatrix();
      expect(bounds).not.toHaveBeenCalled();
      expect(generator.projectionMatrix.equals(fitted)).toBe(true);
      const expected = Matrix.Identity();
      sun.autoUpdateExtends = true;
      sun.setShadowProjectionMatrix(expected, generator.viewMatrix, map.renderList ?? []);
      expect(fitted.equals(expected)).toBe(true);
      sun.autoUpdateExtends = false;
      for (const mesh of [caster, added]) {
        for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
          const clip = Vector3.TransformCoordinates(corner, generator.getTransformMatrix());
          expect(Math.abs(clip.x)).toBeLessThanOrEqual(1.00001);
          expect(Math.abs(clip.y)).toBeLessThanOrEqual(1.00001);
          expect(Math.abs(clip.z)).toBeLessThanOrEqual(1.00001);
        }
      }
      added.dispose();
      caster.position.set(120, 30, 100);
      caster.computeWorldMatrix(true);
      map.render();
      expect(generator.projectionMatrix.equals(fitted)).toBe(false);
      quality.setQuality("low");
      expect(sun.autoUpdateExtends).toBe(true);
      // Disposed targets cannot change the next preset's fitting policy.
      map.onAfterUnbindObservable.notifyObservers(map);
      expect(sun.autoUpdateExtends).toBe(true);
    }
    quality.setQuality("medium");
    const generator = sun.getShadowGenerator() as ShadowGenerator;
    generator.getShadowMap()?.render();
    expect(sun.autoUpdateExtends).toBe(false);
    generator.recreateShadowMap();
    expect(sun.autoUpdateExtends).toBe(true);
    generator.getShadowMap()?.render();
    expect(sun.autoUpdateExtends).toBe(true);
    quality.dispose();
    quality.dispose();
    expect(sun.autoUpdateExtends).toBe(true);
  } finally {
    quality.dispose();
    bounds.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});
