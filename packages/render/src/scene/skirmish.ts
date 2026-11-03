import { Color4, FreeCamera, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Checkbox } from "@babylonjs/gui/2D/controls/checkbox";
import { Container } from "@babylonjs/gui/2D/controls/container";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Ellipse } from "@babylonjs/gui/2D/controls/ellipse";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { BIOMES, SURFACES, type TerrainGrid, WATER } from "@open-neo-rts/content";
import { PALETTES } from "../terrain";
import { createEngine, createScene } from ".";
import type { MenuAction } from "./menu";
import { NativeTextInput, type TextSelection } from "./text-input";

export interface SkirmishField {
  id: string;
  label: string;
  value: string;
  choices?: readonly { value: string; label: string }[];
}

export interface SkirmishViewState {
  values: Readonly<Record<string, string>>;
  veterancy: boolean;
  error: string;
  status: string;
  canStart: boolean;
}

export interface SkirmishViewContent {
  title: string;
  back: MenuAction;
  forcesTitle: string;
  forces: readonly string[];
  faction: string;
  previewNote: string;
  rulesTitle: string;
  rulesNote: string;
  veterancy: string;
  mapTitle: string;
  mapName: string;
  mapDescription: string;
  previewUnavailable: string;
  spawns: readonly { id: string; position: readonly number[] }[];
  resources: readonly { kind: string; position: readonly number[]; radius?: number }[];
  fields: readonly SkirmishField[];
  actions: readonly MenuAction[];
  scale: number;
  change: (id: string, value: string | boolean) => void;
  enter: () => void;
}

