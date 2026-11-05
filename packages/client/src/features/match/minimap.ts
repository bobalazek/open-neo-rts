import { BIOMES, SURFACES, type TerrainGrid, WATER } from "@open-neo-rts/content";
import { PALETTES } from "@open-neo-rts/render";
import type { GameplayDefinition, SeatSnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";
import {
  bindingText,
  chordText,
  defaultBindings,
  type KeyBindings,
  matchesBinding,
} from "../settings/bindings";
import { createMatchNotices, type NoticeKind, PING_KINDS } from "./alerts";
import { actionText, decorateAction, hudIcon } from "./icons";
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
    readOnly?: boolean;
    bindings?: () => KeyBindings;
  },
  signal: AbortSignal,
) {
  const defaults = defaultBindings();
  const bindings = options.bindings ?? (() => defaults);
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
  home.textContent = text("ui.minimap.home", { key: bindingText(bindings(), "home") });
  alert.textContent = text("ui.minimap.alert", { key: bindingText(bindings(), "alert") });
  decorateAction(home, "rally", "Home");
  decorateAction(alert, "attack", "Space");
  alert.disabled = true;
  alert.title = text("ui.minimap.no-alerts");
  controls.append(home, alert);
  const ping = document.createElement("select");
  ping.setAttribute("aria-label", text("ui.minimap.ping-kind"));
  for (const kind of PING_KINDS) {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = text(`ui.notice.${kind}`);
    ping.append(option);
  }
  const pingCamera = document.createElement("button");
  pingCamera.type = "button";
  pingCamera.textContent = text("ui.minimap.ping-camera");
  decorateAction(pingCamera, "ping");
  const feed = document.createElement("ol");
  feed.className = "match-notices";
  feed.setAttribute("aria-label", text("ui.minimap.feed"));
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const pingOptions = document.createElement("details");
  pingOptions.className = "minimap-pings";
  const pingToggle = document.createElement("summary");
  pingToggle.textContent = text("ui.minimap.pings");
  pingToggle.prepend(hudIcon("rally"));
  pingOptions.append(pingToggle, ping, pingCamera);
  controls.append(pingOptions);
  if (options.readOnly) {
    alert.hidden = true;
    pingOptions.hidden = true;
    feed.hidden = true;
    status.hidden = true;
  }
  panel.append(controls, status);
  root.querySelector(".hud-panels")?.prepend(panel);
  root.querySelector(".match-hud")?.append(feed);
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
  const notices = createMatchNotices(options.force, definitions, terrain.width, terrain.height);
  let feedIds = "";
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
  function noticeLabel(kind: NoticeKind) {
    return text(`ui.notice.${kind}`);
  }
  function refreshFeed() {
    const entries = notices.entries();
    alert.disabled = entries.length === 0;
    alert.title = entries.length
      ? text("ui.minimap.alert", { key: bindingText(bindings(), "alert") })
      : text("ui.minimap.no-alerts");
    const ids = entries.map((entry) => entry.id).join(",");
    if (ids === feedIds) return;
    delete status.dataset.feedback;
    feedIds = ids;
    feed.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${entry.label ?? noticeLabel(entry.kind)} · ${Math.floor(entry.x)}, ${Math.floor(entry.y)}`;
        button.addEventListener("click", () => pan(entry));
        item.append(button);
        return item;
      }),
    );
    status.textContent = entries[0] && !entries[0].label ? noticeLabel(entries[0].kind) : "";
  }
  function nextAlert() {
    const entry = notices.next();
    if (!entry) {
      status.textContent = text("ui.minimap.no-alerts");
      return;
    }
    pan(entry);
    status.textContent = entry.label ?? noticeLabel(entry.kind);
  }
  function placePing(cell: MapPoint) {
    const kind = PING_KINDS.find((kind) => kind === ping.value);
    if (snapshot && kind && notices.ping(snapshot, kind, cell)) {
      refreshFeed();
      status.textContent = text("ui.minimap.local-ping");
    } else status.textContent = text("ui.minimap.ping-unexplored");
    status.dataset.feedback = "";
  }
  function cancelDrag() {
    if (drag !== undefined && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
    drag = undefined;
  }
  function navigate(x: number, y: number, button: number, shift: boolean, alt: boolean) {
    if (signal.aborted || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const cell = minimapPoint(
      x,
      y,
      { left: 0, top: 0, width: 1, height: 1 },
      terrain.width,
      terrain.height,
    );
    if (!cell) return;
    if (options.readOnly) {
      if (button === 0) pan(cell);
      return;
    }
    if (alt) {
      placePing(cell);
      return;
    }
    if (shift) {
      status.textContent = text("ui.minimap.no-queue");
      return;
    }
    status.textContent = "";
    if (button === 2) options.order(cell);
    else if (button === 0) pan(cell);
  }
  home.addEventListener("click", goHome, { signal });
  alert.addEventListener("click", nextAlert, { signal });
  pingCamera.addEventListener(
    "click",
    () => {
      placePing(options.camera());
      if (!root.classList.contains("native-battlefield")) pingOptions.open = false;
      canvas.focus();
    },
    { signal },
  );
  pingOptions.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        pingOptions.open &&
        !root.classList.contains("native-battlefield")
      ) {
        event.preventDefault();
        event.stopPropagation();
        pingOptions.open = false;
        pingToggle.focus();
      }
    },
    { signal },
  );
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !root.classList.contains("native-battlefield") &&
        !pingOptions.contains(event.target as Node)
      )
        pingOptions.open = false;
    },
    { signal, capture: true },
  );
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.focus({ preventScroll: true });
      const cell = point(event);
      if (!cell) return;
      if (event.altKey) {
        placePing(cell);
        return;
      }
      if (event.shiftKey) {
        status.textContent = text("ui.minimap.no-queue");
        return;
      }
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
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (matchesBinding(bindings(), "home", event)) {
      event.preventDefault();
      goHome();
    } else if (matchesBinding(bindings(), "alert", event) && !options.readOnly) {
      event.preventDefault();
      nextAlert();
    } else if (event.currentTarget === canvas) {
      const direction = (
        [
          ["panLeft", [-1, 0]],
          ["panRight", [1, 0]],
          ["panUp", [0, -1]],
          ["panDown", [0, 1]],
        ] as const
      ).find(([id]) => matchesBinding(bindings(), id, event))?.[1];
      if (direction) {
        event.preventDefault();
        const current = options.camera();
        pan({
          x: Math.max(0, Math.min(terrain.width - 1, current.x + (direction[0] ?? 0))),
          y: Math.max(0, Math.min(terrain.height - 1, current.y + (direction[1] ?? 0))),
        });
      }
      if (matchesBinding(bindings(), "attackMove", event) && !options.readOnly) {
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
    for (const notice of notices.entries()) {
      context.beginPath();
      context.arc(
        notice.x * sx,
        notice.y * sy,
        7 + ((snapshot.tick - notice.tick) % 20) / 4,
        0,
        Math.PI * 2,
      );
      context.strokeStyle = PING_KINDS.some((kind) => kind === notice.kind) ? "#81d4ed" : "#ffc85c";
      context.lineWidth = 2;
      context.stroke();
    }
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
    return true;
  }
  signal.addEventListener(
    "abort",
    () => {
      cancelDrag();
      feed.remove();
      panel.remove();
    },
    { once: true },
  );
  return {
    canvas,
    announce(label: string, point: MapPoint, kind: NoticeKind = "announcement") {
      if (options.readOnly || !notices.announce(label, point, kind)) return;
      refreshFeed();
    },
    navigate,
    zoom: options.zoom,
    update(value: SeatSnapshot) {
      snapshot = value;
      for (const [button, action, label] of [
        [home, "home", "ui.minimap.home"],
        [alert, "alert", "ui.minimap.alert"],
      ] as const) {
        actionText(button, text(label, { key: bindingText(bindings(), action) }));
        button.dataset.hotkey = bindings()[action][0] ? chordText(bindings()[action][0]!) : "";
      }
      canvas.setAttribute(
        "aria-label",
        text("ui.minimap.bound-instructions", {
          attack: bindingText(bindings(), "attackMove"),
          home: bindingText(bindings(), "home"),
          alert: bindingText(bindings(), "alert"),
          camera: ["panUp", "panLeft", "panDown", "panRight"]
            .map((id) => bindingText(bindings(), id as "panUp"))
            .join(" / "),
        }),
      );
      if (options.readOnly) return;
      notices.update(value);
      refreshFeed();
      home.disabled = !ownBase(value, definitions, options.force);
    },
    frame: draw,
  };
}
