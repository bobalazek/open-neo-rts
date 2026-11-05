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
import {
  createPanelBlock,
  type PanelBlock,
  panelTextHeight,
  placePanelControl as place,
} from "./panel-content";
import { ReplayChart, type ReplayChartData } from "./replay-chart";
import { createReplayProduction, type ReplayProductionData } from "./replay-production";

export interface ReplayHudContent {
  title: string;
  time: string;
  status: string;
  timelineLabel: string;
  markerGroupHint: string;
  markers: readonly (BattlefieldAction & { tick: number; kind: "combat" | "elimination" })[];
  tick: number;
  duration: number;
  scale: number;
  actions: readonly BattlefieldAction[];
  statistics?: {
    chart?: ReplayChartData;
    production?: ReplayProductionData;
    table: Extract<PanelBlock, { kind: "table" }>;
    note?: string;
  };
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
    statisticsFocus: () => void;
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
  const statisticsFrame = frame("replay statistics");
  statisticsFrame.isVisible = false;
  const statisticsNote = new TextBlock("replay statistics status");
  statisticsNote.fontFamily = "Arial";
  statisticsNote.fontSize = 13;
  statisticsNote.color = "#b5c0bf";
  statisticsNote.textWrapping = true;
  statisticsNote.isHitTestVisible = false;
  statisticsNote.isVisible = false;
  gui.addControl(statisticsNote);
  const chart = new ReplayChart();
  chart.isVisible = false;
  gui.addControl(chart);
  let statisticsTable: ReturnType<typeof createPanelBlock> | undefined;
  let production: ReturnType<typeof createReplayProduction> | undefined;
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
  const markerNodes = new Map<
    number,
    {
      button: Button;
      image: Image;
      members: ReplayHudContent["markers"];
      cursor: number;
    }
  >();
  let content: ReplayHudContent | undefined,
    focused: string | undefined,
    dragging = false,
    mapDrag = false;
  let playerIdentity = "";
  let markerIdentity = "";
  let boxes: { x: number; y: number; w: number; h: number }[] = [];
  function hint(value: string) {
    tooltip.text = value;
    tooltipFrame.isVisible = tooltip.isVisible = !!value;
  }
  function focusHint() {
    const button = buttons.get(focused ?? "");
    hint(
      focused === "timeline"
        ? (content?.timelineLabel ?? "")
        : ((button?.button.isVisible ? button.action.tooltip : undefined) ??
            content?.markers.find((marker) => marker.id === focused)?.tooltip ??
            ""),
    );
  }
  function layout() {
    if (!content) return;
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight);
    // Ideal setters refresh cached fonts, so resize their backing before assigning them.
    const backing = gui.getSize();
    if (backing.width !== width || backing.height !== height) gui.scaleTo(width, height);
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
      transportHeight = (content.markers.length ? 116 : 96) * scale,
      transportY = height - edge - transportHeight;
    place(header, edge, edge, width - 24, 42 * scale);
    place(title, 24, edge, Math.max(40, width - 270 * scale), 42 * scale);
    place(transport, edge, transportY, Math.max(160, transportWidth), transportHeight);
    place(
      time,
      24,
      transportY + 6 * scale,
      transportWidth - 24 - (content.markers.length ? 57 * scale : 0),
      20 * scale,
    );
    place(slider, 24, transportY + 29 * scale, transportWidth - 24, 16 * scale);
    place(timelineFocus, 22, transportY + 26 * scale, transportWidth - 20, 22 * scale);
    place(mini, mapX, mapY, mapSize, mapSize);
    place(status, 24, transportY - 30, Math.max(180, width - mapSize - 40), 24);
    let x = 24;
    const statisticsBox: { x: number; y: number; w: number; h: number }[] = [];
    for (const id of ["backward", "play", "forward", "speed", "statistics"]) {
      const item = buttons.get(id);
      if (!item) continue;
      const w =
        id === "statistics"
          ? Math.min(unit, Math.max(24, transportWidth - x))
          : (id === "speed" ? 54 : 36) * scale;
      place(item.button, x, transportY + (content.markers.length ? 74 : 52) * scale, w, unit);
      const imageSize = Math.min(w, unit) - 12 * scale;
      place(item.image, (w - imageSize) / 2, (unit - imageSize) / 2, imageSize, imageSize);
      place(item.label, 0, 0, w, unit);
      x += w + gap;
    }
    for (const [index, id] of ["previous-event", "next-event"].entries()) {
      const item = buttons.get(id);
      if (!item) continue;
      item.button.isVisible = !!content.markers.length;
      place(
        item.button,
        transportWidth - (index === 0 ? 57 : 26) * scale,
        transportY + 3 * scale,
        26 * scale,
        26 * scale,
      );
      place(item.image, 6 * scale, 6 * scale, 14 * scale, 14 * scale);
      place(item.label, 0, 0, 26 * scale, 26 * scale);
    }
    const columns = Math.max(1, Math.floor((transportWidth - 24) / (24 * scale)));
    const groups = new Map<number, ReplayHudContent["markers"][number][]>();
    for (const marker of content.markers) {
      const column = Math.min(columns - 1, Math.floor((marker.tick / content.duration) * columns));
      const members = groups.get(column) ?? [];
      members.push(marker);
      groups.set(column, members);
    }
    for (const [column, node] of markerNodes)
      if (!groups.has(column)) {
        node.button.dispose();
        markerNodes.delete(column);
      }
    for (const [column, members] of groups) {
      let node = markerNodes.get(column);
      if (!node) {
        const button = new Button(`replay event cluster ${column}`),
          image = new Image("event icon");
        button.background = "transparent";
        button.color = "#ddc382";
        button.thickness = 0;
        button.isPointerBlocker = true;
        button.hoverCursor = "pointer";
        image.isHitTestVisible = false;
        button.addControl(image);
        gui.addControl(button);
        node = { button, image, members, cursor: 0 };
        markerNodes.set(column, node);
        const hintEvent = () => {
          const current = markerNodes.get(column)!;
          hint(
            `${current.members[current.cursor]!.tooltip}${current.members.length > 1 ? ` (${current.members.length})\n${content?.markerGroupHint ?? ""}` : ""}`,
          );
        };
        button.onPointerEnterObservable.add(() => {
          button.thickness = 1;
          hintEvent();
        });
        button.onPointerOutObservable.add(() => {
          button.thickness = markerNodes
            .get(column)!
            .members.some((marker) => marker.id === focused)
            ? 2
            : 0;
          focusHint();
        });
        button.onPointerClickObservable.add(() => {
          const current = markerNodes.get(column)!;
          const marker = current.members[current.cursor]!;
          if (marker.disabled) return;
          hintEvent();
          current.cursor = (current.cursor + 1) % current.members.length;
          marker.activate();
        });
      }
      node.members = members;
      node.cursor %= members.length;
      const representative = members.find((marker) => marker.kind === "elimination") ?? members[0]!;
      if (node.image.source !== representative.image)
        node.image.source = representative.image ?? "";
      node.button.alpha = representative.disabled ? 0.45 : 1;
      const width = (transportWidth - 24) / columns;
      place(
        node.button,
        24 + column * width + (width - 24 * scale) / 2,
        transportY + 47 * scale,
        24 * scale,
        22 * scale,
      );
      place(node.image, 5 * scale, 4 * scale, 14 * scale, 14 * scale);
    }
    const vision = buttons.get("vision"),
      camera = buttons.get("camera"),
      exit = buttons.get("exit");
    if (vision) {
      const w = (camera ? 126 : 166) * scale;
      place(vision.button, width - 24 - unit - gap - w, 15, w, unit);
      place(vision.image, 6, 7, 22 * scale, 22 * scale);
      place(vision.label, 34 * scale, 0, w - 38 * scale, unit);
      if (camera) {
        place(camera.button, width - 24 - unit - gap - w - gap - unit, 15, unit, unit);
        place(camera.image, 6 * scale, 6 * scale, unit - 12 * scale, unit - 12 * scale);
      }
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
    if (content.statistics) {
      const top = 62 * scale + content.players.length * rowHeight + 20 * scale;
      const height = Math.min(310 * scale, Math.max(80, transportY - top - 12));
      place(statisticsFrame, edge, top, playerWidth, height);
      const noteTop = content.statistics.chart ? 78 : 46;
      place(
        statisticsNote,
        24,
        top + noteTop * scale,
        playerWidth - 24,
        Math.max(1, height - (noteTop + 8) * scale),
      );
      for (const [index, id] of ["economy", "military", "production", "orders"].entries()) {
        const tab = buttons.get(`statistics-${id}`)!;
        const w = (playerWidth - 24) / 4;
        place(tab.button, 24 + index * w, top + 8 * scale, w, 28 * scale);
        place(tab.label, 0, 0, w, 28 * scale);
      }
      const metric = buttons.get("statistics-metric");
      if (metric && content.statistics.chart) {
        place(metric.button, 24, top + 42 * scale, playerWidth - 24, 28 * scale);
        place(metric.label, 0, 0, playerWidth - 24, 28 * scale);
        place(chart, 24, top + 78 * scale, playerWidth - 24, Math.max(1, height - 88 * scale));
      }
      if (statisticsTable && !content.statistics.chart && !content.statistics.production) {
        const h = statisticsTable.layout(playerWidth - 24, scale, height - 48 * scale);
        place(statisticsTable.root, 24, top + 42 * scale, playerWidth - 24, h);
      }
      if (production && content.statistics.production) {
        production.layout(playerWidth - 24, Math.max(1, height - 50 * scale), scale);
        place(
          production.root,
          24,
          top + 42 * scale,
          playerWidth - 24,
          Math.max(1, height - 50 * scale),
        );
      }
      statisticsBox.push({ x: edge, y: top, w: playerWidth, h: height });
    }
    tooltipFrame.zIndex = 10;
    tooltip.zIndex = 11;
    const tipWidth = Math.min(360, width - 24);
    place(tooltipFrame, 12, transportY - 106, tipWidth, 66);
    place(tooltip, 24, transportY - 100, tipWidth - 24, 54);
    boxes = [
      ...statisticsBox,
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
    const markerKey = JSON.stringify(
      next.markers.map(({ id, tick, tooltip }) => [id, tick, tooltip]),
    );
    if (markerIdentity !== markerKey) {
      markerIdentity = markerKey;
      for (const node of markerNodes.values()) node.cursor = 0;
      focusHint();
    }
    title.text = next.title;
    time.text = next.time;
    status.text = next.status;
    statisticsFrame.isVisible = !!next.statistics;
    statisticsNote.isVisible = !!next.statistics?.note;
    statisticsNote.text = next.statistics?.note ?? "";
    chart.isVisible = !!next.statistics?.chart && !next.statistics.note;
    if (next.statistics?.chart) chart.update(next.statistics.chart);
    if (next.statistics?.production) {
      production ??= createReplayProduction(gui.rootContainer, hint, () =>
        options.statisticsFocus(),
      );
      production.update(next.statistics.production);
      production.root.isVisible = !next.statistics.note;
    } else if (production) {
      production.update([]);
      production.root.isVisible = false;
    }
    if (next.statistics && !next.statistics.chart && !next.statistics.production) {
      if (!statisticsTable)
        statisticsTable = createPanelBlock(
          gui.rootContainer,
          next.statistics.table,
          (value, width, size) => panelTextHeight(gui.getContext(), value, width, size),
          () => options.statisticsFocus(),
        );
      else statisticsTable.update(next.statistics.table);
      statisticsTable.root.isVisible = !next.statistics.note;
    } else if (statisticsTable) statisticsTable.root.isVisible = false;
    for (const [id, item] of buttons) {
      const visible = next.actions.some((action) => action.id === id);
      if (item.button.isVisible && !visible) hint("");
      item.button.isVisible = visible;
    }
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
      item.button.isVisible = true;
      item.button.background = action.active ? "#3c392d" : "#18262e";
      item.button.alpha = action.disabled ? 0.45 : 1;
      if (item.image.source !== (action.image ?? "")) item.image.source = action.image ?? "";
      item.image.isVisible = !!action.image;
      item.label.text =
        ["vision", "speed"].includes(action.id) || action.id.startsWith("statistics-")
          ? action.label
          : "";
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
      for (const node of markerNodes.values()) {
        const selected = node.members.some((marker) => marker.id === id);
        node.button.thickness = selected ? 2 : 0;
        node.button.color = selected ? "#fff6db" : "#ddc382";
      }
      focusHint();
      statisticsTable?.focus(id === "statistics-values");
      production?.focus(id === "statistics-values");
    },
    statisticsScrollKey(key: string) {
      return content?.statistics?.production
        ? (production?.scrollKey(key) ?? false)
        : (statisticsTable?.scrollKey(key) ?? false);
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
