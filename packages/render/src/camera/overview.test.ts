import { expect, test } from "bun:test";
import { ArcRotateCamera, NullEngine, Scene, Vector3, Viewport } from "@babylonjs/core";
import { cameraGroundView } from ".";

test("camera overview projects a finite ground frame around the current target without scene picks", () => {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera(
    "overview",
    Math.PI / 2,
    0.7,
    60,
    new Vector3(20, 4, 20),
    scene,
  );
  const before = camera.target.clone();
  const points = cameraGroundView(camera);
  expect(points).toHaveLength(4);
  expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
  expect(Math.min(...points.map((point) => point.x))).toBeLessThan(20);
  expect(Math.max(...points.map((point) => point.x))).toBeGreaterThan(20);
  expect(Math.min(...points.map((point) => point.z))).toBeLessThan(20);
  expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(20);
  expect(camera.target.equals(before)).toBe(true);
  camera.viewport = new Viewport(0, 0.5, 1, 0.5);
  const inset = cameraGroundView(camera);
  expect(Math.max(...inset.map((point) => point.x))).toBeGreaterThan(
    Math.max(...points.map((point) => point.x)),
  );
  camera.alpha = 0;
  expect(cameraGroundView(camera)).not.toEqual(points);
  scene.dispose();
  engine.dispose();
});
