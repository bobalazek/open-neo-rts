// RTS camera: arrows/right-drag/edge pan, wheel zoom, middle-drag rotate; target stays inside the map.

import { ArcRotateCamera, Matrix, Ray, type Scene, Vector3 } from "@babylonjs/core";

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
const DRAG_ROTATE = 0.006;
const ZOOM_STEP = 0.0015;
const ZOOM_SMOOTHING = 12;
/** Edge-scroll band in CSS pixels. */
const EDGE = 8;

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
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
  let drag: { button: number; x: number; y: number; moved: boolean } | null = null;
  let selecting = false;

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
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        e.target instanceof Element &&
        e.target.closest("input, select, textarea, button, a, [contenteditable]")
      )
        return;
      if (e.code === "Backspace") {
        e.preventDefault();
        camera.alpha = Math.PI / 2;
      }
      if (PAN_KEYS[e.code]) {
        e.preventDefault();
        keys.add(e.code);
      }
    },
    { signal },
  );
  window.addEventListener("keyup", (e) => keys.delete(e.code), { signal });
  window.addEventListener("blur", () => keys.clear(), { signal });
  window.addEventListener(
    "focusin",
    (event) => {
      if (event.target !== canvas) keys.clear();
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button === 0) selecting = true;
      if (e.button !== 1 && e.button !== 2) return;
      e.preventDefault();
      drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
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
      if (drag.button === 2 && !drag.moved && Math.hypot(dx, dy) <= 5) return;
      drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.button === 1) {
        camera.alpha -= dx * DRAG_ROTATE;
        return;
      }
      // Grab the ground: metres per pixel at the target, stretched along the view by the pitch.
      const m =
        (2 * camera.radius * Math.tan(camera.fov / 2)) /
        (canvas.clientHeight * camera.viewport.height);
      pan(-dx * m, (dy * m) / Math.cos(camera.beta));
    },
    { signal },
  );
  const release = () => {
    drag = null;
    selecting = false;
  };
  canvas.addEventListener("pointerup", release, { signal });
  window.addEventListener("pointerup", release, { signal });
  canvas.addEventListener("pointercancel", release, { signal });
  canvas.addEventListener("lostpointercapture", release, { signal });
  window.addEventListener("blur", release, { signal });
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
    if (pointer && !drag && !selecting) {
      if (pointer.x < EDGE) right -= 1;
      if (pointer.x > canvas.clientWidth - EDGE) right += 1;
      if (pointer.y < EDGE) forward += 1;
      if (pointer.y > canvas.clientHeight - EDGE) forward -= 1;
    }
    const speed = camera.radius * PAN_SPEED * dt;
    if (right || forward) pan(Math.sign(right) * speed, Math.sign(forward) * speed);
    camera.radius += (goal - camera.radius) * (1 - Math.exp(-ZOOM_SMOOTHING * dt));
    const t = (camera.radius - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    camera.beta = PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * t;
  });
  return Object.assign(camera, {
    panTo(x: number, z: number, height = target.y) {
      target.set(clamp(x, bounds.minX, bounds.maxX), height, clamp(z, bounds.minZ, bounds.maxZ));
      keys.clear();
      pointer = null;
    },
    zoomBy(delta: number) {
      goal = clamp(goal * Math.exp(delta * ZOOM_STEP), MIN_DISTANCE, MAX_DISTANCE);
    },
  });
}

/** Camera-only ground-plane footprint; never queries world occupancy or hidden entities. */
export function cameraGroundView(camera: ArcRotateCamera): { x: number; z: number }[] {
  const engine = camera.getScene().getEngine();
  const width = engine.getRenderWidth(),
    height = engine.getRenderHeight();
  camera.getViewMatrix(true);
  const view = camera.getViewMatrix(),
    projection = camera.getProjectionMatrix(true);
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].flatMap(([x = 0, y = 0]) => {
    const ray = Ray.CreateNew(x, y, width, height, Matrix.Identity(), view, projection);
    if (ray.direction.y >= -0.000001) return [];
    const distance = (camera.target.y - ray.origin.y) / ray.direction.y;
    if (distance < 0) return [];
    return [
      {
        x: ray.origin.x + ray.direction.x * distance,
        z: ray.origin.z + ray.direction.z * distance,
      },
    ];
  });
}
