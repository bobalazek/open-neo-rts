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

const localImages: Record<string, string> = Object.fromEntries(
  Object.entries({
    inspect: "M12 8v1m0 3v5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    groups: "M3 4h7v7H3Zm11 0h7v7h-7ZM3 15h7v6H3Zm11 0h7v6h-7Z",
    commands: "M4 12h16m-6-6 6 6-6 6",
    build: "m4 20 9-9m-5-7 4-2 8 8-3 3-4-4-2 2-4-4Z",
    objective: "M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  }).map(([id, path]) => [
    id,
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ddc382" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`)}`,
  ]),
);

export interface BattlefieldAction {
  id: string;
  label: string;
  tooltip: string;
  image?: string;
  key?: string;
  slot?: number;
  badge?: string;
  progress?: number;
  disabled: boolean;
  active: boolean;
  activate: () => void;
}
export interface BattlefieldHudContent {
  scale: number;
  shortcuts?: { details: string; build: string };
  objective: { label: string; tooltip: string };
  resources: readonly { id: string; label: string; tooltip: string; image?: string }[];
  status: BattlefieldHudContent["resources"];
  top: readonly BattlefieldAction[];
  selection: {
    label: string;
    owner: string;
    color: string;
    count: number;
    types: readonly BattlefieldAction[];
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
  guidance?: {
    message: string;
    actions: readonly BattlefieldAction[];
    help: Readonly<Record<string, string>>;
  };
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
  const topFrame = frame("match status");
  const objectiveLabel = text("match objective", 12, "#ddc382");
  const objectiveIcon = new Image("objective", localImages.objective);
  layer.addControl(objectiveIcon);
  const economy = frame("economy");
  const dock = frame("selection command station");
  const typeScroll = new ScrollViewer("selected types scroll");
  typeScroll.isPointerBlocker = true;
  typeScroll.thickness = 0;
  typeScroll.barSize = 5;
  typeScroll.barColor = "#ddc382";
  layer.addControl(typeScroll);
  const typeBody = new Container("selected types");
  typeBody.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  typeBody.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  typeScroll.addControl(typeBody);
  const mini = new BattlefieldMap(minimapSource);
  layer.addControl(mini);
  const selectionName = text("selected actor", 16);
  const selectionOwner = text("selected owner", 11);
  const ownerColor = frame("selected Force color");
  ownerColor.thickness = 0;
  ownerColor.isHitTestVisible = ownerColor.isPointerBlocker = false;
  selectionName.fontWeight = "bold";
  const health = frame("health track");
  health.isHitTestVisible = health.isPointerBlocker = false;
  health.background = "#10191e";
  const healthFill = frame("health", health);
  healthFill.isHitTestVisible = healthFill.isPointerBlocker = false;
  healthFill.background = "#83c391";
  healthFill.thickness = 0;
  const healthLabel = text("selected health", 12, "#b5c0bf");
  const mode = text("active command", 13, "#ddc382");
  const feedback = text("match feedback", 13, "#eff1e9");
  feedback.textWrapping = true;
  const hintFrame = frame("contextual guidance");
  hintFrame.isVisible = false;
  const hintText = text("contextual hint", 13, "#eff1e9", hintFrame);
  hintText.textWrapping = true;
  const helpLabels = new Map<string, Rectangle>();
  function helpLabel(id: string, x: number, y: number, width: number) {
    const value = content?.guidance?.help[id];
    if (!value) return;
    let box = helpLabels.get(id);
    if (!box) {
      box = frame(`HUD help ${id}`);
      box.isPointerBlocker = box.isHitTestVisible = false;
      box.color = "#ddc382";
      const label = text(`HUD help ${id} label`, 12, "#eff1e9", box);
      label.textWrapping = true;
      helpLabels.set(id, box);
    }
    const label = box.children[0] as TextBlock;
    label.text = value;
    const h = Math.max(28, heightFor(value, width - 16, 12) + 12);
    place(
      box,
      Math.max(8, Math.min(x, canvas.clientWidth - width - 8)),
      Math.max(42, Math.min(y, canvas.clientHeight - h - 8)),
      width,
      h,
    );
    place(label, 8, 6, width - 16, h - 12);
    box.isVisible = true;
  }
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
  const awaitingLayout = new Set<Control>();
  const afterDraw = scene.onAfterRenderObservable.add(() => {
    for (const button of awaitingLayout) if (button.isVisible) button.isHitTestVisible = true;
    awaitingLayout.clear();
  });
  function show(control: Control, visible: boolean) {
    // Newly shown controls must be measured before either GUI picking or world guards use them.
    if (visible && !control.isVisible && control.isPointerBlocker) {
      control.isHitTestVisible = false;
      awaitingLayout.add(control);
    }
    control.isVisible = visible;
  }
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
  const statusWidgets: typeof resourceWidgets = [];
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
    image: localImages[id],
    disabled: false,
    active: false,
    activate,
  });
  function make(action: BattlefieldAction, parent: Container = layer) {
    const button = new Button(action.id);
    button.isVisible = false;
    button.isHitTestVisible = false;
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
    key.text = action.key && action.key.length <= 2 ? action.key : "";
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
    show(item.button, true);
    place(item.button, x, y, width, height);
    if (item.image) {
      const inset = item.action.image?.startsWith("data:image/svg") ? 4 : 2;
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
    for (const box of helpLabels.values()) box.isVisible = false;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    gui.idealWidth = width;
    gui.idealHeight = height;
    const scale = Math.min(content.scale, Math.max(0.85, width / 900));
    const compact = width < 940;
    const commandKeys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
    let extra = commandKeys.length;
    const commandSlots = content.commands.map((action) => {
      const index = action.slot ?? commandKeys.indexOf(action.key ?? "");
      return { action, index: index < 0 ? extra++ : index };
    });
    const commandRows = Math.ceil(
      (Math.max(-1, ...commandSlots.map((item) => item.index)) + 1) / 4,
    );
    const hasSelection = content.selection.count > 0;
    const recipeMode = content.recipes.length > 0;
    const topHeight = 42;
    const economyWidth = compact ? width - 24 : 132 * scale;
    const mapSize = (compact ? 144 : 216) * scale;
    const dockHeight =
      Math.max(compact ? 190 : 176, 38 + commandRows * 36 + (content.queue.length ? 34 : 0)) *
      scale;
    const dockX = compact ? 12 : 20 + economyWidth;
    const recipeWidth = recipeMode ? 144 + 16 + Math.min(6, content.recipes.length) * 37 - 5 : 144;
    const queueWidth = Math.min(6, content.queue.length) * 32 - 5;
    const desktopWidth = 184 * scale + 36 + Math.max(recipeWidth, queueWidth) * scale;
    const dockWidth = compact
      ? width - 24
      : Math.min(desktopWidth, width - mapSize - 52 - economyWidth - 8);
    const dockY = height - dockHeight - 12;
    const mapX = width - mapSize - 16;
    const economyColumns = compact ? Math.min(3, content.resources.length) : 1;
    const economyHeight = compact
      ? Math.ceil(content.resources.length / Math.max(1, economyColumns)) * 26 + 8
      : content.resources.length * 26 + 12;
    const economyY = compact
      ? (hasSelection ? dockY : height - 12) -
        economyHeight -
        8 -
        (hasSelection && content.guidance?.help.selection ? 72 : 0)
      : height - economyHeight - 12;
    const mapY = compact ? economyY - mapSize - 42 : height - mapSize - 40;
    mapBounds = { x: mapX, y: mapY, size: mapSize };
    const topReserve = content.top.length * 30;
    place(topFrame, width - topReserve - 8, 6, topReserve, 30);
    place(economy, 12, economyY, economyWidth, economyHeight);
    place(dock, dockX, dockY, dockWidth, dockHeight);
    show(dock, hasSelection);
    show(typeScroll, hasSelection);
    selectionName.isVisible = hasSelection;
    selectionOwner.isVisible = hasSelection;
    ownerColor.isVisible = hasSelection;
    health.isVisible = hasSelection;
    healthLabel.isVisible = hasSelection;
    if (!hasSelection) showDetails = false;
    place(mini, mapX, mapY, mapSize, mapSize);
    layoutRects = [
      { x: width - topReserve - 8, y: 6, width: topReserve, height: 30 },
      { x: compact ? 38 : width / 2 - 72, y: 6, width: 144, height: 30 },
      { x: 12, y: economyY, width: economyWidth, height: economyHeight },
      ...(hasSelection ? [{ x: dockX, y: dockY, width: dockWidth, height: dockHeight }] : []),
      { x: mapX, y: mapY + mapSize, width: mapSize, height: 38 },
    ];
    placed.clear();
    place(objectiveIcon, 12, 13, 16, 16);
    place(objectiveLabel, 36, 6, 200, 30);
    objectiveLabel.isVisible = !compact;
    const columns = economyColumns;
    const resourceWidth = economyWidth / Math.max(1, columns);
    resourceWidgets.forEach((widget, i) => {
      const row = Math.floor(i / columns),
        x = 20 + (i % columns) * resourceWidth;
      const y = economyY + 6 + row * 26;
      if (widget.image) place(widget.image, x, y + 4, 16, 16);
      place(widget.label, x + (widget.image ? 22 : 0), y, resourceWidth - 26, 24);
    });
    statusWidgets.forEach((widget, i) => {
      const x = (compact ? 38 : width / 2 - 70) + i * 76;
      if (widget.image) place(widget.image, x, 13, 14, 14);
      place(widget.label, x + 19, 7, 54, 26);
    });
    content.top.forEach((action, i) => {
      position(action, width - topReserve - 8 + i * 30, 6, 30, 30);
    });
    const profileWidth = compact ? 112 * scale : 184 * scale;
    const profileX = dockX + 10;
    if (hasSelection) {
      place(selectionName, profileX, dockY + 5, profileWidth - 30, 30 * scale);
      selectionName.textWrapping = true;
      selectionName.fontSize = 13 * scale;
      place(ownerColor, profileX, dockY + 42 * scale, 7 * scale, 7 * scale);
      place(
        selectionOwner,
        profileX + 12 * scale,
        dockY + 34 * scale,
        profileWidth - 22 * scale,
        25 * scale,
      );
      selectionOwner.textWrapping = true;
      selectionOwner.fontSize = 11 * scale;
      const multi = content.selection.types.length > 1;
      const typeWidth = multi ? profileWidth - 12 : 56 * scale;
      const typeHeight = multi ? Math.max(40, dockHeight - 104 * scale) : 56 * scale;
      place(typeScroll, profileX, dockY + 64 * scale, typeWidth, typeHeight);
      typeBody.widthInPixels = typeWidth - 5;
      const typeCols = multi ? Math.max(1, Math.floor((typeWidth - 5) / (36 * scale))) : 1;
      const typeCell = multi ? 32 * scale : 50 * scale;
      typeBody.heightInPixels =
        Math.ceil(content.selection.types.length / typeCols) * (typeCell + 4 * scale);
      content.selection.types.forEach((action, i) => {
        position(
          action,
          (i % typeCols) * (typeCell + 4 * scale),
          Math.floor(i / typeCols) * (typeCell + 4 * scale),
          typeCell,
          typeCell,
        );
      });
      place(health, profileX, dockY + dockHeight - 33 * scale, profileWidth - 16, 4 * scale);
      place(
        healthFill,
        0,
        0,
        Math.max(
          0,
          ((profileWidth - 16) * content.selection.health) /
            Math.max(1, content.selection.maxHealth),
        ),
        5 * scale,
      );
      place(healthLabel, profileX, dockY + dockHeight - 26 * scale, profileWidth - 16, 20);
      position(
        local("inspect", "Details", () => {}),
        profileX + profileWidth - 28 * scale,
        dockY + 5,
        24 * scale,
        24 * scale,
      );
      const contextX = profileX + profileWidth;
      const contextWidth = dockWidth - profileWidth - 36;
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
        28 * scale,
        24 * scale,
      );
      if (recipeMode)
        position(
          local("build", "Build / train", () => {}),
          contextX + 34 * scale,
          dockY + 10,
          28 * scale,
          24 * scale,
        );
      const commandWidth = both ? 144 * scale : contextWidth;
      const commandsShown = both || activeMode === "commands" || !recipeMode;
      const recipesShown = both || (activeMode === "build" && recipeMode);
      const grid = (
        actions: readonly BattlefieldAction[],
        x: number,
        y: number,
        availableWidth: number,
        cell: number,
      ) => {
        const cols = Math.max(
          1,
          Math.min(6, Math.floor((availableWidth + 5 * scale) / (cell + 5 * scale))),
        );
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
            contextX + (index % 4) * 36 * scale,
            dockY + (38 + Math.floor(index / 4) * 36) * scale,
            32 * scale,
            32 * scale,
          );
      const buildX = both ? contextX + commandWidth + 16 * scale : contextX;
      const buildWidth = both ? contextWidth - commandWidth - 16 * scale : contextWidth;
      if (recipesShown) grid(content.recipes, buildX, dockY + 38 * scale, buildWidth, 32 * scale);
      grid(content.queue, contextX, dockY + dockHeight - 36 * scale, contextWidth, 27 * scale);
    }
    const helperY = economyY - 36 * scale;
    content.helpers.forEach((action, i) => {
      position(action, 12 + i * 36 * scale, helperY, 32 * scale, 30 * scale);
    });
    position(
      local("groups", "Groups", () => {}),
      12 + content.helpers.length * 36 * scale,
      helperY,
      30 * scale,
      30 * scale,
    );
    const groups = showGroups ? content.groups : content.groups.filter((action) => !!action.badge);
    const groupRows = Math.max(1, Math.floor((helperY - topHeight - 100) / (34 * scale)));
    groups.forEach((action, i) => {
      position(
        action,
        12 + Math.floor(i / groupRows) * 34 * scale,
        helperY - 8 - ((i % groupRows) + 1) * 34 * scale,
        30 * scale,
        30 * scale,
      );
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
    const noticeCount = Math.min(content.notices.length, 3);
    content.notices.slice(noticeStart, noticeStart + 3).forEach((action, i) => {
      position(
        action,
        width - Math.min(260, width - 24) - 12,
        Math.max(topHeight + 8, mapY - 38 * (noticeCount - i)),
        Math.min(260, width - 24),
        30,
      );
    });
    const guidance = content.guidance;
    hintFrame.isVisible = !!guidance?.message;
    if (guidance?.message) {
      const hintWidth = Math.min(460, width - 24);
      const hintHeight = heightFor(guidance.message, hintWidth - 24, 13) + 54;
      const hintY = topHeight + 42 + Math.min(72, heightFor(content.feedback, width - 32, 13));
      place(hintFrame, 12, hintY, hintWidth, hintHeight);
      hintText.text = guidance.message;
      place(hintText, 12, 8, hintWidth - 24, hintHeight - 48);
      guidance.actions.forEach((action, i) => {
        position(
          action,
          24 + (i * (hintWidth - 36)) / 2,
          hintY + hintHeight - 34,
          (hintWidth - 44) / 2,
          28,
        );
      });
      layoutRects.push({ x: 12, y: hintY, width: hintWidth, height: hintHeight });
    }
    if (guidance && Object.keys(guidance.help).length) {
      helpLabel("objective", 12, 44, compact ? 142 : 210);
      helpLabel("status", compact ? 12 : width / 2 - 90, compact ? 106 : 44, compact ? 142 : 180);
      helpLabel("global", width - 198, 44, 186);
      helpLabel("economy", 12, economyY - 76, compact ? 200 : 132 * scale);
      helpLabel("groups", 12, helperY - 112, 170);
      helpLabel("map", mapX, mapY - 62, mapSize);
      if (hasSelection) {
        helpLabel("selection", dockX, dockY - 64, compact ? 142 : 184);
        helpLabel("commands", compact ? width - 202 : dockX + 196 * scale, dockY - 64, 190);
      }
      if (content.notices.length)
        helpLabel("notices", width - 272, Math.max(156, mapY - 38 * noticeCount - 64), 260);
    }
    show(inspector, showDetails);
    if (showDetails) {
      const inspectWidth = Math.min(480, width - 24);
      const textHeight = heightFor(content.selection.details, inspectWidth - 44, 13);
      const bodyHeight = textHeight + 16 + content.details.length * 38;
      const inspectBottom = compact ? Math.min(economyY, mapY) : dockY;
      const inspectHeight = Math.min(
        Math.ceil(bodyHeight + 24),
        Math.max(1, Math.min(440, inspectBottom - topHeight - 24)),
      );
      place(
        inspector,
        compact ? 12 : dockX,
        Math.max(topHeight + 12, inspectBottom - inspectHeight - 12),
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
      ...next.selection.types,
      ...next.commands,
      ...next.recipes,
      ...next.queue,
      ...next.details,
      ...next.groups,
      ...next.helpers,
      ...next.mapActions,
      ...next.notices,
      ...(next.guidance?.message ? next.guidance.actions : []),
    ];
    const key = JSON.stringify([
      all.map((action) => [action.id, action.image]),
      next.resources.map((item) => item.id),
      next.status.map((item) => item.id),
      next.shortcuts,
    ]);
    if (key !== contentKey) {
      contentKey = key;
      hideTooltip();
      for (const item of buttons.values()) item.button.dispose();
      awaitingLayout.clear();
      buttons.clear();
      for (const widget of [...resourceWidgets, ...statusWidgets]) {
        widget.label.dispose();
        widget.image?.dispose();
      }
      resourceWidgets.length = 0;
      statusWidgets.length = 0;
      for (const action of all)
        make(
          action,
          next.selection.types.includes(action)
            ? typeBody
            : next.details.includes(action)
              ? inspectorBody
              : layer,
        );
      make(
        local(
          "inspect",
          "Details",
          () => {
            showDetails = !showDetails;
            layout();
          },
          next.shortcuts?.details ?? "I",
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
          next.shortcuts?.build ?? "B",
        ),
      );
      make(
        local("groups", "Groups", () => {
          showGroups = !showGroups;
          layout();
        }),
      );
      for (const [items, widgets] of [
        [next.resources, resourceWidgets],
        [next.status, statusWidgets],
      ] as const)
        for (const item of items) {
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
          widgets.push(widget);
        }
    }
    for (const action of all) {
      const item = buttons.get(action.id);
      if (!item) continue;
      item.action = action;
      item.button.alpha = action.disabled ? 0.45 : 1;
      item.button.background = action.active ? "#3c392d" : "#18262e";
      item.badge.text = action.badge ?? "";
      item.key.text = action.key && action.key.length <= 2 ? action.key : "";
      if (item.label) item.label.text = action.label;
      if (item.progress)
        item.progress.width = `${Math.max(0, Math.min(100, action.progress ?? 0))}%`;
    }
    next.resources.forEach((item, i) => {
      resourceWidgets[i]!.label.text = item.label;
      resourceWidgets[i]!.tooltip = item.tooltip;
    });
    next.status.forEach((item, i) => {
      statusWidgets[i]!.label.text = item.label.replace(/^[^\d−-]*/, "");
      statusWidgets[i]!.tooltip = item.tooltip;
    });
    selectionName.text =
      next.selection.label + (next.selection.count > 1 ? ` ×${next.selection.count}` : "");
    selectionOwner.text = next.selection.owner;
    objectiveLabel.text = next.objective.label;
    ownerColor.background = next.selection.color;
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
  for (const control of [objectiveIcon, objectiveLabel]) {
    control.isHitTestVisible = true;
    control.onPointerEnterObservable.add(() =>
      showTooltip(content?.objective.tooltip ?? "", 12, 48),
    );
    control.onPointerOutObservable.add(hideTooltip);
  }
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
          button.isHitTestVisible &&
          button.parent !== typeBody &&
          button.parent !== inspectorBody &&
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
      if (focusedItem?.button.parent === typeBody) {
        const maximum = Math.max(1, typeBody.heightInPixels - typeScroll.heightInPixels);
        const offset = typeScroll.verticalBar.value * maximum;
        const top = focusedItem.button.topInPixels;
        const bottom = top + focusedItem.button.heightInPixels;
        if (top < offset) typeScroll.verticalBar.value = top / maximum;
        else if (bottom > offset + typeScroll.heightInPixels)
          typeScroll.verticalBar.value = Math.min(
            1,
            (bottom - typeScroll.heightInPixels) / maximum,
          );
      }
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
        const rect = cssRect(item.button.parent === typeBody ? typeScroll : item.button);
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
      if (code === "KeyI" && content?.selection.count) {
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
      scene.onAfterRenderObservable.remove(afterDraw);
      awaitingLayout.clear();
      gui.dispose();
    },
  };
}
