// RTS camera: pan (WASD or arrows, right-drag, edge scroll), smooth zoom between limits (wheel), rotate (Q/E,
// middle-drag), pitch tied to zoom, target kept inside the map. Phase 1b.

import { ArcRotateCamera, type Scene, Vector3 } from "@babylonjs/core";

/** World-space rectangle the camera target stays in. */
export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const MIN_DISTANCE = 14;
const MAX_DISTANCE = 110;
/** Angle from vertical when fully zoomed in and fully zoomed out. */
const PITCH_NEAR = 1.0;
const PITCH_FAR = 0.7;
/** Pan speed in camera distances per second. */
const PAN_SPEED = 1.1;
const ROTATE_SPEED = 1.8;
const DRAG_ROTATE = 0.006;
const ZOOM_STEP = 0.0015;
const ZOOM_SMOOTHING = 12;
/** Edge-scroll band in CSS pixels. */
const EDGE = 8;

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createRtsCamera(scene: Scene, canvas: HTMLCanvasElement, bounds: CameraBounds) {
  const centre = new Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  // alpha = π/2 puts the camera south of the target, looking north.
  const camera = new ArcRotateCamera("rts camera", Math.PI / 2, PITCH_FAR, 60, centre, scene);
  camera.inputs.clear();
  camera.minZ = 0.5;
  camera.maxZ = 1000;
  const target = camera.target;
  let goal = camera.radius;
  const keys = new Set<string>();
  let pointer: { x: number; y: number } | null = null;
  let drag: { button: number; x: number; y: number } | null = null;

  // right and forward in metres, relative to the view direction on the ground.
  const pan = (right: number, forward: number) => {
    const s = Math.sin(camera.alpha);
    const c = Math.cos(camera.alpha);
    target.x = clamp(target.x + s * right - c * forward, bounds.minX, bounds.maxX);
    target.z = clamp(target.z - c * right - s * forward, bounds.minZ, bounds.maxZ);
  };

  const off = new AbortController();
  const signal = off.signal;
  scene.onDisposeObservable.addOnce(() => off.abort());
  window.addEventListener("keydown", (e) => keys.add(e.code), { signal });
  window.addEventListener("keyup", (e) => keys.delete(e.code), { signal });
  window.addEventListener("blur", () => keys.clear(), { signal });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 1 && e.button !== 2) return;
      e.preventDefault();
      drag = { button: e.button, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      pointer = { x: e.offsetX, y: e.offsetY };
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.button === 1) {
        camera.alpha -= dx * DRAG_ROTATE;
        return;
      }
      // Grab the ground: metres per pixel at the target, stretched along the view by the pitch.
      const m = (2 * camera.radius * Math.tan(camera.fov / 2)) / canvas.clientHeight;
      pan(-dx * m, (dy * m) / Math.cos(camera.beta));
    },
    { signal },
  );
  canvas.addEventListener("pointerup", () => (drag = null), { signal });
  canvas.addEventListener("pointercancel", () => (drag = null), { signal });
  canvas.addEventListener("pointerleave", () => (pointer = null), { signal });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      goal = clamp(goal * Math.exp(e.deltaY * ZOOM_STEP), MIN_DISTANCE, MAX_DISTANCE);
    },
    { signal, passive: false },
  );

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    let right = 0;
    let forward = 0;
    for (const k of keys) {
      const v = PAN_KEYS[k];
      if (v) {
        right += v[0];
        forward += v[1];
      }
    }
    if (pointer && !drag) {
      if (pointer.x < EDGE) right -= 1;
      if (pointer.x > canvas.clientWidth - EDGE) right += 1;
      if (pointer.y < EDGE) forward += 1;
      if (pointer.y > canvas.clientHeight - EDGE) forward -= 1;
    }
    const speed = camera.radius * PAN_SPEED * dt;
    if (right || forward) pan(Math.sign(right) * speed, Math.sign(forward) * speed);
    camera.alpha += ((keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0)) * ROTATE_SPEED * dt;
    camera.radius += (goal - camera.radius) * (1 - Math.exp(-ZOOM_SMOOTHING * dt));
    const t = (camera.radius - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    camera.beta = PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * t;
  });
  return camera;
}