/** Native presentation of the existing setup controller; no gameplay state or validation lives here. */
export async function createSkirmishScene(
  canvas: HTMLCanvasElement,
  content: SkirmishViewContent,
  signal: AbortSignal,
) {
  const engine = await createEngine(canvas, signal);
  engine.canvasTabIndex = -1;
  canvas.tabIndex = -1;
  const scene = createScene(engine);
  scene.clearColor = Color4.FromHexString("#10191eff");
  new FreeCamera("setup camera", new Vector3(0, 0, -10), scene);
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("Skirmish", true, scene);
  const scroll = new ScrollViewer("setup scroll");
  scroll.thickness = 0;
  scroll.barColor = "#ddc382";
  scroll.barBackground = "#18262e";
  scroll.barSize = 8;
  scroll.wheelPrecision = 0.08;
  gui.addControl(scroll);
  const body = new Container("setup content");
  body.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  body.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  scroll.addControl(body);
  const place = (control: Control, x: number, y: number, width: number, height: number) => {
    control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    control.leftInPixels = x;
    control.topInPixels = y;
    control.widthInPixels = width;
    control.heightInPixels = height;
  };
  const label = (
    name: string,
    value: string,
    size: number,
    parent: Container | AdvancedDynamicTexture = body,
  ) => {
    const control = new TextBlock(name, value);
    control.fontFamily = "Arial, sans-serif";
    control.fontSize = size;
    control.color = "#b5c0bf";
    control.textWrapping = true;
    control.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    control.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    parent.addControl(control);
    return control;
  };
  const button = (action: MenuAction, parent: Container | AdvancedDynamicTexture = body) => {
    const control = Button.CreateSimpleButton(action.id, action.label);
    control.color = "#ddc382";
    control.background = action.primary ? "#3c392d" : "#18262e";
    control.thickness = 1;
    control.fontSize = 15;
    control.tabIndex = -1;
    control.hoverCursor = "pointer";
    control.pointerEnterAnimation = () => {
      control.background = "#35434a";
    };
    control.pointerOutAnimation = () => {
      control.background = action.primary ? "#3c392d" : "#18262e";
    };
    control.pointerDownAnimation = () => {
      control.background = "#4a4535";
    };
    control.pointerUpAnimation = control.pointerOutAnimation;
    if (control.textBlock) control.textBlock.textWrapping = true;
    control.onPointerClickObservable.add(() => {
      if (control.isEnabled) action.activate();
    });
    parent.addControl(control);
    return control;
  };
  const title = label("title", content.title, 32, gui);
  title.color = "#eff1e9";
  title.fontWeight = "bold";
  const back = button(content.back, gui);
  const forcesTitle = label("forces", content.forcesTitle, 20);
  forcesTitle.color = "#eff1e9";
  const forceNames = content.forces.map((name, i) => {
    const control = label(`force ${i}`, name, 17);
    control.color = i === 0 ? "#81d4ed" : "#efa394";
    return control;
  });
  const factions = content.forces.map((_, i) => label(`faction ${i}`, content.faction, 17));
  const note = label("starting kit", content.previewNote, 14);
  const rules = label("rules", content.rulesTitle, 20);
  rules.color = "#eff1e9";
  const ruleNote = label("fixed rules", content.rulesNote, 14);
  const mapTitle = label("map", content.mapTitle, 20);
  mapTitle.color = "#eff1e9";
  const mapName = label("map name", content.mapName, 23);
  mapName.color = "#ddc382";
  const description = label("map description", content.mapDescription, 14);
  const preview = new Image("map terrain");
  preview.stretch = Image.STRETCH_UNIFORM;
  body.addControl(preview);
  const unavailable = label("preview unavailable", content.previewUnavailable, 14);
  const markers = ["#81d4ed", "#efa394"].map((color, i) => {
    const marker = new Ellipse(`spawn ${i}`);
    marker.color = "#eff1e9";
    marker.background = color;
    marker.thickness = 2;
    body.addControl(marker);
    return marker;
  });
  const feedback = label("feedback", "", 14, gui);
  const check = new Checkbox("veterancy");
  check.color = "#ddc382";
  check.background = "#18262e";
  check.tabIndex = -1;
  body.addControl(check);
  const checkLabel = label("veterancy label", content.veterancy, 16);
  checkLabel.isPointerBlocker = true;
  checkLabel.onPointerClickObservable.add(() => {
    focused = "veterancy";
    check.isChecked = !check.isChecked;
  });
  check.onPointerDownObservable.add(() => {
    focused = "veterancy";
  });
  const actions = content.actions.map((action) => button(action, gui));
  let syncing = false;
  let focused: string | undefined;
  let state: SkirmishViewState = {
    values: Object.fromEntries(content.fields.map((field) => [field.id, field.value])),
    veterancy: true,
    error: "",
    status: "",
    canStart: true,
  };
  let popup: Rectangle | undefined;
  let contentHeight = 0;
  let mapBounds = { x: 0, y: 0, size: 0 };
  let terrain: TerrainGrid | undefined;
  function ensureVisible(control: Control) {
    const range = contentHeight - scroll.heightInPixels;
    if (range <= 0) return;
    const top = scroll.verticalBar.value * range;
    const y = control.topInPixels;
    if (y < top) scroll.verticalBar.value = Math.max(0, (y - 12) / range);
    else if (y + control.heightInPixels > top + scroll.heightInPixels)
      scroll.verticalBar.value = Math.min(
        1,
        (y + control.heightInPixels - scroll.heightInPixels + 12) / range,
      );
  }
  const fields = content.fields.map((field) => {
    const caption = label(`${field.id} label`, field.label, 13);
    const input = field.choices
      ? button({
          id: field.id,
          label: "",
          activate: () => {
            popup?.dispose();
            focused = field.id;
            popup = new Rectangle("spawn choices");
            popup.background = "#18262e";
            popup.color = "#ddc382";
            popup.thickness = 1;
            body.addControl(popup);
            place(
              popup,
              input.leftInPixels,
              input.topInPixels + input.heightInPixels,
              input.widthInPixels,
              (field.choices?.length ?? 0) * 44,
            );
            field.choices?.forEach((choice, i) => {
              const option = button(
                {
                  id: choice.value,
                  label: choice.label,
                  activate: () => {
                    content.change(field.id, choice.value);
                    popup?.dispose();
                    popup = undefined;
                  },
                },
                popup,
              );
              place(option, 0, i * 44, input.widthInPixels, 44);
            });
            ensureVisible(popup);
          },
        })
      : new NativeTextInput(field.id, field.value);
    if (input instanceof NativeTextInput) {
      input.autoStretchWidth = false;
      input.color = "#eff1e9";
      input.background = "#18262e";
      input.focusedBackground = "#25343b";
      input.focusedColor = "#ddc382";
      input.promptMessage = field.label;
      input.tabIndex = -1;
      input.onFocusObservable.add(() => {
        focused = field.id;
        ensureVisible(input);
      });
      input.onTextChangedObservable.add(() => {
        if (!syncing) content.change(field.id, input.text);
      });
      input.onKeyboardEventProcessedObservable.add((event) => {
        if (event.key === "Enter") content.enter();
      });
      body.addControl(input);
    }
    return { field, caption, input };
  });
  check.onIsCheckedChangedObservable.add((value) => {
    if (!syncing) content.change("veterancy", value);
  });
  function positionMarkers() {
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i]!;
      const spawn = content.spawns.find(
        (spawn) => spawn.id === state.values[i === 0 ? "yourSpawn" : "otherSpawn"],
      );
      marker.isVisible = !!terrain && !!spawn;
      if (terrain && spawn)
        place(
          marker,
          mapBounds.x + ((spawn.position[0] ?? 0) / terrain.width) * mapBounds.size - 7,
          mapBounds.y + ((spawn.position[1] ?? 0) / terrain.height) * mapBounds.size - 7,
          14,
          14,
        );
    }
  }
  function layout() {
    popup?.dispose();
    popup = undefined;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const scale = Math.min(content.scale, Math.max(0.85, width / 390));
    const wide = width >= 900 * scale;
    const inset = width < 700 ? 24 : Math.max(36, width * 0.05);
    const available = width - inset * 2 - 12;
    const leftWidth = wide ? available * 0.55 : available;
    const gap = 32 * scale;
    const rightX = wide ? leftWidth + gap : 0;
    const rightWidth = wide ? available - rightX : available;
    const header = 100 * scale;
    const footer = (wide ? 126 : 180) * scale;
    place(back, inset, 26 * scale, 80 * scale, 44 * scale);
    place(title, inset + 104 * scale, 26 * scale, available - 104 * scale, 48 * scale);
    title.fontSize = 32 * scale;
    place(scroll, inset, header, available + 12, Math.max(80, height - header - footer));
    body.widthInPixels = available;
    place(forcesTitle, 0, 0, leftWidth, 30 * scale);
    for (let i = 0; i < 2; i++) {
      const y = (48 + i * 112) * scale;
      place(forceNames[i]!, 0, y, leftWidth * 0.48, 26 * scale);
      place(factions[i]!, 0, y + 32 * scale, leftWidth * 0.48, 40 * scale);
      factions[i]!.fontSize = (wide ? 17 : 15) * scale;
      place(fields[i]!.caption, leftWidth * 0.52, y, leftWidth * 0.48, 22 * scale);
      place(fields[i]!.input, leftWidth * 0.52, y + 28 * scale, leftWidth * 0.48, 44 * scale);
    }
    place(note, 0, 286 * scale, leftWidth, 62 * scale);
    const mapY = wide ? 0 : 362 * scale;
    const mapSize = Math.min(rightWidth, 340 * scale);
    place(mapTitle, rightX, mapY, rightWidth, 30 * scale);
    place(mapName, rightX, mapY + 38 * scale, rightWidth, 34 * scale);
    mapBounds = { x: rightX, y: mapY + 84 * scale, size: mapSize };
    place(preview, mapBounds.x, mapBounds.y, mapSize, mapSize);
    place(unavailable, mapBounds.x, mapBounds.y + mapSize / 2, mapSize, 48 * scale);
    place(description, rightX, mapY + mapSize + 100 * scale, rightWidth, 80 * scale);
    const ruleY = wide ? 360 * scale : mapY + mapSize + 210 * scale;
    place(rules, 0, ruleY, leftWidth, 32 * scale);
    const fieldWidth = (leftWidth - 20 * scale) / 2;
    for (let i = 2; i < fields.length; i++) {
      const x = (i % 2) * (fieldWidth + 20 * scale);
      const y = ruleY + (48 + Math.floor((i - 2) / 2) * 94) * scale;
      place(fields[i]!.caption, x, y, fieldWidth, 24 * scale);
      place(fields[i]!.input, x, y + 28 * scale, fieldWidth, 44 * scale);
    }
    place(check, 0, ruleY + 244 * scale, 26 * scale, 26 * scale);
    place(checkLabel, 40 * scale, ruleY + 236 * scale, leftWidth - 40 * scale, 44 * scale);
    checkLabel.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    place(ruleNote, 0, ruleY + 292 * scale, leftWidth, 50 * scale);
    contentHeight = ruleY + 356 * scale;
    body.heightInPixels = contentHeight;
    place(feedback, inset, height - footer + 8 * scale, available, 56 * scale);
    const columns = wide ? 4 : 2;
    const actionWidth = (available - (columns - 1) * 10 * scale) / columns;
    actions.forEach((action, i) => {
      place(
        action,
        inset + (i % columns) * (actionWidth + 10 * scale),
        height - (wide ? 60 : 112) * scale + Math.floor(i / columns) * 54 * scale,
        actionWidth,
        44 * scale,
      );
    });
    for (const item of fields) {
      item.caption.fontSize = 13 * scale;
      item.input.fontSize = 16 * scale;
    }
    for (const action of [back, ...actions]) action.fontSize = 15 * scale;
    for (const control of [note, description, ruleNote, feedback]) control.fontSize = 14 * scale;
    positionMarkers();
  }
  function update(next: SkirmishViewState) {
    state = next;
    syncing = true;
    for (const { field, input } of fields) {
      const value = next.values[field.id] ?? "";
      if (input instanceof NativeTextInput) input.text = value;
      else if (input.textBlock)
        input.textBlock.text =
          field.choices?.find((choice) => choice.value === value)?.label ?? value;
    }
    check.isChecked = next.veterancy;
    syncing = false;
    feedback.text = next.error || next.status;
    feedback.color = next.error ? "#ffb7a8" : "#b5c0bf";
    const start = actions[actions.length - 1];
    if (start) {
      start.isEnabled = next.canStart;
      start.alpha = next.canStart ? 1 : 0.4;
    }
    positionMarkers();
  }
  function focus(id?: string) {
    gui.focusedControl = null;
    focused = id;
    const target = fields.find((item) => item.field.id === id)?.input;
    for (const { input } of fields) input.thickness = input === target ? 2 : 1;
    if (target) ensureVisible(target);
    check.thickness = id === "veterancy" ? 3 : 1;
    if (id === "veterancy") ensureVisible(check);
    for (const control of [back, ...actions]) control.thickness = control.name === id ? 2 : 1;
  }
  const resize = () => {
    engine.resize();
    layout();
  };
  const render = () => scene.render();
  window.addEventListener("resize", resize);
  layout();
  update(state);
  engine.runRenderLoop(render);
  let disposed = false;
  return {
    update,
    focus,
    selection(id?: string, selection?: TextSelection) {
      for (const { field, input } of fields)
        if (input instanceof NativeTextInput)
          input.mirrorSelection(field.id === id ? selection : undefined);
    },
    activeField: () => focused,
    drawn: () =>
      new Promise<void>((resolve) => {
        const observer = scene.onDisposeObservable.addOnce(() => resolve());
        scene.onAfterRenderObservable.addOnce(() => {
          scene.onDisposeObservable.remove(observer);
          resolve();
        });
      }),
    setMap(grid: TerrainGrid) {
      terrain = grid;
      const image = document.createElement("canvas");
      image.width = grid.width;
      image.height = grid.height;
      const context = image.getContext("2d");
      if (!context) return;
      const pixels = context.createImageData(grid.width, grid.height);
      for (let i = 0; i < grid.width * grid.height; i++) {
        const palette = PALETTES[BIOMES[grid.biome[i] ?? 0] ?? "temperate"];
        const color =
          grid.water[i] === WATER.deep
            ? palette.deep
            : grid.water[i] === WATER.shallow
              ? palette.shallow
              : palette.surfaces[SURFACES[grid.surface[i] ?? 0] ?? "grass"];
        const light = 0.8 + (grid.level[i] ?? 0) * 0.025;
        pixels.data[i * 4] = ((color >>> 16) & 255) * light;
        pixels.data[i * 4 + 1] = ((color >>> 8) & 255) * light;
        pixels.data[i * 4 + 2] = (color & 255) * light;
        pixels.data[i * 4 + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      for (const resource of content.resources) {
        context.fillStyle =
          resource.kind === "ore" ? "#ddc382" : resource.kind === "oil" ? "#18262e" : "#b5c0bf";
        context.beginPath();
        context.arc(
          resource.position[0] ?? 0,
          resource.position[1] ?? 0,
          resource.radius ?? 2,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      preview.source = image.toDataURL();
      unavailable.isVisible = false;
      positionMarkers();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop(render);
      scene.dispose();
      engine.dispose();
    },
  };
}
