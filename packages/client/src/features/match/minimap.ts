import { BIOMES, SURFACES, type TerrainGrid, WATER } from "@open-neo-rts/content";
import { PALETTES } from "@open-neo-rts/render";
import type { GameplayDefinition, SeatSnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";
import {
  type MapPoint,
  minimapMarkers,
  minimapPoint,
  minimapVision,
  ownBase,
} from "./minimap-model";

/** This presentation owner receives only the seat's copied state and static terrain. */
export function createMinimap(
  root: HTMLElement,
  world: HTMLCanvasElement,
  options: {
    terrain: TerrainGrid;
    definitions: readonly GameplayDefinition[];
    force: number;
    colors: ReadonlyMap<number, string>;
    selection: () => readonly string[];
    pan: (point: MapPoint) => void;
    zoom: (delta: number) => void;
    view: () => readonly MapPoint[];
    camera: () => MapPoint;
    order: (point: MapPoint) => void;
    armAttackMove: () => void;
  },
  signal: AbortSignal,
) {
  const panel = document.createElement("section");
  panel.className = "hud-minimap";
  panel.setAttribute("aria-label", text("ui.minimap.title"));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 440;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", text("ui.minimap.instructions"));
  panel.append(canvas);
  const controls = document.createElement("div");
  controls.className = "minimap-controls";
  const home = document.createElement("button"),
    alert = document.createElement("button");
  home.type = alert.type = "button";
  home.textContent = text("ui.minimap.home");
  alert.textContent = text("ui.minimap.alert");
  alert.disabled = true;
  alert.title = text("ui.minimap.no-alerts");
  controls.append(home, alert);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(controls, status);
  root.querySelector(".hud-panels")?.prepend(panel);
  const canvasContext = canvas.getContext("2d");
  const terrain = options.terrain;
  const background = document.createElement("canvas");
  background.width = terrain.width;
  background.height = terrain.height;
  const backgroundContext = background.getContext("2d");
  if (!canvasContext || !backgroundContext) throw new Error("Minimap canvas is unavailable");
  const context = canvasContext,
    ground = backgroundContext;
  const pixels = ground.createImageData(terrain.width, terrain.height);
  const definitions = new Map(options.definitions.map((definition) => [definition.id, definition]));
  let snapshot: SeatSnapshot | undefined,
    lastDraw = -Infinity;
  let drag: number | undefined;
  function point(event: { clientX: number; clientY: number }) {
    return minimapPoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
      terrain.width,
      terrain.height,
    );
  }
  function pan(point: MapPoint) {
    options.pan(point);
    canvas.dataset.cameraCell = `${Math.floor(point.x)},${Math.floor(point.y)}`;
  }
  function goHome() {
    const base = snapshot && ownBase(snapshot, definitions, options.force);
    if (!base) {
      status.textContent = text("ui.minimap.no-base");
      return;
    }
    pan(base);
    status.textContent = "";
  }
  function cancelDrag() {
    if (drag !== undefined && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
    drag = undefined;
  }
  home.addEventListener("click", goHome, { signal });
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.focus({ preventScroll: true });
      if (event.altKey || event.shiftKey) {
        status.textContent = text(event.altKey ? "ui.minimap.no-pings" : "ui.minimap.no-queue");
        return;
      }
      const cell = point(event);
      if (!cell) return;
      status.textContent = "";
      if (event.button === 2) {
        options.order(cell);
        return;
      }
      drag = event.pointerId;
      canvas.setPointerCapture(drag);
      pan(cell);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerId === drag) {
        const cell = point(event);
        if (cell) pan(cell);
      }
    },
    { signal },
  );
  canvas.addEventListener("pointerup", cancelDrag, { signal });
  canvas.addEventListener("pointercancel", cancelDrag, { signal });
  canvas.addEventListener(
    "lostpointercapture",
    () => {
      drag = undefined;
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      options.zoom(event.deltaY);
    },
    { signal, passive: false },
  );
  function shortcuts(event: KeyboardEvent) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat)
      return;
    if (event.code === "Home") {
      event.preventDefault();
      goHome();
    } else if (event.code === "Space") {
      event.preventDefault();
      status.textContent = text("ui.minimap.no-alerts");
    } else if (event.currentTarget === canvas) {
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.code];
      if (direction) {
        event.preventDefault();
        const current = options.camera();
        pan({
          x: Math.max(0, Math.min(terrain.width - 1, current.x + (direction[0] ?? 0))),
          y: Math.max(0, Math.min(terrain.height - 1, current.y + (direction[1] ?? 0))),
        });
      }
      if (event.code === "KeyA") {
        event.preventDefault();
        options.armAttackMove();
      }
    }
  }
  world.addEventListener("keydown", shortcuts, { signal });
  canvas.addEventListener("keydown", shortcuts, { signal });
  window.addEventListener(
    "blur",
    () => {
      cancelDrag();
    },
    { signal },
  );
  function draw(now: number) {
    if (!snapshot || signal.aborted || now - lastDraw < 100) return;
    lastDraw = now;
    const vision = minimapVision(snapshot, terrain.width, terrain.height);
    for (let i = 0; i < vision.length; i++) {
      const state = vision[i] ?? 0;
      const palette = PALETTES[BIOMES[terrain.biome[i] ?? 0] ?? "temperate"];
      const water = terrain.water[i] ?? 0;
      const color =
        water === WATER.deep
          ? palette.deep
          : water === WATER.shallow
            ? palette.shallow
            : palette.surfaces[SURFACES[terrain.surface[i] ?? 0] ?? "grass"];
      const light =
        state === 0
          ? 0
          : (state === 1 ? 0.35 : 0.8) + (terrain.level[i] ?? 0) * (state === 1 ? 0.01 : 0.025);
      pixels.data[i * 4] = ((color >>> 16) & 255) * light;
      pixels.data[i * 4 + 1] = ((color >>> 8) & 255) * light;
      pixels.data[i * 4 + 2] = (color & 255) * light;
      pixels.data[i * 4 + 3] = 255;
    }
    ground.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(background, 0, 0, canvas.width, canvas.height);
    const sx = canvas.width / terrain.width,
      sy = canvas.height / terrain.height;
    const selected = new Set(options.selection());
    for (const marker of minimapMarkers(
      snapshot,
      definitions,
      terrain.width,
      terrain.height,
      options.force,
      vision,
    )) {
      const x = marker.x * sx,
        y = marker.y * sy;
      context.fillStyle = options.colors.get(marker.force) ?? "#ffc85c";
      context.strokeStyle = selected.has(marker.handle) ? "#ffffff" : "#111b25";
      context.lineWidth = selected.has(marker.handle) ? 2 : 1;
      const size = marker.kind === "unit" ? 4 : Math.max(6, marker.width * sx, marker.height * sy);
      context.beginPath();
      if (marker.kind === "unit") {
        if (marker.force === options.force) context.arc(x, y, size, 0, Math.PI * 2);
        else {
          context.moveTo(x, y - size);
          context.lineTo(x + size, y);
          context.lineTo(x, y + size);
          context.lineTo(x - size, y);
          context.closePath();
        }
      } else context.rect(x - size / 2, y - size / 2, size, size);
      if (marker.kind === "ghost") {
        context.strokeStyle = "#c0ced9";
        context.setLineDash([3, 2]);
        context.stroke();
        context.setLineDash([]);
      } else {
        context.fill();
        context.stroke();
      }
    }
    const view = options.view();
    if (view.length >= 3) {
      context.beginPath();
      view.forEach((point, i) => {
        if (i === 0) context.moveTo(point.x * sx, point.y * sy);
        else context.lineTo(point.x * sx, point.y * sy);
      });
      context.closePath();
      context.lineWidth = 2;
      context.strokeStyle = "#ffffff";
      context.stroke();
    }
    const current = options.camera();
    canvas.dataset.cameraCell = `${Math.floor(current.x)},${Math.floor(current.y)}`;
    canvas.dataset.tick = String(snapshot.tick);
    canvas.dataset.markers = String(
      minimapMarkers(snapshot, definitions, terrain.width, terrain.height, options.force, vision)
        .length,
    );
  }
  signal.addEventListener(
    "abort",
    () => {
      cancelDrag();
      panel.remove();
    },
    { once: true },
  );
  return {
    update(value: SeatSnapshot) {
      snapshot = value;
      home.disabled = !ownBase(value, definitions, options.force);
    },
    frame: draw,
  };
}
