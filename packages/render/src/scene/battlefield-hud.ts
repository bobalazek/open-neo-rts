import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Container } from "@babylonjs/gui/2D/controls/container";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { BattlefieldMap } from "./battlefield-map";
import { placePanelControl as place } from "./panel-content";

export interface BattlefieldAction {
  id: string;
  label: string;
  tooltip: string;
  image?: string;
  key?: string;
  badge?: string;
  progress?: number;
  disabled: boolean;
  active: boolean;
  activate: () => void;
}
export interface BattlefieldHudContent {
  scale: number;
  resources: readonly { id: string; label: string; tooltip: string; image?: string }[];
  top: readonly BattlefieldAction[];
  selection: {
    label: string;
    image?: string;
    health: number;
    maxHealth: number;
    details: string;
  };
  commands: readonly BattlefieldAction[];
  recipes: readonly BattlefieldAction[];
  queue: readonly BattlefieldAction[];
  details: readonly BattlefieldAction[];
  groups: readonly BattlefieldAction[];
  helpers: readonly BattlefieldAction[];
  mapActions: readonly BattlefieldAction[];
  notices: readonly BattlefieldAction[];
  mode: string;
  feedback: string;
}

/** Scene-owned command station. Controllers supply copied labels, pixels and validated callbacks. */
export function createBattlefieldHud(
  scene: Scene,
  canvas: HTMLCanvasElement,
  minimapSource: HTMLCanvasElement,
  options: {
    map: (point: { x: number; y: number }, button: number, shift: boolean, alt: boolean) => void;
    mapFocus: () => void;
    mapZoom: (delta: number) => void;
  },
) {
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("battlefield HUD", true, scene);
  gui.disableTabNavigation = true;
  gui.renderAtIdealSize = true;
  const layer = new Container("battlefield controls");
  gui.addControl(layer);
  const text = (name: string, size = 13, color = "#eff1e9", parent: Container = layer) => {
    const node = new TextBlock(name);
    node.fontFamily = "Arial";
    node.fontSize = size;
    node.color = color;
    node.isHitTestVisible = false;
    node.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    node.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    parent.addControl(node);
    return node;
  };
  const frame = (name: string, parent: Container | AdvancedDynamicTexture = layer) => {
    const node = new Rectangle(name);
    node.background = "#182126";
    node.color = "#475354";
    node.thickness = 1;
    node.isPointerBlocker = true;
    parent.addControl(node);
    return node;
  };
  const topFrame = frame("resource bar");
  const dock = frame("selection command station");
  const mini = new BattlefieldMap(minimapSource);
  layer.addControl(mini);
  const selectionName = text("selected actor", 16);
  selectionName.fontWeight = "bold";
  const portrait = new Image("selected portrait");
  portrait.stretch = Image.STRETCH_UNIFORM;
  portrait.isHitTestVisible = false;
  layer.addControl(portrait);
  const health = frame("health track");
  health.background = "#10191e";
  const healthFill = frame("health", health);
  healthFill.background = "#83c391";
  healthFill.thickness = 0;
  const healthLabel = text("selected health", 12, "#b5c0bf");
  const mode = text("active command", 13, "#ddc382");
  const feedback = text("match feedback", 13, "#eff1e9");
  feedback.textWrapping = true;
  const tooltip = frame("command tooltip", gui);
  tooltip.isHitTestVisible = false;
  tooltip.isPointerBlocker = false;
  tooltip.isVisible = false;
  const tooltipText = text("command description", 13, "#eff1e9", tooltip);
  tooltipText.textWrapping = true;
  const inspector = frame("selection details", gui);
  inspector.isVisible = false;
  const inspectorScroll = new ScrollViewer("selection details scroll");
  inspectorScroll.thickness = 0;
  inspectorScroll.barColor = "#ddc382";
  inspectorScroll.barSize = 7;
  inspector.addControl(inspectorScroll);
  const inspectorBody = new Container("selection details body");
  inspectorScroll.addControl(inspectorBody);
  const inspectorText = text("actor statistics", 13, "#eff1e9", inspectorBody);
  inspectorText.textWrapping = true;
  const selectionBox = frame("selection rectangle", gui);
  selectionBox.background = "#ddc3821a";
  selectionBox.color = "#ddc382";
  selectionBox.isHitTestVisible = false;
  selectionBox.isVisible = false;
  let content: BattlefieldHudContent | undefined;
  let contentKey = "";
  let activeMode: "commands" | "build" = "commands";
  let showGroups = false;
  let showDetails = false;
  let focused: string | undefined;
  let mapDrag = false;
  let shift = false,
    alt = false;
  let layoutRects: { x: number; y: number; width: number; height: number }[] = [];
  const placed = new Set<string>();
  let mapBounds = { x: 0, y: 0, size: 0 };
  const buttons = new Map<
    string,
    {
      button: Button;
      action: BattlefieldAction;
      image?: Image;
      badge: TextBlock;
      key: TextBlock;
      label?: TextBlock;
      progress?: Rectangle;
    }
  >();
  const resourceWidgets: { label: TextBlock; image?: Image; tooltip: string }[] = [];
  const hideTooltip = () => {
    tooltip.isVisible = false;
  };
  const cssRect = (control: Control) => {
    const size = gui.getSize(),
      measure = control._currentMeasure;
    const sx = canvas.clientWidth / Math.max(1, size.width),
      sy = canvas.clientHeight / Math.max(1, size.height);
    return {
      left: measure.left * sx,
      top: measure.top * sy,
      width: measure.width * sx,
      height: measure.height * sy,
    };
  };
  const heightFor = (value: string, width: number, size: number) => {
    const context = gui.getContext();
    context.save();
    context.font = `${size}px Arial`;
    let lines = 0;
    for (const paragraph of value.split("\n")) {
      lines++;
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > width) {
          lines++;
          line = word;
        } else line = next;
      }
    }
    context.restore();
    return lines * size * 1.4;
  };
  function showTooltip(value: string, x: number, y: number) {
    const width = Math.min(340, canvas.clientWidth - 24);
    const height = Math.min(canvas.clientHeight - 32, heightFor(value, width - 24, 13) + 24);
    tooltipText.text = value;
    place(
      tooltip,
      Math.max(12, Math.min(canvas.clientWidth - width - 12, x)),
      Math.max(12, Math.min(canvas.clientHeight - height - 12, y - height - 10)),
      width,
      height,
    );
    place(tooltipText, 12, 12, width - 24, height - 24);
    tooltip.isVisible = true;
  }
  const local = (id: string, label: string, activate: () => void, key = ""): BattlefieldAction => ({
    id,
    label,
    tooltip: key ? `${label} (${key})` : label,
    key,
    disabled: false,
    active: false,
    activate,
  });
  function make(action: BattlefieldAction, parent: Container = layer) {
    const button = new Button(action.id);
    button.background = "#18262e";
    button.color = "#475354";
    button.thickness = 1;
    button.tabIndex = -1;
    button.hoverCursor = "pointer";
    button.isPointerBlocker = true;
    parent.addControl(button);
    let image: Image | undefined;
    let label: TextBlock | undefined;
    if (action.image) {
      image = new Image(`${action.id} icon`, action.image);
      image.stretch = Image.STRETCH_UNIFORM;
      image.isHitTestVisible = false;
      button.addControl(image);
    } else {
      label = text(`${action.id} name`, 12, "#eff1e9", button);
      label.text = action.label;
      label.textWrapping = true;
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      label.width = "90%";
    }
    const badge = text(`${action.id} count`, 11, "#eff1e9", button);
    badge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    const key = text(`${action.id} key`, 10, "#ddc382", button);
    key.text = action.key ?? "";
    badge.text = action.badge ?? "";
    let progress: Rectangle | undefined;
    if (action.progress !== undefined) {
      const track = frame(`${action.id} progress`, button);
      track.heightInPixels = 3;
      track.width = "100%";
      track.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
      track.thickness = 0;
      track.background = "#10191e";
      track.isHitTestVisible = false;
      progress = frame(`${action.id} completed`, track);
      progress.height = "100%";
      progress.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      progress.background = "#ddc382";
      progress.thickness = 0;
      progress.isHitTestVisible = false;
    }
    button.onPointerEnterObservable.add(() => {
      const item = buttons.get(action.id)!;
      button.color = "#ddc382";
      const rect = cssRect(button);
      showTooltip(item.action.tooltip, rect.left, rect.top);
    });
    button.onPointerOutObservable.add(() => {
      hideTooltip();
      button.color = focused === action.id ? "#eff1e9" : "#475354";
    });
    button.onPointerClickObservable.add(() => {
      hideTooltip();
      const current = buttons.get(action.id)?.action;
      if (current) {
        current.activate();
        if (current.disabled) {
          const rect = cssRect(button);
          showTooltip(current.tooltip, rect.left, rect.top);
        }
      }
    });
    const item = { button, action, image, badge, key, label, progress };
    buttons.set(action.id, item);
    return item;
  }
  function position(
    action: BattlefieldAction,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const item = buttons.get(action.id);
    if (!item) return;
    placed.add(action.id);
    item.button.isVisible = true;
    place(item.button, x, y, width, height);
    if (item.image) {
      const inset = item.action.image?.startsWith("data:image/svg") ? 7 : 2;
      place(
        item.image,
        inset,
        inset,
        Math.max(8, width - inset * 2),
        Math.max(8, height - inset * 2),
      );
    }
    place(item.badge, width - 26, height - 18, 22, 15);
    place(item.key, 3, 2, width - 6, 12);
  }
  function layout() {
    if (!content) return;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    gui.idealWidth = width;
    gui.idealHeight = height;
    const scale = Math.min(content.scale, Math.max(0.85, width / 900));
    const compact = width < 940;
    const commandKeys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
    let extra = commandKeys.length;
    const commandSlots = content.commands.map((action) => {
      const index = commandKeys.indexOf(action.key ?? "");
      return { action, index: index < 0 ? extra++ : index };
    });
    const commandRows = Math.ceil(
      (Math.max(-1, ...commandSlots.map((item) => item.index)) + 1) / 4,
    );
    const resourceColumns =
      width < 650 ? Math.min(3, content.resources.length) : content.resources.length;
    const topHeight =
      width < 650
        ? Math.ceil(content.resources.length / Math.max(1, resourceColumns)) * 30 + 34
        : 40;
    const mapSize = (compact ? 144 : 216) * scale;
    const dockHeight =
      Math.max(
        compact ? 218 : 208,
        44 + commandRows * 41 - 5 + 12 + (content.queue.length ? 36 : 0),
      ) * scale;
    const dockWidth = compact ? width - 24 : Math.min(900 * scale, width - mapSize - 52);
    const dockY = height - dockHeight - 12;
    const mapX = width - mapSize - 16;
    const mapY = compact ? dockY - mapSize - 42 : height - mapSize - 52;
    mapBounds = { x: mapX, y: mapY, size: mapSize };
    place(topFrame, 0, 0, width, topHeight);
    place(dock, 12, dockY, dockWidth, dockHeight);
    place(mini, mapX, mapY, mapSize, mapSize);
    layoutRects = [
      { x: 0, y: 0, width, height: topHeight },
      { x: 12, y: dockY, width: dockWidth, height: dockHeight },
      { x: mapX, y: mapY + mapSize, width: mapSize, height: 38 },
    ];
    placed.clear();
    const topReserve = content.top.length * 36 + 8;
    const columns = resourceColumns;
    const resourceWidth = Math.max(
      82,
      (width - (width < 650 ? 8 : topReserve) - 16) / Math.max(1, columns),
    );
    resourceWidgets.forEach((widget, i) => {
      const row = Math.floor(i / columns),
        x = 10 + (i % columns) * resourceWidth;
      const y = row * 30 + 5;
      if (widget.image) place(widget.image, x, y + 4, 16, 16);
      place(widget.label, x + (widget.image ? 22 : 0), y, resourceWidth - 26, 24);
    });
    content.top.forEach((action, i) => {
      position(action, width - topReserve + i * 36, topHeight - 35, 32, 30);
    });
    const profileWidth = compact ? 116 * scale : 184 * scale;
    place(selectionName, 24, dockY + 10, profileWidth - 8, 36 * scale);
    selectionName.textWrapping = true;
    selectionName.fontSize = 14 * scale;
    const portraitSize = 72 * scale;
    place(portrait, 24, dockY + 49 * scale, portraitSize, portraitSize);
    place(health, 24, dockY + 126 * scale, profileWidth - 16, 5 * scale);
    place(
      healthFill,
      0,
      0,
      Math.max(
        0,
        ((profileWidth - 16) * content.selection.health) / Math.max(1, content.selection.maxHealth),
      ),
      5 * scale,
    );
    place(healthLabel, 24, dockY + 134 * scale, profileWidth - 16, 20);
    position(
      local("inspect", "Details", () => {}),
      24,
      dockY + dockHeight - 40 * scale,
      profileWidth - 16,
      28 * scale,
    );
    const contextX = 24 + profileWidth;
    const contextWidth = dockWidth - profileWidth - 36;
    const recipeMode = content.recipes.length > 0;
    const commandTab = buttons.get("commands"),
      buildTab = buttons.get("build");
    if (commandTab)
      commandTab.button.background = activeMode === "commands" ? "#3c392d" : "#18262e";
    if (buildTab) buildTab.button.background = activeMode === "build" ? "#3c392d" : "#18262e";
    const both = !compact && recipeMode;
    position(
      local("commands", "Commands", () => {}),
      contextX,
      dockY + 10,
      96 * scale,
      26 * scale,
    );
    if (recipeMode)
      position(
        local("build", "Build / train", () => {}),
        contextX + 104 * scale,
        dockY + 10,
        104 * scale,
        26 * scale,
      );
    const commandWidth = both ? 180 * scale : contextWidth;
    const commandsShown = both || activeMode === "commands" || !recipeMode;
    const recipesShown = both || (activeMode === "build" && recipeMode);
    const grid = (
      actions: readonly BattlefieldAction[],
      x: number,
      y: number,
      availableWidth: number,
      cell: number,
    ) => {
      const cols = Math.max(1, Math.floor((availableWidth + 5 * scale) / (cell + 5 * scale)));
      actions.forEach((action, i) => {
        position(
          action,
          x + (i % cols) * (cell + 5 * scale),
          y + Math.floor(i / cols) * (cell + 5 * scale),
          cell,
          cell,
        );
      });
    };
    if (commandsShown)
      for (const { action, index } of commandSlots)
        position(
          action,
          contextX + (index % 4) * 41 * scale,
          dockY + (44 + Math.floor(index / 4) * 41) * scale,
          36 * scale,
          36 * scale,
        );
    const buildX = both ? contextX + commandWidth + 16 * scale : contextX;
    const buildWidth = both ? contextWidth - commandWidth - 16 * scale : contextWidth;
    if (recipesShown) grid(content.recipes, buildX, dockY + 44 * scale, buildWidth, 36 * scale);
    grid(content.queue, contextX, dockY + dockHeight - 36 * scale, contextWidth, 27 * scale);
    content.helpers.forEach((action, i) => {
      position(action, 12 + i * 46 * scale, dockY - 42 * scale, 40 * scale, 34 * scale);
    });
    const helperCount = content.helpers.length;
    position(
      local("groups", "Groups", () => {}),
      12 + content.helpers.length * 46 * scale,
      dockY - 42 * scale,
      64 * scale,
      34 * scale,
    );
    const groups = showGroups ? content.groups : content.groups.filter((action) => !!action.badge);
    groups.forEach((action, i) => {
      position(
        action,
        18 + (i % 10) * 39 * scale,
        dockY - (showGroups ? 84 : 42) * scale,
        34 * scale,
        34 * scale,
      );
    });
    if (!showGroups)
      groups.forEach((action, i) => {
        position(
          action,
          88 * scale + helperCount * 46 * scale + i * 39 * scale,
          dockY - 42 * scale,
          34 * scale,
          34 * scale,
        );
      });
    if (showGroups)
      layoutRects.push({
        x: 12,
        y: dockY - 84 * scale,
        width: Math.min(width - 24, 400 * scale),
        height: 42 * scale,
      });
    layoutRects.push({
      x: 12,
      y: dockY - 42 * scale,
      width: Math.min(dockWidth, (content.helpers.length * 46 + 76 + groups.length * 39) * scale),
      height: 36 * scale,
    });
    content.mapActions.forEach((action, i) => {
      position(action, mapX + i * 40 * scale, mapY + mapSize + 5, 34 * scale, 30 * scale);
    });
    place(mode, 16, topHeight + 8, width - 32, 25);
    place(
      feedback,
      16,
      topHeight + 35,
      width - 32,
      Math.min(72, heightFor(content.feedback, width - 32, 13)),
    );
    const noticeStart = Math.max(
      0,
      content.notices.findIndex((action) => action.id === focused) - 2,
    );
    content.notices.slice(noticeStart, noticeStart + 3).forEach((action, i) => {
      position(
        action,
        12,
        Math.max(topHeight + 68, dockY - 190 + i * 34),
        Math.min(260, width - mapSize - 36),
        30,
      );
    });
    inspector.isVisible = showDetails;
    if (showDetails) {
      const inspectWidth = Math.min(480, width - 24);
      const textHeight = heightFor(content.selection.details, inspectWidth - 44, 13);
      const bodyHeight = textHeight + 16 + content.details.length * 38;
      const inspectHeight = Math.min(
        Math.ceil(bodyHeight + 24),
        Math.max(1, Math.min(440, dockY - topHeight - 24)),
      );
      place(
        inspector,
        12,
        Math.max(topHeight + 12, dockY - inspectHeight - 12),
        inspectWidth,
        inspectHeight,
      );
      place(inspectorScroll, 12, 12, inspectWidth - 24, Math.max(1, inspectHeight - 24));
      place(inspectorText, 0, 0, inspectWidth - 44, textHeight);
      content.details.forEach((action, i) => {
        position(action, 0, textHeight + 12 + i * 38, inspectWidth - 44, 32);
      });
      inspectorBody.widthInPixels = inspectWidth - 44;
      inspectorBody.heightInPixels = bodyHeight;
      layoutRects.push({
        x: inspector.leftInPixels,
        y: inspector.topInPixels,
        width: inspectWidth,
        height: inspectHeight,
      });
    }
    for (const [id, item] of buttons) if (!placed.has(id)) item.button.isVisible = false;
    const focusedItem = focused ? buttons.get(focused) : undefined;
    if (focusedItem) {
      focusedItem.button.thickness = 2;
      focusedItem.button.color = "#eff1e9";
    }
  }
  function update(next: BattlefieldHudContent) {
    content = next;
    const all = [
      ...next.top,
      ...next.commands,
      ...next.recipes,
      ...next.queue,
      ...next.details,
      ...next.groups,
      ...next.helpers,
      ...next.mapActions,
      ...next.notices,
    ];
    const key = JSON.stringify([
      all.map((action) => [action.id, action.image]),
      next.resources.map((item) => item.id),
    ]);
    if (key !== contentKey) {
      contentKey = key;
      hideTooltip();
      for (const item of buttons.values()) item.button.dispose();
      buttons.clear();
      for (const widget of resourceWidgets) {
        widget.label.dispose();
        widget.image?.dispose();
      }
      resourceWidgets.length = 0;
      for (const action of all) make(action, next.details.includes(action) ? inspectorBody : layer);
      make(
        local(
          "inspect",
          "Details",
          () => {
            showDetails = !showDetails;
            layout();
          },
          "I",
        ),
      );
      make(
        local("commands", "Commands", () => {
          activeMode = "commands";
          layout();
        }),
      );
      make(
        local(
          "build",
          "Build / train",
          () => {
            activeMode = "build";
            layout();
          },
          "B",
        ),
      );
      make(
        local("groups", "Groups", () => {
          showGroups = !showGroups;
          layout();
        }),
      );
      for (const item of next.resources) {
        const label = text(item.id, 12);
        const image = item.image ? new Image(`${item.id} icon`, item.image) : undefined;
        if (image) {
          image.isHitTestVisible = false;
          layer.addControl(image);
        }
        const widget = { label, image, tooltip: item.tooltip };
        label.isHitTestVisible = true;
        label.onPointerEnterObservable.add(() => {
          const rect = cssRect(label);
          showTooltip(widget.tooltip, rect.left, rect.top);
        });
        label.onPointerOutObservable.add(hideTooltip);
        resourceWidgets.push(widget);
      }
    }
    for (const action of all) {
      const item = buttons.get(action.id);
      if (!item) continue;
      item.action = action;
      item.button.alpha = action.disabled ? 0.45 : 1;
      item.button.background = action.active ? "#3c392d" : "#18262e";
      item.badge.text = action.badge ?? "";
      item.key.text = action.key ?? "";
      if (item.label) item.label.text = action.label;
      if (item.progress)
        item.progress.width = `${Math.max(0, Math.min(100, action.progress ?? 0))}%`;
    }
    next.resources.forEach((item, i) => {
      resourceWidgets[i]!.label.text = item.label;
      resourceWidgets[i]!.tooltip = item.tooltip;
    });
    selectionName.text = next.selection.label;
    portrait.isVisible = !!next.selection.image;
    if (portrait.source !== next.selection.image) portrait.source = next.selection.image ?? "";
    health.isVisible = next.selection.maxHealth > 0;
    healthLabel.text = next.selection.maxHealth
      ? `${next.selection.health} / ${next.selection.maxHealth}`
      : "";
    inspectorText.text = next.selection.details;
    mode.text = next.mode;
    feedback.text = next.feedback;
    layout();
  }
  const modifiers = (event: KeyboardEvent | PointerEvent) => {
    shift = event.shiftKey;
    alt = event.altKey;
  };
  const off = new AbortController();
  window.addEventListener("keydown", modifiers, { capture: true, signal: off.signal });
  window.addEventListener("keyup", modifiers, { capture: true, signal: off.signal });
  canvas.addEventListener("pointerdown", modifiers, { capture: true, signal: off.signal });
  mini.onPointerDownObservable.add((point) => {
    const cell = mini.point(point.x, point.y);
    if (cell) {
      mapDrag = point.buttonIndex === 0 && !alt && !shift;
      options.map(cell, point.buttonIndex, shift, alt);
    }
  });
  mini.onPointerMoveObservable.add((point) => {
    if (mapDrag) {
      const cell = mini.point(point.x, point.y);
      if (cell) options.map(cell, 0, false, false);
    }
  });
  mini.onPointerUpObservable.add((point) => {
    mapDrag = false;
    // Moving focus during pointer-down abandons Babylon's in-progress capture.
    if (mini.contains(point.x, point.y)) options.mapFocus();
  });
  const release = () => {
    mapDrag = false;
  };
  window.addEventListener("pointerup", release, { signal: off.signal });
  window.addEventListener("blur", release, { signal: off.signal });
  mini.onWheelObservable.add((delta) => options.mapZoom(delta.y * 100));
  const resize = () => layout();
  window.addEventListener("resize", resize, { signal: off.signal });
  return {
    update,
    selectionRectangle(rect: { x: number; y: number; width: number; height: number } | null) {
      selectionBox.isVisible = !!rect;
      if (rect) place(selectionBox, rect.x, rect.y, rect.width, rect.height);
    },
    frame: () => mini.refresh(),
    blocksPointer: (x: number, y: number) =>
      (x - mapBounds.x - mapBounds.size / 2) ** 2 + (y - mapBounds.y - mapBounds.size / 2) ** 2 <=
        mapBounds.size ** 2 / 4 ||
      layoutRects.some(
        (rect) =>
          x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height,
      ) ||
      [...buttons.values()].some(({ button }) => {
        const rect = cssRect(button);
        return (
          button.isVisible &&
          x >= rect.left &&
          y >= rect.top &&
          x <= rect.left + rect.width &&
          y <= rect.top + rect.height
        );
      }),
    focus(id?: string) {
      hideTooltip();
      focused = id;
      const focusedItem = id ? buttons.get(id) : undefined;
      if (id === "inspect" || focusedItem?.button.parent === inspectorBody) {
        showDetails = true;
        layout();
      } else if (id && content?.recipes.some((item) => item.id === id)) {
        activeMode = "build";
        layout();
      } else if (id && content?.commands.some((item) => item.id === id)) {
        activeMode = "commands";
        layout();
      }
      if (id && content?.notices.some((item) => item.id === id)) layout();
      for (const item of buttons.values()) {
        item.button.thickness = item.action.id === id ? 2 : 1;
        item.button.color = item.action.id === id ? "#eff1e9" : "#475354";
      }
      const item = id && buttons.get(id);
      if (item) {
        const rect = cssRect(item.button);
        showTooltip(item.action.tooltip, rect.left, rect.top);
      }
      mini.focused = id === "minimap";
      mini.refresh();
    },
    shortcut(code: string) {
      if (code === "KeyB" && content?.recipes.length) {
        activeMode = activeMode === "build" ? "commands" : "build";
        layout();
        return true;
      }
      if (code === "KeyI") {
        showDetails = !showDetails;
        layout();
        return true;
      }
      return false;
    },
    close() {
      const closed = showDetails || showGroups;
      showDetails = false;
      showGroups = false;
      hideTooltip();
      layout();
      return closed;
    },
    drawn: () =>
      new Promise<void>((resolve) => {
        scene.onAfterRenderObservable.addOnce(() =>
          scene.onAfterRenderObservable.addOnce(() => resolve()),
        );
      }),
    dispose() {
      off.abort();
      gui.dispose();
    },
  };
}
