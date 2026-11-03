import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Slider } from "@babylonjs/gui/2D/controls/sliders/slider";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import type { BattlefieldAction } from "./battlefield-hud";
import { BattlefieldMap } from "./battlefield-map";
import { placePanelControl as place } from "./panel-content";

export interface ReplayHudContent {
  title: string;
  time: string;
  status: string;
  timelineLabel: string;
  tick: number;
  duration: number;
  scale: number;
  actions: readonly BattlefieldAction[];
  players: readonly {
    name: string;
    color: string;
    metrics: readonly { label: string; value: string; image: string }[];
    production: readonly { image: string; label: string; progress: number }[];
  }[];
}

/** Read-only replay controls share the match palette, original icons and circular map. */
export function createReplayHud(
  scene: Scene,
  canvas: HTMLCanvasElement,
  mapSource: HTMLCanvasElement,
  options: {
    seek: (tick: number) => void;
    pan: (x: number, y: number) => void;
    zoom: (delta: number) => void;
    mapFocus: () => void;
  },
) {
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("replay HUD", true, scene);
  gui.disableTabNavigation = true;
  gui.renderAtIdealSize = true;
  const off = new AbortController();
  const compactNumber = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const text = (name: string, size = 13, color = "#eff1e9") => {
    const node = new TextBlock(name);
    node.fontFamily = "Arial";
    node.fontSize = size;
    node.color = color;
    node.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    node.isHitTestVisible = false;
    gui.addControl(node);
    return node;
  };
  const frame = (name: string) => {
    const node = new Rectangle(name);
    node.background = "#182126";
    node.color = "#475354";
    node.thickness = 1;
    node.isPointerBlocker = true;
    gui.addControl(node);
    return node;
  };
  const header = frame("replay header"),
    transport = frame("replay transport"),
    players = frame("replay players");
  const timelineFocus = frame("focused replay timeline");
  timelineFocus.background = "transparent";
  timelineFocus.color = "#fff6db";
  timelineFocus.thickness = 2;
  timelineFocus.isVisible = timelineFocus.isHitTestVisible = timelineFocus.isPointerBlocker = false;
  const title = text("replay map", 14, "#ddc382"),
    time = text("replay time"),
    status = text("replay progress", 12, "#ddc382");
  const tooltipFrame = frame("replay tooltip"),
    tooltip = text("replay tooltip text", 12);
  tooltipFrame.isPointerBlocker = tooltipFrame.isHitTestVisible = false;
  tooltip.textWrapping = true;
  tooltipFrame.isVisible = tooltip.isVisible = false;
  const mini = new BattlefieldMap(mapSource);
  gui.addControl(mini);
  const slider = new Slider("replay timeline");
  slider.minimum = 0;
  slider.maximum = 1;
  slider.value = 0;
  slider.color = "#ddc382";
  slider.background = "#475354";
  slider.thumbWidth = "12px";
  slider.isPointerBlocker = true;
  gui.addControl(slider);
  const buttons = new Map<
    string,
    { button: Button; image: Image; label: TextBlock; action: BattlefieldAction }
  >();
  const playerNodes: Control[] = [];
  let content: ReplayHudContent | undefined,
    focused: string | undefined,
    dragging = false,
    mapDrag = false;
  let playerIdentity = "";
  let boxes: { x: number; y: number; w: number; h: number }[] = [];
  function hint(value: string) {
    tooltip.text = value;
    tooltipFrame.isVisible = tooltip.isVisible = !!value;
  }
  function focusHint() {
    hint(
      focused === "timeline"
        ? (content?.timelineLabel ?? "")
        : (buttons.get(focused ?? "")?.action.tooltip ?? ""),
    );
  }
  function layout() {
    if (!content) return;
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight);
    gui.idealWidth = width;
    gui.idealHeight = height;
    const scale = Math.min(content.scale, Math.max(0.8, width / 420)),
      compact = width < 700;
    const unit = 36 * scale,
      gap = 5 * scale,
      edge = 12;
    const mapSize = (compact ? 112 : 204) * scale,
      mapX = width - edge - mapSize,
      mapY = height - edge - mapSize;
    const transportWidth = mapX - edge - 12,
      transportHeight = 96 * scale,
      transportY = height - edge - transportHeight;
    place(header, edge, edge, width - 24, 42 * scale);
    place(title, 24, edge, Math.max(40, width - 270 * scale), 42 * scale);
    place(transport, edge, transportY, Math.max(160, transportWidth), transportHeight);
    place(time, 24, transportY + 6 * scale, transportWidth - 24, 20 * scale);
    place(slider, 24, transportY + 29 * scale, transportWidth - 24, 16 * scale);
    place(timelineFocus, 22, transportY + 26 * scale, transportWidth - 20, 22 * scale);
    place(mini, mapX, mapY, mapSize, mapSize);
    place(status, 24, transportY - 30, Math.max(180, width - mapSize - 40), 24);
    let x = 24;
    for (const id of ["backward", "play", "forward", "speed"]) {
      const item = buttons.get(id);
      if (!item) continue;
      const w = id === "speed" ? 54 * scale : unit;
      place(item.button, x, transportY + 52 * scale, w, unit);
      place(item.image, 6 * scale, 6 * scale, w - 12 * scale, unit - 12 * scale);
      place(item.label, 0, 0, w, unit);
      x += w + gap;
    }
    const vision = buttons.get("vision"),
      exit = buttons.get("exit");
    if (vision) {
      const w = 166 * scale;
      place(vision.button, width - 24 - unit - gap - w, 15, w, unit);
      place(vision.image, 6, 7, 22 * scale, 22 * scale);
      place(vision.label, 34 * scale, 0, w - 38 * scale, unit);
    }
    if (exit) {
      place(exit.button, width - 24 - unit, 15, unit, unit);
      place(exit.image, 6, 6, unit - 12, unit - 12);
    }
    const playerWidth = Math.min(width - 24, 450 * scale),
      rowHeight = 52 * scale;
    place(players, edge, 62 * scale, playerWidth, content.players.length * rowHeight + 12 * scale);
    let n = 0;
    content.players.forEach((player, index) => {
      const y = 68 * scale + index * rowHeight;
      const name = playerNodes[n++]!;
      place(name, 24, y, playerWidth - 24, 20 * scale);
      let metricX = 24;
      for (const _metric of player.metrics) {
        place(playerNodes[n++]!, metricX, y + 24 * scale, 18 * scale, 18 * scale);
        place(playerNodes[n++]!, metricX + 23 * scale, y + 21 * scale, 54 * scale, 24 * scale);
        metricX += 80 * scale;
      }
      for (const _item of player.production) {
        const node = playerNodes[n++]!;
        node.isVisible = metricX + 27 * scale <= playerWidth;
        place(node, metricX, y + 19 * scale, 27 * scale, 27 * scale);
        metricX += 31 * scale;
      }
    });
    tooltipFrame.zIndex = 10;
    tooltip.zIndex = 11;
    const tipWidth = Math.min(360, width - 24);
    place(tooltipFrame, 12, transportY - 106, tipWidth, 66);
    place(tooltip, 24, transportY - 100, tipWidth - 24, 54);
    boxes = [
      { x: edge, y: edge, w: width - 24, h: 42 * scale },
      {
        x: edge,
        y: 62 * scale,
        w: playerWidth,
        h: content.players.length * rowHeight + 12 * scale,
      },
      { x: edge, y: transportY, w: transportWidth, h: transportHeight },
      { x: mapX, y: mapY, w: mapSize, h: mapSize },
    ];
  }
  function update(next: ReplayHudContent) {
    content = next;
    title.text = next.title;
    time.text = next.time;
    status.text = next.status;
    slider.maximum = next.duration;
    if (!dragging) slider.value = next.tick;
    for (const action of next.actions) {
      let item = buttons.get(action.id);
      if (!item) {
        const button = new Button(action.id);
        button.background = "#18262e";
        button.color = "#475354";
        button.thickness = 1;
        button.cornerRadius = 0;
        button.isPointerBlocker = true;
        button.hoverCursor = "pointer";
        gui.addControl(button);
        const image = new Image(`${action.id} icon`);
        image.isHitTestVisible = false;
        button.addControl(image);
        const label = new TextBlock(`${action.id} value`);
        label.fontFamily = "Arial";
        label.fontSize = 12;
        label.color = "#eff1e9";
        label.isHitTestVisible = false;
        button.addControl(label);
        item = { button, image, label, action };
        buttons.set(action.id, item);
        button.onPointerEnterObservable.add(() => {
          hint(buttons.get(action.id)!.action.tooltip);
          button.color = "#ddc382";
        });
        button.onPointerOutObservable.add(() => {
          focusHint();
          button.color = focused === action.id ? "#fff6db" : "#475354";
        });
        button.onPointerClickObservable.add(() => {
          const current = buttons.get(action.id)!.action;
          hint("");
          if (!current.disabled) current.activate();
        });
      }
      item.action = action;
      item.button.alpha = action.disabled ? 0.45 : 1;
      if (item.image.source !== (action.image ?? "")) item.image.source = action.image ?? "";
      item.image.isVisible = !!action.image;
      item.label.text = ["vision", "speed"].includes(action.id) ? action.label : "";
    }
    const identity = JSON.stringify(
      next.players.map((player) => ({
        name: player.name,
        color: player.color,
        metrics: player.metrics.map(({ label, image }) => ({ label, image })),
        production: player.production.map(({ label, image }) => ({ label, image })),
      })),
    );
    if (playerIdentity !== identity) {
      playerIdentity = identity;
      for (const node of playerNodes) node.dispose();
      playerNodes.length = 0;
      for (const [index, player] of next.players.entries()) {
        const name = text(player.name, 12, player.color);
        name.text = player.name;
        playerNodes.push(name);
        for (const [metricIndex, metric] of player.metrics.entries()) {
          const image = new Image(metric.label, metric.image);
          gui.addControl(image);
          const value = text(metric.label);
          value.text = metric.value;
          for (const node of [image, value]) {
            node.isHitTestVisible = true;
            node.onPointerEnterObservable.add(() =>
              hint(
                `${metric.label}: ${content?.players[index]?.metrics[metricIndex]?.value ?? ""}`,
              ),
            );
            node.onPointerOutObservable.add(() => hint(""));
          }
          playerNodes.push(image, value);
        }
        for (const [productionIndex, production] of player.production.entries()) {
          const image = new Image(production.label, production.image);
          gui.addControl(image);
          image.isHitTestVisible = true;
          image.onPointerEnterObservable.add(() =>
            hint(
              `${production.label} · ${content?.players[index]?.production[productionIndex]?.progress ?? 0}%`,
            ),
          );
          image.onPointerOutObservable.add(() => hint(""));
          playerNodes.push(image);
        }
      }
    }
    let node = 0;
    for (const player of next.players) {
      node++;
      for (const metric of player.metrics) {
        node++;
        (playerNodes[node++] as TextBlock).text =
          metric.value.length > 7 ? compactNumber.format(Number(metric.value)) : metric.value;
      }
      node += player.production.length;
    }
    layout();
  }
  slider.onPointerDownObservable.add(() => {
    dragging = true;
    hint("");
  });
  slider.onPointerEnterObservable.add(() => hint(content?.timelineLabel ?? ""));
  slider.onPointerOutObservable.add(focusHint);
  slider.onPointerUpObservable.add(() => {
    if (dragging) {
      dragging = false;
      options.seek(Math.round(slider.value));
    }
  });
  mini.onPointerDownObservable.add((point) => {
    const cell = mini.point(point.x, point.y);
    mapDrag = point.buttonIndex === 0;
    if (cell && mapDrag) options.pan(cell.x, cell.y);
  });
  mini.onPointerMoveObservable.add((point) => {
    const cell = mini.point(point.x, point.y);
    if (cell && mapDrag) options.pan(cell.x, cell.y);
  });
  mini.onPointerUpObservable.add(() => {
    mapDrag = false;
    options.mapFocus();
  });
  mini.onWheelObservable.add((delta) => options.zoom(delta.y * 100));
  window.addEventListener(
    "pointerup",
    () => {
      mapDrag = false;
    },
    { signal: off.signal },
  );
  window.addEventListener(
    "blur",
    () => {
      mapDrag = dragging = false;
      hint("");
    },
    { signal: off.signal },
  );
  window.addEventListener("resize", layout, { signal: off.signal });
  return {
    update,
    frame: () => mini.refresh(),
    focus(id?: string) {
      focused = id;
      timelineFocus.isVisible = id === "timeline";
      for (const [key, item] of buttons) item.button.color = key === id ? "#fff6db" : "#475354";
      focusHint();
    },
    blocksPointer(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left,
        y = clientY - rect.top;
      return boxes.some(
        (box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h,
      );
    },
    dispose() {
      off.abort();
      gui.dispose();
    },
  };
}
