import { NullEngine, Scene } from "../../../packages/render/node_modules/@babylonjs/core/index.js";
import { createRtsCamera } from "../../../packages/render/src/camera";

export function mount() {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  const engine = new NullEngine({
    renderWidth: 600,
    renderHeight: 400,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  const camera = createRtsCamera(scene, canvas, {
    minX: -1000,
    maxX: 1000,
    minZ: -1000,
    maxZ: 1000,
  });
  const reset = (mouseSensitivity = 1, invertDragRotate = false) => {
    camera.setInputEnabled(false);
    camera.radius = 60;
    camera.alpha = Math.PI / 2;
    camera.panTo(0, 0);
    camera.setInputEnabled(true);
    camera.setControls({
      panSpeed: 1,
      edgeScroll: false,
      reducedMotion: true,
      mouseSensitivity,
      invertDragRotate,
    });
  };
  reset();
  return {
    camera,
    reset,
    pose() {
      scene.render();
      return { x: camera.target.x, z: camera.target.z, alpha: camera.alpha, radius: camera.radius };
    },
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
