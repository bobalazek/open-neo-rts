import {
  type GameplayDefinition,
  type PresentedEntity,
  QUEUED_ORDER_TYPES,
  type SeatSnapshot,
} from "@open-neo-rts/sim";
import { type MatchResource, resourceNodeOrigin, resourceOccupies } from "@open-neo-rts/sim/maps";
import { setText, text } from "../../shared";
import type { OfflineState } from "../../worker";
import {
  type BindingAction,
  bindingText,
  COMMAND_ACTIONS,
  CONTROL_GROUPS,
  chordText,
  defaultBindings,
  type KeyBindings,
  matchesBinding,
} from "../settings/bindings";
import { createControlGroups } from "./groups";
import {
  affordable,
  footprintCells,
  type HudDefinition,
  idleBuilder,
  recipeLock,
  selectedEntities,
} from "./hud-model";
import { actionText, decorateAction, type HudIcon, hudIcon } from "./icons";

type Point = { x: number; y: number };
type Mode = (
  | {
      type:
        | "unit.move"
        | "unit.attackMove"
        | "unit.attack"
        | "unit.load"
        | "economy.assistConstruction"
        | "economy.repair"
        | "economy.salvage"
        | "production.rally";
      handles: string[];
    }
  | { type: "economy.build"; handles: string[]; definition: string; rotation: number }
  | { type: "unit.editQueued"; handles: string[]; grid: boolean }
) & { append?: boolean };
type Options = {
  catalog: readonly HudDefinition[];
  roster: ReadonlySet<string>;
  resources: readonly MatchResource[];
  force: number;
  forceIdentity?: (force: number) => { label: string; color: string };
  populationCap: number;
  selection: () => string[];
  select: (handles: readonly string[]) => void;
  pick: (x: number, y: number) => string | null;
  pickCell: (x: number, y: number) => Point | null;
  command: (type: string, payload: unknown) => Promise<unknown>;
  preview: (cells: readonly Point[] | null) => void;
  paused: () => boolean;
  fail: (error: unknown) => void;
  present?: () => void;
  blocksPointer?: (x: number, y: number) => boolean;
  bindings?: () => KeyBindings;
};

let hudIdentity = 0;

/** Normal command panels consume permitted copies only; every mutation travels through the worker. */
export function createMatchHud(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  options: Options,
  signal: AbortSignal,
) {
  const definitions = new Map(options.catalog.map((entry) => [entry.gameplay.id, entry]));
  const groups = createControlGroups();
  const defaults = defaultBindings();
  const bindings = options.bindings ?? (() => defaults);
  const bound = (action: BindingAction, event: KeyboardEvent) =>
    matchesBinding(bindings(), action, event);
  function hint(button: HTMLButtonElement, action: BindingAction, label: string) {
    const keys = bindings()[action];
    button.dataset.hotkey = keys[0] ? chordText(keys[0]) : "";
    actionText(button, `${keys.length ? `${bindingText(bindings(), action)} · ` : ""}${label}`);
  }
  let snapshot: SeatSnapshot | undefined,
    mode: Mode | undefined,
    busy = false;
  let pointer: Point | undefined;
  let previewKey = "";
  let right: { id: number; x: number; y: number; dragged: boolean } | undefined;
  let menuKey = "",
    queueKey = "",
    selectionKey = "",
    adviceKey = "";
  let idleBuilderIndex = 0,
    idleProducerIndex = 0;
  let shiftHeld = false,
    ordersKey = "";
  window.addEventListener(
    "keydown",
    (event) => {
      shiftHeld = event.shiftKey;
    },
    { signal, capture: true },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      shiftHeld = event.shiftKey;
    },
    { signal, capture: true },
  );
  window.addEventListener(
    "blur",
    () => {
      shiftHeld = false;
    },
    { signal },
  );
  window.addEventListener(
    "pointerdown",
    (event) => {
      shiftHeld = event.shiftKey;
    },
    { signal, capture: true },
  );
  const section = document.createElement("section");
  section.className = "match-hud";
  section.setAttribute("aria-label", text("ui.hud.title"));
  section.innerHTML = `<div class="hud-feedback"><p data-mode role="status" aria-live="polite"></p><p data-result role="status" aria-live="polite"></p><div data-requests></div></div><nav class="hud-panel-tabs" aria-label="${text("ui.hud.panels")}" data-panel-tabs></nav><div class="hud-panels"><section class="hud-selection"><header><h2>${text("ui.hud.selection")}</h2><p data-summary></p></header><div class="hud-selection-profile"><img data-portrait alt="" hidden/><div><div data-types class="hud-types"></div><progress data-health max="100" value="0" aria-label="${text("ui.hud.health-bar")}" hidden></progress></div></div><div data-details tabindex="0"></div></section><section class="hud-command-panel"><h2>${text("ui.hud.commands")}</h2><div class="hud-command-grid" data-commands></div></section><section class="hud-build-panel"><h2 data-build-title>${text("ui.hud.build")}</h2><ol class="hud-queue" data-queue></ol><div class="hud-catalog" data-catalog></div><p data-advice class="hud-help"></p></section></div><div class="hud-groups"><span>${text("ui.hud.groups")}</span><div data-groups></div><label>${text("ui.hud.group")}<select data-group-index>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<option>${n}</option>`).join("")}</select></label><button type="button" data-set-group>${text("ui.hud.set-group")}</button><button type="button" data-add-group>${text("ui.hud.add-group")}</button><button type="button" data-idle-builder></button><button type="button" data-idle-producer></button></div>`;
  root.append(section);
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => {
    const element = section.querySelector<T>(selector);
    if (!element) throw new Error(`HUD element missing: ${selector}`);
    return element;
  };
  const summary = get("[data-summary]"),
    details = get("[data-details]"),
    types = get("[data-types]");
  const menu = get("[data-catalog]"),
    queue = get("[data-queue]"),
    advice = get("[data-advice]");
  const sites = document.createElement("div");
  const recipeInfo = document.createElement("div");
  recipeInfo.className = "hud-recipe-info";
  recipeInfo.id = `match-recipe-info-${++hudIdentity}`;
  recipeInfo.setAttribute("role", "tooltip");
  recipeInfo.hidden = true;
  section.append(recipeInfo);
  let inspectedRecipe: HTMLButtonElement | undefined;
  function inspectRecipe(item: HTMLButtonElement) {
    inspectedRecipe = item;
    setText(recipeInfo, item.dataset.recipeInfo ?? "");
    recipeInfo.style.left = `${Math.max(8, Math.min(innerWidth - 328, get(".hud-build-panel").getBoundingClientRect().left))}px`;
    recipeInfo.style.bottom = `${innerHeight - get(".hud-build-panel").getBoundingClientRect().top + 8}px`;
    recipeInfo.hidden = false;
  }
  function closeRecipe() {
    recipeInfo.hidden = true;
    inspectedRecipe = undefined;
  }
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (inspectedRecipe && !inspectedRecipe.contains(event.target as Node)) closeRecipe();
    },
    { signal },
  );
  sites.className = "hud-sites";
  sites.setAttribute("aria-label", text("ui.hud.sites"));
  menu.before(sites);
  const modeLabel = get("[data-mode]"),
    resultLabel = get("[data-result]"),
    requests = get("[data-requests]");
  const groupIndex = get<HTMLSelectElement>("[data-group-index]");
  const orderPanel = document.createElement("div");
  orderPanel.dataset.orderQueue = "";
  get(".hud-command-panel").append(orderPanel);
  const own = () =>
    snapshot
      ? selectedEntities(snapshot, options.selection()).filter(
          (entity) => entity.force === options.force && entity.health > 0,
        )
      : [];
  const units = () =>
    own().filter((entity) => definitions.get(entity.definition)?.gameplay.kind === "unit");
  const builders = () =>
    units().filter((entity) => definitions.get(entity.definition)?.gameplay.role === "builder");
  const name = (id: string) => definitions.get(id)?.name ?? id;
  function button(label: string, action: () => void, parent: HTMLElement, title?: string) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (title) element.title = title;
    element.addEventListener("click", action, { signal });
    parent.append(element);
    return element;
  }
  section.dataset.panel = "commands";
  const tabs = ["selection", "commands", "build", "map"] as const;
  const panelButtons = tabs.map((panel) =>
    button(
      text(
        panel === "selection"
          ? "ui.hud.selection"
          : panel === "commands"
            ? "ui.hud.commands"
            : panel === "map"
              ? "ui.minimap.title"
              : "ui.hud.build",
      ),
      () => {
        section.dataset.panel = panel;
        panelButtons.forEach((button, i) => {
          button.setAttribute("aria-pressed", String(tabs[i] === panel));
        });
      },
      get("[data-panel-tabs]"),
    ),
  );
  panelButtons.forEach((button, i) => {
    button.setAttribute("aria-pressed", String(tabs[i] === "commands"));
  });
  function feedback(key: Parameters<typeof text>[0], values?: Record<string, string | number>) {
    resultLabel.dataset.feedbackKey = key;
    resultLabel.textContent = text(key, values);
  }
  function cancel() {
    const active = mode !== undefined;
    mode = undefined;
    delete canvas.dataset.commandMode;
    modeLabel.textContent = "";
    previewKey = "";
    options.preview(null);
    update();
    return active;
  }
  function arm(next: Mode) {
    if (busy || options.paused()) return;
    mode = { ...next, append: next.append ?? shiftHeld };
    canvas.dataset.commandMode = next.type;
    resultLabel.textContent = "";
    modeLabel.textContent = text(
      next.type === "economy.build" ? "ui.hud.placing" : "ui.hud.targeting",
      {
        name: next.type === "economy.build" ? name(next.definition) : commandLabel(next.type),
        rotation: next.type === "economy.build" ? next.rotation * 90 : 0,
      },
    );
    canvas.focus({ preventScroll: true });
    update();
  }
  async function issue(type: string, payload: unknown, append = shiftHeld) {
    if (busy) return;
    if (options.paused()) {
      feedback("ui.hud.resume-first");
      return;
    }
    busy = true;
    update();
    try {
      const result = await options.command(
        type,
        append &&
          QUEUED_ORDER_TYPES.some((order) => order === type) &&
          typeof payload === "object" &&
          payload !== null
          ? { ...payload, append: 1 }
          : payload,
      );
      if (signal.aborted) return;
      if (result === "accepted") feedback("ui.hud.accepted");
      else feedback("ui.hud.refused", { reason: refusal(result) });
    } catch (error) {
      if (!signal.aborted) options.fail(error);
    } finally {
      busy = false;
      if (!signal.aborted) update();
    }
  }
  function commandLabel(type: Mode["type"] | (typeof QUEUED_ORDER_TYPES)[number]) {
    const labels = {
      "unit.move": "ui.hud.move",
      "unit.attackMove": "ui.hud.attack-move",
      "unit.attack": "ui.hud.attack",
      "unit.load": "ui.hud.load",
      "economy.assistConstruction": "ui.hud.assist",
      "economy.repair": "ui.hud.repair",
      "economy.salvage": "ui.hud.clear-remains",
      "production.rally": "ui.hud.rally",
      "economy.build": "ui.hud.build",
      "unit.editQueued": "ui.hud.edit-waypoint",
      "unit.stop": "ui.hud.stop",
      "unit.hold": "ui.hud.hold",
      "unit.harvest": "ui.hud.harvest",
      "unit.deploy": "ui.hud.deploy-toggle",
      "unit.unload": "ui.hud.unload",
    } as const;
    return text(labels[type]);
  }
  const labels = [
    "ui.hud.move",
    "ui.hud.attack",
    "ui.hud.harvest",
    "ui.hud.rally",
    "ui.hud.attack-move",
    "ui.hud.stop",
    "ui.hud.assist",
    "ui.hud.repair",
    "ui.hud.cancel-work",
    "ui.hud.power-off",
    "ui.hud.sell",
    "ui.hud.rotate",
  ] as const;
  const keys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
  const commandButtons = labels.map((label, i) =>
    button(`${keys[i]} · ${text(label)}`, () => activate(i), get("[data-commands]")),
  );
  const commandIcons = [
    "move",
    "attack",
    "harvest",
    "rally",
    "assault",
    "stop",
    "build",
    "repair",
    "cancel",
    "power",
    "sell",
    "rotate",
  ] as const;
  commandButtons.forEach((button, index) => {
    button.dataset.commandIndex = String(index);
    decorateAction(button, commandIcons[index]!, keys[index]);
  });
  const deployButton = button(
    text("ui.hud.deploy-toggle"),
    () => {
      cancel();
      void issue("unit.deploy", {
        entities: units()
          .filter((entity) => definitions.get(entity.definition)?.gameplay.deployMode)
          .map((entity) => entity.handle),
      });
    },
    get(".hud-command-panel"),
  );
  deployButton.dataset.deploy = "";
  const salvageButton = button(
    text("ui.hud.clear-remains"),
    () => arm({ type: "economy.salvage", handles: builders().map((entity) => entity.handle) }),
    get(".hud-command-panel"),
  );
  salvageButton.dataset.salvage = "";
  const holdButton = button(
    `H · ${text("ui.hud.hold")}`,
    () => {
      cancel();
      void issue("unit.hold", { entities: units().map((entity) => entity.handle) });
    },
    get(".hud-command-panel"),
  );
  holdButton.dataset.hold = "";
  const surgeButton = button(
    text("ui.hud.surge"),
    () => {
      const provider = own().find((entity) => entity.productionSurge);
      if (!provider?.productionSurge) return;
      cancel();
      void issue("commander.activate", {
        entity: provider.handle,
        ability: provider.productionSurge.id,
      });
    },
    get(".hud-command-panel"),
  );
  surgeButton.dataset.surge = "";
  const loadButton = button(
    text("ui.hud.load"),
    () =>
      arm({
        type: "unit.load",
        handles: units()
          .filter((entity) => definitions.get(entity.definition)?.gameplay.domain === "foot")
          .map((entity) => entity.handle),
      }),
    get(".hud-command-panel"),
  );
  loadButton.dataset.load = "";
  const unloadButton = button(
    `U · ${text("ui.hud.unload")}`,
    () => {
      const transport = units().find((entity) => entity.cargo);
      if (transport) {
        cancel();
        void issue("unit.unload", { entity: transport.handle });
      }
    },
    get(".hud-command-panel"),
  );
  unloadButton.dataset.unload = "";
  for (const [button, icon, key] of [
    [salvageButton, "salvage", ""],
    [holdButton, "hold", "H"],
    [loadButton, "load", ""],
    [unloadButton, "unload", "U"],
    [deployButton, "deploy", ""],
    [surgeButton, "surge", ""],
  ] as const) {
    decorateAction(button, icon, key);
    get("[data-commands]").append(button);
  }
  function activate(index: number) {
    if (commandButtons[index]?.disabled) return;
    const selectedUnits = units(),
      selectedBuilders = builders(),
      structure = own().find(
        (entity) => definitions.get(entity.definition)?.gameplay.kind === "structure",
      );
    const ids = selectedUnits
        .filter(
          (entity) => index !== 1 || !!definitions.get(entity.definition)?.gameplay.weapons.length,
        )
        .map((entity) => entity.handle),
      buildIds = selectedBuilders.map((entity) => entity.handle);
    if (index === 0 || index === 1 || index === 4)
      arm({
        type: index === 0 ? "unit.move" : index === 1 ? "unit.attack" : "unit.attackMove",
        handles: ids,
      });
    else if (index === 2)
      void issue("unit.harvest", {
        entities: selectedUnits
          .filter((entity) => definitions.get(entity.definition)?.gameplay.role === "harvester")
          .map((entity) => entity.handle),
      });
    else if (index === 3 && structure)
      arm({ type: "production.rally", handles: [structure.handle] });
    else if (index === 5) {
      cancel();
      void issue("unit.stop", { entities: ids });
    } else if (
      index === 6 &&
      !selectedBuilders.length &&
      selectedUnits.some((entity) => definitions.get(entity.definition)?.gameplay.deployMode)
    ) {
      deployButton.click();
    } else if (index === 6 || index === 7)
      arm({
        type: index === 6 ? "economy.assistConstruction" : "economy.repair",
        handles: buildIds,
      });
    else if (index === 8 && structure) {
      cancel();
      void issue(
        structure.constructionSite ? "economy.cancelConstruction" : "economy.cancelRepair",
        { entity: structure.handle },
      );
    } else if (index === 9 && structure)
      void issue("economy.power", {
        entity: structure.handle,
        enabled: structure.power?.enabled ? 0 : 1,
      });
    else if (index === 10 && structure) void issue("economy.sell", { entity: structure.handle });
    else if (index === 11 && mode?.type === "economy.build") {
      const next = { ...mode, rotation: (mode.rotation + 1) % 4 };
      arm(next);
      preview();
    }
  }
  const groupButtons = CONTROL_GROUPS.map((index) =>
    button(
      String(index),
      () => {
        cancel();
        options.select(groups.get(index));
        canvas.focus({ preventScroll: true });
        update();
      },
      get("[data-groups]"),
    ),
  );
  function storeGroup(add: boolean) {
    groups.set(
      Number(groupIndex.value),
      own().map((entity) => entity.handle),
      add,
    );
    canvas.focus({ preventScroll: true });
    update();
  }
  get("[data-set-group]").addEventListener("click", () => storeGroup(false), { signal });
  get("[data-add-group]").addEventListener("click", () => storeGroup(true), { signal });
  function idle(producer: boolean) {
    return (
      snapshot?.entities.filter(
        (entity) =>
          entity.force === options.force &&
          (producer
            ? !!entity.production && !entity.constructionSite && !entity.production.queue.length
            : idleBuilder(entity, definitions.get(entity.definition)?.gameplay)),
      ) ?? []
    );
  }
  get("[data-idle-builder]").addEventListener(
    "click",
    () => {
      const list = idle(false);
      const entity = list[idleBuilderIndex++ % list.length];
      if (entity) {
        cancel();
        options.select([entity.handle]);
        canvas.focus({ preventScroll: true });
        update();
      }
    },
    { signal },
  );
  get("[data-idle-producer]").addEventListener(
    "click",
    () => {
      const list = idle(true);
      const entity = list[idleProducerIndex++ % list.length];
      if (entity) {
        cancel();
        options.select([entity.handle]);
        canvas.focus({ preventScroll: true });
        update();
      }
    },
    { signal },
  );
  function placementCell(definition: GameplayDefinition, cell: Point) {
    const node = definition.nodeKinds?.length
      ? options.resources.find(
          (resource) =>
            resource.kind !== "ore" &&
            definition.nodeKinds?.includes(resource.kind) &&
            resourceOccupies(resource, cell.x, cell.y),
        )
      : undefined;
    return node ? resourceNodeOrigin(node) : cell;
  }
  function preview() {
    if (mode?.type !== "economy.build" || !pointer) {
      if (previewKey) {
        previewKey = "";
        options.preview(null);
      }
      return;
    }
    const cell = options.pickCell(pointer.x, pointer.y),
      definition = definitions.get(mode.definition)?.gameplay;
    const origin = cell && definition ? placementCell(definition, cell) : null;
    const cells =
      origin && definition ? footprintCells(definition, origin.x, origin.y, mode.rotation) : null;
    const key = JSON.stringify(cells);
    if (key !== previewKey) {
      previewKey = key;
      options.preview(cells);
    }
  }
  function target(x: number, y: number) {
    if (!mode || busy || options.paused() || !snapshot) return;
    const active = mode,
      cell = options.pickCell(x, y);
    const append = active.append || shiftHeld;
    const finish = () => {
      if (!append) cancel();
    };
    if (!cell) {
      feedback("ui.orders.outside");
      return;
    }
    const point = { x: cell.x * 1024 + 512, y: cell.y * 1024 + 512 };
    if (active.type === "unit.editQueued") {
      cancel();
      void issue(active.type, {
        item: active.handles[0],
        x: cell.x * 1024 + (active.grid ? 0 : 512),
        y: cell.y * 1024 + (active.grid ? 0 : 512),
      });
    } else if (active.type === "economy.build") {
      const definition = definitions.get(active.definition)?.gameplay;
      const origin = definition ? placementCell(definition, cell) : cell;
      finish();
      void issue(
        active.type,
        {
          definition: active.definition,
          builders: active.handles,
          force: options.force,
          x: origin.x * 1024,
          y: origin.y * 1024,
          facing: ((active.rotation + 1) * 0x4000) & 0xffff,
        },
        append,
      );
    } else if (active.type === "unit.move" || active.type === "unit.attackMove") {
      finish();
      void issue(active.type, { entities: active.handles, ...point }, append);
    } else if (active.type === "production.rally") {
      cancel();
      void issue(active.type, { entity: active.handles[0], ...point });
    } else {
      const bounds = canvas.getBoundingClientRect(),
        handle = options.pick(x - bounds.left, y - bounds.top);
      if (active.type === "economy.salvage") {
        if (!snapshot.remains?.some((row) => row.handle === handle)) {
          feedback("ui.hud.pick-remains");
          return;
        }
        finish();
        void issue(active.type, { builders: active.handles, entity: handle }, append);
        return;
      }
      const entity = snapshot.entities.find((entity) => entity.handle === handle);
      if (!entity) {
        feedback("ui.hud.pick-target");
        return;
      }
      if (
        active.type === "unit.load"
          ? entity.force !== options.force || !entity.cargo
          : active.type === "unit.attack"
            ? entity.force === options.force
            : entity.force !== options.force ||
              definitions.get(entity.definition)?.gameplay.kind !== "structure"
      ) {
        feedback("ui.hud.wrong-target");
        return;
      }
      if (active.type === "economy.assistConstruction" && !entity.constructionSite) {
        feedback("ui.hud.need-site");
        return;
      }
      if (
        active.type === "economy.repair" &&
        (entity.constructionSite || entity.health >= entity.maxHealth)
      ) {
        feedback("ui.hud.need-damage");
        return;
      }
      finish();
      void issue(
        active.type,
        active.type === "unit.attack" || active.type === "unit.load"
          ? { entities: active.handles, entity: handle }
          : { builders: active.handles, entity: handle },
        append,
      );
    }
  }
  canvas.addEventListener(
    "click",
    (event) => {
      if (mode && event.button === 0 && !options.blocksPointer?.(event.clientX, event.clientY))
        target(event.clientX, event.clientY);
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button === 2 && !options.blocksPointer?.(event.clientX, event.clientY))
        right = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      pointer = options.blocksPointer?.(event.clientX, event.clientY)
        ? undefined
        : { x: event.clientX, y: event.clientY };
      if (
        right?.id === event.pointerId &&
        Math.hypot(event.clientX - right.x, event.clientY - right.y) > 5
      )
        right.dragged = true;
      preview();
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      const down = right;
      right = undefined;
      if (
        event.defaultPrevented ||
        !down ||
        options.blocksPointer?.(event.clientX, event.clientY) ||
        down.id !== event.pointerId ||
        event.button !== 2 ||
        down.dragged ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5
      )
        return;
      const bounds = canvas.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientY < bounds.top ||
        event.clientX > bounds.right ||
        event.clientY > bounds.bottom
      )
        return;
      if (cancel() || busy || options.paused()) return;
      const selected = units();
      if (!selected.length) {
        const producer = own().find((entity) => entity.production && !entity.constructionSite);
        const cell = options.pickCell(event.clientX, event.clientY);
        if (producer && cell)
          void issue("production.rally", {
            entity: producer.handle,
            x: cell.x * 1024 + 512,
            y: cell.y * 1024 + 512,
          });
        return;
      }
      const targetHandle = options.pick(event.clientX - bounds.left, event.clientY - bounds.top),
        enemy = snapshot?.entities.find(
          (entity) => entity.handle === targetHandle && entity.force !== options.force,
        );
      const transport = snapshot?.entities.find(
        (entity) =>
          entity.handle === targetHandle && entity.force === options.force && entity.cargo,
      );
      const infantry = selected.filter(
        (entity) => definitions.get(entity.definition)?.gameplay.domain === "foot",
      );
      const remains = snapshot?.remains?.find((row) => row.handle === targetHandle),
        clearing = builders();
      const friendly = snapshot?.entities.find(
        (entity) =>
          entity.handle === targetHandle &&
          entity.force === options.force &&
          definitions.get(entity.definition)?.gameplay.kind === "structure",
      );
      const repairers = clearing.filter(
        (entity) => definitions.get(entity.definition)?.gameplay.repair,
      );
      if (friendly?.constructionSite && clearing.length)
        void issue("economy.assistConstruction", {
          entity: friendly.handle,
          builders: clearing.map((entity) => entity.handle),
        });
      else if (friendly && friendly.health < friendly.maxHealth && repairers.length)
        void issue("economy.repair", {
          entity: friendly.handle,
          builders: repairers.map((entity) => entity.handle),
        });
      else if (remains && clearing.length)
        void issue("economy.salvage", {
          entity: remains.handle,
          builders: clearing.map((entity) => entity.handle),
        });
      else if (transport && infantry.length)
        void issue("unit.load", {
          entity: transport.handle,
          entities: infantry.map((entity) => entity.handle),
        });
      else if (
        enemy &&
        selected.some((entity) => definitions.get(entity.definition)?.gameplay.weapons.length)
      )
        void issue("unit.attack", {
          entities: selected
            .filter((entity) => definitions.get(entity.definition)?.gameplay.weapons.length)
            .map((entity) => entity.handle),
          entity: enemy.handle,
        });
      else {
        const cell = options.pickCell(event.clientX, event.clientY);
        if (cell)
          void issue("unit.move", {
            entities: selected.map((entity) => entity.handle),
            x: cell.x * 1024 + 512,
            y: cell.y * 1024 + 512,
          });
      }
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerleave",
    () => {
      pointer = undefined;
      previewKey = "";
      options.preview(null);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointercancel",
    () => {
      right = undefined;
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      right = undefined;
      cancel();
    },
    { signal },
  );
  canvas.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.metaKey) return;
      for (const index of CONTROL_GROUPS) {
        const operation = (["select", "set", "add"] as const).find((operation) =>
          bound(`group.${operation}.${index}`, event),
        );
        if (operation) {
          event.preventDefault();
          cancel();
          if (operation === "select") options.select(groups.get(index));
          else
            groups.set(
              index,
              own().map((entity) => entity.handle),
              operation === "add",
            );
          update();
          return;
        }
      }
      if (event.code === "Escape" && !event.ctrlKey && !event.altKey) {
        const cancelled = cancel();
        if (cancelled || options.selection().length > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!cancelled) options.select([]);
          update();
          return;
        }
      }
      const index = COMMAND_ACTIONS.findIndex((action) => bound(action, event));
      for (const [action, control] of [
        ["unload", unloadButton],
        ["hold", holdButton],
        ["load", loadButton],
        ["deploy", deployButton],
        ["salvage", salvageButton],
        ["surge", surgeButton],
      ] as const)
        if (bound(action, event)) {
          event.preventDefault();
          control.click();
          return;
        }
      if (index >= 0) {
        event.preventDefault();
        activate(index);
      }
      if (bound("idleBuilder", event)) {
        event.preventDefault();
        get<HTMLButtonElement>("[data-idle-builder]").click();
      }
      if (bound("idleProducer", event)) {
        event.preventDefault();
        get<HTMLButtonElement>("[data-idle-producer]").click();
      }
    },
    { signal },
  );
  function update() {
    if (!snapshot || signal.aborted) return;
    const selected = selectedEntities(snapshot, options.selection()),
      owned = own();
    const selectedUnits = units(),
      selectedBuilders = builders();
    const queuedOwner = own()[0];
    orderPanel.hidden = !queuedOwner?.queuedOrders?.length && !queuedOwner?.orderFailure;
    const orderKey = JSON.stringify([
      queuedOwner?.handle,
      queuedOwner?.queuedOrders,
      queuedOwner?.orderFailure,
    ]);
    if (ordersKey !== orderKey) {
      ordersKey = orderKey;
      orderPanel.replaceChildren();
      const hint = document.createElement("p");
      hint.textContent = text("ui.hud.shift-queue");
      orderPanel.append(hint);
      for (const [index, queued] of (queuedOwner?.queuedOrders ?? []).entries()) {
        const row = document.createElement("div");
        row.textContent = `${index + 1} · ${commandLabel(queued.type)}${queued.x === undefined ? "" : ` (${Math.floor(queued.x / 1024)}, ${Math.floor((queued.y ?? 0) / 1024)})`}${queued.reason ? ` · ${refusal(queued.reason)}` : ""}`;
        button(
          text("ui.hud.remove-order"),
          () => {
            void issue("unit.cancelQueued", { item: queued.handle });
          },
          row,
          text("ui.hud.waypoint-remove-help"),
        );
        if (queued.x !== undefined)
          button(
            text("ui.hud.edit-waypoint"),
            () =>
              arm({
                type: "unit.editQueued",
                handles: [queued.handle],
                grid: queued.type === "economy.build",
              }),
            row,
            text("ui.hud.waypoint-drag-help"),
          );
        orderPanel.append(row);
      }
      if (queuedOwner?.orderFailure) {
        const failure = document.createElement("p");
        failure.setAttribute("role", "status");
        failure.textContent = text("ui.hud.queued-refused", {
          reason: refusal(queuedOwner.orderFailure.reason),
        });
        orderPanel.append(failure);
      }
    }
    holdButton.disabled = busy || options.paused() || !selectedUnits.length;
    holdButton.dataset.available = String(selectedUnits.length > 0);
    holdButton.setAttribute(
      "aria-pressed",
      String(selectedUnits.length > 0 && selectedUnits.every((entity) => entity.holdPosition)),
    );
    loadButton.hidden = !selectedUnits.some(
      (entity) => definitions.get(entity.definition)?.gameplay.domain === "foot",
    );
    loadButton.disabled = busy || options.paused();
    const transports = selectedUnits.filter((entity) => entity.cargo);
    unloadButton.hidden = !transports.length;
    unloadButton.disabled =
      busy ||
      options.paused() ||
      transports.length !== 1 ||
      !transports[0]?.cargo?.passengers.length;
    const structure = owned.find(
      (entity) => definitions.get(entity.definition)?.gameplay.kind === "structure",
    );
    const definition = structure && definitions.get(structure.definition)?.gameplay;
    summary.textContent = text("ui.match.selection", { count: selected.length });
    const forces = [...new Set(selected.map((entity) => entity.force))];
    const identities = forces.map(
      (force) =>
        options.forceIdentity?.(force) ?? {
          label: force === options.force ? text("ui.hud.your-force") : text("ui.hud.other-force"),
          color: "#ddc382",
        },
    );
    summary.dataset.owner = identities.map((identity) => identity.label).join(" / ");
    summary.dataset.color = identities.length === 1 ? identities[0]!.color : "#ddc382";
    summary.dataset.count = String(selected.length);
    summary.dataset.name =
      selected.length && selected.every((entity) => entity.definition === selected[0]!.definition)
        ? name(selected[0]!.definition)
        : text("ui.hud.selection");
    const portrait = get<HTMLImageElement>("[data-portrait]");
    const portraitUrl = selected[0] && definitions.get(selected[0].definition)?.icon;
    portrait.hidden = !portraitUrl;
    if (portraitUrl && portrait.getAttribute("src") !== portraitUrl) portrait.src = portraitUrl;
    const health = get<HTMLProgressElement>("[data-health]");
    health.hidden = !selected.length;
    health.max = Math.max(
      1,
      selected.reduce((sum, entity) => sum + entity.maxHealth, 0),
    );
    health.value = selected.reduce((sum, entity) => sum + entity.health, 0);
    const nextSelectionKey = JSON.stringify(
      selected.map((entity) => [entity.handle, entity.definition]),
    );
    if (selectionKey !== nextSelectionKey) {
      selectionKey = nextSelectionKey;
      types.replaceChildren();
      const kinds = [...new Set(selected.map((entity) => entity.definition))];
      for (const id of kinds) {
        const kind = button(
          text("ui.hud.type-count", {
            name: name(id),
            count: selected.filter((entity) => entity.definition === id).length,
          }),
          () => {
            options.select(
              selected.filter((entity) => entity.definition === id).map((entity) => entity.handle),
            );
            update();
          },
          types,
        );
        kind.dataset.count = String(selected.filter((entity) => entity.definition === id).length);
        const icon = definitions.get(id)?.icon;
        if (icon) {
          const image = document.createElement("img");
          image.src = icon;
          image.alt = "";
          image.width = 32;
          image.height = 32;
          kind.prepend(image);
        }
      }
    }
    const lines = selected.slice(0, 8).map((entity) => describe(entity));
    details.textContent = lines.join("\n") || text("ui.hud.select-help");
    const disabled = busy || options.paused();
    const surgeProvider = owned.find((entity) => entity.productionSurge);
    const surge = surgeProvider?.productionSurge;
    const surgeDefinition =
      surgeProvider && definitions.get(surgeProvider.definition)?.gameplay.productionSurge;
    const surgeName =
      surgeProvider &&
      definitions
        .get(surgeProvider.definition)
        ?.gameplay.abilities.find((ability) => ability.id === surge?.id)?.name;
    for (const [control, action, label] of [
      [unloadButton, "unload", "ui.hud.unload"],
      [holdButton, "hold", "ui.hud.hold"],
      [loadButton, "load", "ui.hud.load"],
      [deployButton, "deploy", "ui.hud.deploy-toggle"],
      [salvageButton, "salvage", "ui.hud.clear-remains"],
      [surgeButton, "surge", "ui.hud.surge"],
    ] as const)
      hint(control, action, control === surgeButton ? (surgeName ?? text(label)) : text(label));
    const surgeBank = snapshot.banks?.find((bank) => bank.force === options.force)?.resources;
    const funded =
      !surgeBank ||
      Object.entries(surgeDefinition?.cost ?? {}).every(
        ([resource, amount]) =>
          (surgeBank[resource as keyof typeof surgeBank] ?? 0) >= (amount ?? 0),
      );
    const surgeWait = surge
      ? Math.max(0, surge.until - snapshot.tick, surge.readyAt - snapshot.tick)
      : 0;
    surgeButton.hidden = !surge;
    surgeButton.disabled =
      disabled ||
      !surge ||
      surgeWait > 0 ||
      !funded ||
      !!surgeProvider?.constructionSite ||
      !!surgeProvider?.disabled ||
      surgeProvider?.power?.powered === false;
    surgeButton.setAttribute("aria-pressed", String(!!surge && surge.until > snapshot.tick));
    surgeButton.title = surgeWait
      ? text("ui.hud.deploy-cooldown", { seconds: Math.ceil(surgeWait / 20) })
      : `${surgeName ?? text("ui.hud.surge")} · ${costText(surgeDefinition?.cost ?? {})}`;
    const deployments = selectedUnits.filter(
      (entity) => definitions.get(entity.definition)?.gameplay.deployMode,
    );
    const cooldown = Math.max(
      0,
      ...deployments.map((entity) => (entity.deploy?.readyAt ?? 0) - (snapshot?.tick ?? 0)),
    );
    deployButton.hidden = deployments.length === 0;
    deployButton.disabled =
      disabled ||
      cooldown > 0 ||
      deployments.some((entity) => entity.deploy?.readyAt === undefined);
    deployButton.setAttribute(
      "aria-pressed",
      String(deployments.length > 0 && deployments.every((entity) => entity.deploy?.active)),
    );
    deployButton.title =
      cooldown > 0
        ? text("ui.hud.deploy-cooldown", { seconds: Math.ceil(cooldown / 20) })
        : text("ui.hud.deploy-toggle");
    salvageButton.hidden = !selectedBuilders.length;
    salvageButton.disabled = disabled || !selectedBuilders.length;
    salvageButton.setAttribute("aria-pressed", String(mode?.type === "economy.salvage"));
    renderSites(disabled);
    const eligible = [
      selectedUnits.some(
        (entity) =>
          !entity.deploy?.active && (definitions.get(entity.definition)?.gameplay.speed ?? 0) > 0,
      ),
      selectedUnits.some((entity) => !!definitions.get(entity.definition)?.gameplay.weapons.length),
      selectedUnits.some(
        (entity) => definitions.get(entity.definition)?.gameplay.role === "harvester",
      ),
      !!structure?.production && !structure.constructionSite,
      selectedUnits.some(
        (entity) =>
          !entity.deploy?.active && (definitions.get(entity.definition)?.gameplay.speed ?? 0) > 0,
      ),
      selectedUnits.length > 0,
      selectedBuilders.length > 0 || (deployments.length > 0 && !deployButton.disabled),
      selectedBuilders.some((entity) => !!definitions.get(entity.definition)?.gameplay.repair),
      !!structure &&
        (!!structure.constructionSite ||
          snapshot.entities.some(
            (entity) =>
              entity.force === options.force && entity.repairOrder?.target === structure.handle,
          )),
      !!structure?.power && !structure.constructionSite,
      !!structure && !structure.constructionSite && !!definition?.construction,
      mode?.type === "economy.build",
    ];
    commandButtons.forEach((button, index) => {
      hint(
        button,
        COMMAND_ACTIONS[index]!,
        text(
          index === 6 && !selectedBuilders.length && deployments.length
            ? "ui.hud.deploy-toggle"
            : index === 9 && structure?.power?.enabled === false
              ? "ui.hud.power-on"
              : labels[index]!,
        ),
      );
      button.dataset.available = String(!!eligible[index]);
      button.disabled = disabled || !eligible[index];
      button.title = options.paused()
        ? text("ui.hud.resume-first")
        : !eligible[index]
          ? text("ui.hud.unavailable-selection")
          : text(labels[index] ?? "ui.hud.commands");
      const targetingTypes = [
        "unit.move",
        "unit.attack",
        "",
        "production.rally",
        "unit.attackMove",
        "",
        "economy.assistConstruction",
        "economy.repair",
      ];
      button.setAttribute(
        "aria-pressed",
        String(mode !== undefined && mode.type === targetingTypes[index]),
      );
    });
    const buildIds = selectedBuilders[0]
      ? (definitions
          .get(selectedBuilders[0].definition)
          ?.gameplay.builds.filter((id) =>
            selectedBuilders.every((entity) =>
              definitions.get(entity.definition)?.gameplay.builds.includes(id),
            ),
          ) ?? [])
      : [];
    const producing = !buildIds.length && structure?.production && !structure.constructionSite;
    const choices = (
      buildIds.length
        ? [
            ...buildIds,
            ...options.catalog
              .filter(
                (entry) =>
                  options.roster.has(entry.gameplay.id) &&
                  entry.gameplay.kind === "structure" &&
                  !entry.gameplay.construction,
              )
              .map((entry) => entry.gameplay.id),
          ]
        : producing
          ? (definition?.produces ?? [])
          : []
    ).filter(
      (id) =>
        options.roster.has(id) ||
        (id.startsWith("core.structure:neutral/") &&
          definitions.get(id)?.gameplay.role === "extractor"),
    );
    get("[data-build-title]").textContent = text(producing ? "ui.hud.production" : "ui.hud.build");
    const nextMenuKey = JSON.stringify([
      choices,
      structure?.handle,
      selectedBuilders.map((entity) => entity.handle),
    ]);
    if (nextMenuKey !== menuKey) {
      closeRecipe();
      menuKey = nextMenuKey;
      menu.replaceChildren();
      for (const id of choices) {
        const entry = definitions.get(id);
        if (!entry) continue;
        const item = button(
          entry.name,
          () => {
            if (item.getAttribute("aria-disabled") === "true") {
              inspectRecipe(item);
              return;
            }
            if (producing && structure)
              void issue("production.enqueue", { entity: structure.handle, definition: id });
            else
              arm({
                type: "economy.build",
                definition: id,
                handles: selectedBuilders.map((entity) => entity.handle),
                rotation: 0,
              });
          },
          menu,
        );
        item.dataset.definition = id;
        item.setAttribute("aria-label", entry.name);
        const explanation = document.createElement("span");
        explanation.hidden = true;
        explanation.dataset.recipeDescription = "";
        explanation.id = `${recipeInfo.id}-${menu.childElementCount}`;
        item.setAttribute("aria-describedby", explanation.id);
        item.addEventListener("pointerenter", () => inspectRecipe(item), { signal });
        item.addEventListener(
          "pointerleave",
          () => {
            if (document.activeElement !== item) closeRecipe();
          },
          { signal },
        );
        item.addEventListener("focus", () => inspectRecipe(item), { signal });
        item.addEventListener("blur", closeRecipe, { signal });
        item.addEventListener(
          "keydown",
          (event) => {
            if (event.key === "Escape" && !recipeInfo.hidden) {
              event.preventDefault();
              event.stopPropagation();
              closeRecipe();
            }
          },
          { signal },
        );
        item.className = "hud-recipe";
        if (entry.icon) {
          const image = document.createElement("img");
          image.src = entry.icon;
          image.alt = "";
          image.width = 40;
          image.height = 40;
          item.prepend(image);
        }
        const price = document.createElement("small");
        price.setAttribute("aria-hidden", "true");
        const recipe = entry.gameplay.construction;
        if (recipe) {
          const resourceIcons: Record<string, HudIcon> = {
            credits: "credits",
            materials: "materials",
            "industrial-capacity": "surge",
            "salvage-points": "salvage",
          };
          for (const [resource, amount] of Object.entries(recipe.cost)) {
            const token = document.createElement("span");
            token.append(hudIcon(resourceIcons[resource] ?? "materials"), String(amount));
            price.append(token);
          }
          const time = document.createElement("span");
          time.append(
            hudIcon("clock"),
            text("ui.hud.seconds", { seconds: recipe.buildTicks / 20 }),
          );
          price.append(time);
        } else price.textContent = "—";
        item.append(price, explanation);
      }
      if (!choices.length) menu.textContent = text("ui.hud.no-build-selection");
    }
    for (const item of menu.querySelectorAll<HTMLButtonElement>("button[data-definition]")) {
      const entry = definitions.get(item.dataset.definition ?? "");
      if (!entry) continue;
      const lock = recipeLock(entry.gameplay, snapshot, options.force),
        funds = affordable(entry.gameplay, snapshot, options.force);
      const full =
        !!producing && (structure?.production?.queue.filter((item) => !item.gift).length ?? 0) >= 5;
      const reason =
        lock === "unpriced"
          ? text("ui.hud.unpriced")
          : lock === "requirements"
            ? text("ui.hud.requires", { names: entry.gameplay.requires.map(name).join(", ") })
            : full
              ? text("ui.hud.queue-full")
              : !funds
                ? text(producing ? "ui.hud.wait-funds" : "ui.hud.no-funds")
                : "";
      const recipe = recipeText(entry.gameplay);
      item.title = `${entry.description}\n${recipe}${reason && reason !== recipe ? `\n${reason}` : ""}`;
      // Keep unavailable recipes focusable so keyboard/touch players can inspect the reason.
      item.setAttribute(
        "aria-disabled",
        String(disabled || !!lock || full || (!producing && !funds)),
      );
      item.dataset.recipeInfo = `${entry.name}\n${item.title}`;
      const explanation = item.querySelector("[data-recipe-description]");
      if (explanation) setText(explanation, item.dataset.recipeInfo);
      if (inspectedRecipe === item) setText(recipeInfo, item.dataset.recipeInfo);
    }
    const nextAdviceKey = JSON.stringify([producing, definition?.id, structure?.production?.rally]);
    if (nextAdviceKey !== adviceKey) {
      adviceKey = nextAdviceKey;
      advice.textContent = producing
        ? text("ui.hud.production-help", { slots: structure.production?.slots ?? 1 }) +
          (structure.production?.rally
            ? ` ${text("ui.hud.rally-cell", { x: Math.floor(structure.production.rally.x / 1024), y: Math.floor(structure.production.rally.y / 1024) })}`
            : "")
        : text("ui.hud.placement-help");
    }
    const items = structure?.production?.queue ?? [];
    const nextQueueKey = items.map((item) => item.handle).join(",");
    if (nextQueueKey !== queueKey) {
      queueKey = nextQueueKey;
      queue.replaceChildren();
      for (const item of items) {
        const li = document.createElement("li"),
          status = document.createElement("span");
        li.dataset.item = item.handle;
        li.append(status);
        if (!item.gift) {
          const cancelButton = button(
            text("ui.hud.cancel-item"),
            () => void issue("production.cancel", { item: item.handle }),
            li,
          );
          cancelButton.dataset.cancel = item.handle;
        }
        queue.append(li);
      }
    }
    for (const [index, item] of items.entries()) {
      const li = queue.children[index];
      if (!li) continue;
      const completed = item.totalTicks
        ? Math.floor(((item.completedTicks + item.remainder / 1000) * 100) / item.totalTicks)
        : 100;
      if (li instanceof HTMLElement) {
        li.dataset.definition = item.definition;
        li.dataset.progress = String(completed);
      }
      const span = li.querySelector("span");
      if (span)
        span.textContent = text("ui.hud.queue-item", {
          name: name(item.definition),
          slot: item.slot ?? text("ui.hud.waiting"),
          progress: completed,
          state: workState(item.state),
          gift: item.gift ? text("ui.hud.included") : "",
        });
      const button = li.querySelector("button");
      if (button) button.disabled = disabled;
    }
    groups.prune(
      new Set(
        snapshot.entities
          .filter((entity) => entity.force === options.force && entity.health > 0)
          .map((entity) => entity.handle),
      ),
    );
    groupButtons.forEach((button, i) => {
      const group = CONTROL_GROUPS[i]!;
      setText(button, `${group}: ${groups.get(group).length}`);
      button.dataset.count = String(groups.get(group).length);
      button.disabled = groups.get(group).length === 0;
      button.title = text("ui.hud.select-group", { group });
      button.dataset.hotkey = bindings()[`group.select.${group}`][0]
        ? chordText(bindings()[`group.select.${group}`][0]!)
        : "";
      button.title += ` · ${bindingText(bindings(), `group.select.${group}`)}`;
    });
    get<HTMLButtonElement>("[data-set-group]").disabled = !owned.length;
    get<HTMLButtonElement>("[data-add-group]").disabled = !owned.length;
    for (const producer of [false, true]) {
      const button = get<HTMLButtonElement>(
        producer ? "[data-idle-producer]" : "[data-idle-builder]",
      );
      const count = idle(producer).length;
      setText(
        button,
        text(producer ? "ui.hud.idle-production" : "ui.hud.idle-builders", {
          count,
          key: bindingText(bindings(), producer ? "idleProducer" : "idleBuilder"),
        }),
      );
      button.disabled = count === 0;
    }
    const population = snapshot.entities
      .filter((entity) => entity.force === options.force && entity.health > 0)
      .reduce((sum, entity) => sum + (definitions.get(entity.definition)?.gameplay.pop ?? 0), 0);
    const populationLabel = root.querySelector("[data-population]");
    if (populationLabel)
      setText(
        populationLabel.querySelector("[data-stat-text]") ?? populationLabel,
        text("ui.hud.population", {
          value: population,
          cap: options.populationCap,
        }),
      );
    renderRequests();
    options.present?.();
  }
  let requestKey = "";
  let siteKey = "";
  function renderSites(disabled: boolean) {
    const current =
      snapshot?.entities.filter(
        (entity) => entity.force === options.force && entity.constructionSite,
      ) ?? [];
    const next = current.map((entity) => entity.handle).join(",");
    if (next !== siteKey) {
      siteKey = next;
      sites.replaceChildren();
      for (const entity of current) {
        const row = document.createElement("div"),
          status = document.createElement("p");
        row.dataset.site = entity.handle;
        button(
          text("ui.hud.select-site", { name: name(entity.definition) }),
          () => {
            cancel();
            options.select([entity.handle]);
            update();
          },
          row,
        );
        row.append(status);
        const assist = button(
          text("ui.hud.assist"),
          () => {
            cancel();
            void issue("economy.assistConstruction", {
              entity: entity.handle,
              builders: builders().map((builder) => builder.handle),
            });
          },
          row,
        );
        assist.dataset.assistSite = "";
        const cancelSite = button(
          text("ui.hud.cancel-site"),
          () => {
            cancel();
            void issue("economy.cancelConstruction", { entity: entity.handle });
          },
          row,
        );
        cancelSite.dataset.cancelSite = "";
        sites.append(row);
      }
    }
    for (const [index, entity] of current.entries()) {
      const row = sites.children[index];
      if (!row) continue;
      const status = row.querySelector("p"),
        work = entity.construction;
      if (status)
        status.textContent = text("ui.hud.construction", {
          progress: work?.totalTicks
            ? Math.floor(((work.completedTicks + work.quarter / 4) * 100) / work.totalTicks)
            : 0,
          count: work?.buildersWorking ?? 0,
        });
      const assist = row.querySelector<HTMLButtonElement>("[data-assist-site]");
      if (assist) assist.disabled = disabled || builders().length === 0;
      const cancelSite = row.querySelector<HTMLButtonElement>("[data-cancel-site]");
      if (cancelSite) cancelSite.disabled = disabled;
    }
  }
  function renderRequests() {
    const pending =
      snapshot?.constructionRequests?.filter((request) => request.force === options.force) ?? [];
    const next = JSON.stringify(pending);
    if (next === requestKey) {
      for (const button of requests.querySelectorAll("button"))
        button.disabled = busy || options.paused();
      return;
    }
    requestKey = next;
    requests.replaceChildren();
    for (const request of pending) {
      const row = document.createElement("p");
      row.textContent = text(
        request.status === "clearing" ? "ui.hud.clearance" : "ui.hud.placement-refused",
        { name: name(request.definition), reason: refusal(request.reason) },
      );
      const remove = button(
        text(request.status === "clearing" ? "ui.hud.cancel-placement" : "ui.hud.dismiss"),
        () => void issue("economy.cancelConstruction", { entity: request.handle }),
        row,
      );
      remove.disabled = busy || options.paused();
      requests.append(row);
    }
  }
  function describe(entity: PresentedEntity) {
    const lines = [
      text("ui.hud.health", {
        name: name(entity.definition),
        current: entity.health,
        max: entity.maxHealth,
      }),
    ];
    if (entity.force !== options.force) lines.push(text("ui.hud.other-force"));
    if (entity.disabled) lines.push(text("ui.hud.emp-disabled"));
    if (entity.burning) lines.push(text("ui.hud.burning"));
    if (entity.slowed) lines.push(text("ui.hud.slowed"));
    if (entity.veterancy) {
      lines.push(
        text("ui.hud.veterancy", {
          rank: entity.veterancy.rank,
        }),
      );
      if (entity.veterancy.xp !== undefined && entity.veterancy.nextXp !== undefined)
        lines.push(
          text("ui.hud.xp", {
            current: Math.floor(entity.veterancy.xp / 1024),
            next: Math.floor(entity.veterancy.nextXp / 1024),
          }),
        );
    }
    if (entity.productionSurge && entity.productionSurge.until > (snapshot?.tick ?? 0))
      lines.push(
        text("ui.hud.surge-active", {
          seconds: Math.ceil((entity.productionSurge.until - (snapshot?.tick ?? 0)) / 20),
          percent: Math.floor((entity.productionSurge.perMille - 1000) / 10),
        }),
      );
    const definition = definitions.get(entity.definition)?.gameplay;
    if (entity.cargo)
      lines.push(
        text("ui.hud.transport-cargo", {
          count: entity.cargo.passengers.length,
          capacity: entity.cargo.capacity,
          boarding: entity.cargo.boarding,
        }) +
          (entity.cargo.firing ? ` · ${text("ui.hud.passenger-fire")}` : "") +
          entity.cargo.passengers
            .map(
              (passenger) =>
                ` · ${name(passenger.definition)} ${passenger.health}/${passenger.maxHealth}`,
            )
            .join(""),
      );
    const deployed = entity.deploy?.active ? definition?.deployMode : undefined;
    if (entity.deploy)
      lines.push(
        text(entity.deploy.active ? "ui.hud.deployed" : "ui.hud.packed", {
          name:
            definition?.abilities.find((ability) => ability.id === entity.deploy?.id)?.name ??
            entity.deploy.id,
        }),
      );
    if (definition?.armor) lines.push(text("ui.hud.armor", { value: definition.armor }));
    if (definition?.weapons.length)
      lines.push(
        text("ui.hud.weapon-stats", {
          range: definition.weapons
            .map(
              (weapon) =>
                `${weapon.rangeSubcells[0] / 1024}–${(deployed ? Math.floor((weapon.rangeSubcells[1] * deployed.rangePerMille) / 1000) + deployed.rangeBonusSubcells : weapon.rangeSubcells[1]) / 1024}`,
            )
            .join(", "),
          reload: definition.weapons.map((weapon) => weapon.reloadTicks / 20).join(", "),
        }),
      );
    if (entity.construction)
      lines.push(
        text("ui.hud.construction", {
          progress: entity.construction.totalTicks
            ? Math.floor(
                ((entity.construction.completedTicks + entity.construction.quarter / 4) * 100) /
                  entity.construction.totalTicks,
              )
            : 0,
          count: entity.construction.buildersWorking,
        }),
      );
    if (entity.constructionOrder)
      lines.push(
        text("ui.hud.builder-state", { state: workState(entity.constructionOrder.state) }),
      );
    if (entity.repairOrder)
      lines.push(text("ui.hud.repair-state", { state: workState(entity.repairOrder.state) }));
    if (entity.holdPosition) lines.push(text("ui.hud.holding"));
    if (entity.salvageOrder)
      lines.push(text("ui.hud.salvage-state", { state: workState(entity.salvageOrder.state) }));
    if (entity.harvesting)
      lines.push(
        text("ui.hud.cargo", {
          value: entity.harvesting.cargo,
          capacity: entity.harvesting.capacity,
          state: workState(entity.harvesting.status),
        }),
      );
    if (entity.extraction)
      lines.push(
        text("ui.hud.extraction", {
          value: entity.extraction.remaining ?? "—",
          state: workState(entity.extraction.status),
        }),
      );
    if (entity.power && !entity.disabled && !entity.constructionSite)
      lines.push(
        text(
          entity.power.enabled
            ? entity.power.powered
              ? "ui.hud.powered"
              : "ui.hud.brownout"
            : "ui.hud.disabled",
        ),
      );
    if (entity.power)
      lines.push(
        text("ui.hud.power-amount", {
          value:
            entity.power.enabled && !entity.disabled && !entity.constructionSite
              ? entity.power.amount
              : 0,
        }),
      );
    if (entity.power?.sources?.length && entity.power.baseAmount !== undefined)
      lines.push(
        text("ui.hud.power-adjacency", {
          base: entity.power.baseAmount,
          sources: entity.power.sources
            .map((handle) => {
              const source = snapshot?.entities.find((candidate) => candidate.handle === handle);
              return source
                ? `${name(source.definition)} (${Math.floor(source.x / 1024)}, ${Math.floor(source.y / 1024)})`
                : text("ui.hud.selection");
            })
            .join(", "),
        }),
      );
    if (entity.order)
      lines.push(text(entity.order.type === "move" ? "ui.hud.moving" : "ui.hud.attacking"));
    if (entity.attackTarget) lines.push(text("ui.hud.attacking"));
    const unsupported =
      definition?.abilities.some(
        (ability) =>
          ability.id !== definition.deployMode?.id && ability.id !== definition.productionSurge?.id,
      ) || definition?.research.length;
    if (unsupported) lines.push(text("ui.hud.abilities-unavailable"));
    return lines.join(" · ");
  }
  signal.addEventListener(
    "abort",
    () => {
      delete canvas.dataset.commandMode;
      options.preview(null);
      section.remove();
    },
    { once: true },
  );
  return {
    update(state?: OfflineState) {
      if (state) snapshot = state.snapshot;
      update();
    },
    targeting: () => mode !== undefined,
    waypointReady: () => !busy && !mode && !options.paused(),
    async changeWaypoint(handle: string, cell?: Point) {
      if (busy || mode || options.paused()) return;
      const item = own()
        .flatMap((entity) => entity.queuedOrders ?? [])
        .find((item) => item.handle === handle);
      if (!item || (cell && (item.x === undefined || item.y === undefined))) return;
      const offset = item.type === "economy.build" ? 0 : 512;
      await issue(
        cell ? "unit.editQueued" : "unit.cancelQueued",
        {
          item: handle,
          ...(cell && { x: cell.x * 1024 + offset, y: cell.y * 1024 + offset }),
        },
        false,
      );
    },
    cancel,
    frame: preview,
    armAttackMove: () => activate(4),
    /** Minimap points share normal selection filtering, busy state, payment/grant authority and refusals. */
    orderPoint(point: Point, attackMove = false) {
      if (busy) return;
      if (options.paused()) {
        feedback("ui.hud.resume-first");
        return;
      }
      if (mode && mode.type !== "unit.move" && mode.type !== "unit.attackMove") {
        cancel();
        return;
      }
      const type = attackMove || mode?.type === "unit.attackMove" ? "unit.attackMove" : "unit.move";
      const append = mode?.append || shiftHeld;
      const handles = units()
        .filter((entity) => (definitions.get(entity.definition)?.gameplay.speed ?? 0) > 0)
        .map((entity) => entity.handle);
      cancel();
      if (!handles.length) {
        feedback("ui.match.select-first");
        return;
      }
      void issue(
        type,
        { entities: handles, x: point.x * 1024 + 512, y: point.y * 1024 + 512 },
        append,
      );
    },
  };
}

function recipeText(definition: GameplayDefinition) {
  if (!definition.construction) return text("ui.hud.unpriced");
  return text("ui.hud.recipe", {
    cost: costText(definition.construction.cost),
    seconds: definition.construction.buildTicks / 20,
  });
}

function costText(amounts: Readonly<Partial<Record<string, number>>>) {
  const resources = {
    credits: "ui.hud.credits",
    materials: "ui.hud.materials",
    "industrial-capacity": "ui.hud.industrial",
    "salvage-points": "ui.hud.salvage",
  } as const;
  return Object.entries(amounts)
    .map(
      ([key, amount]) =>
        `${amount} ${key in resources ? text(resources[key as keyof typeof resources]) : key}`,
    )
    .join(", ");
}

function refusal(value: unknown) {
  const reasons = {
    unload_blocked: "ui.hud.unload-blocked",
    order_queue_full: "ui.hud.order-queue-full",
    transport_full: "ui.hud.transport-full",
    cooldown: "ui.hud.deploy-not-ready",
    immobile: "ui.hud.deploy-immobile",
    bad_payload: "ui.hud.refusal-payload",
    no_grant: "ui.hud.refusal-grant",
    insufficient_funds: "ui.hud.no-funds",
    placement_failed: "ui.hud.refusal-placement",
    clearance_timeout: "ui.hud.refusal-clearance",
    structure_cap: "ui.hud.refusal-cap",
    queue_full: "ui.hud.queue-full",
  } as const;
  return typeof value === "string" && value in reasons
    ? text(reasons[value as keyof typeof reasons])
    : text("ui.hud.refusal-other");
}

export function workState(value: string) {
  const states = {
    approaching: "ui.hud.state-approaching",
    working: "ui.hud.state-working",
    blocked: "ui.hud.state-blocked",
    funds: "ui.hud.state-funds",
    grant: "ui.hud.state-grant",
    contested: "ui.hud.state-contested",
    storage: "ui.hud.state-storage",
    queued: "ui.hud.state-queued",
    active: "ui.hud.state-working",
    brownout: "ui.hud.brownout",
    disabled: "ui.hud.disabled",
    population: "ui.hud.state-population",
    requirements: "ui.hud.state-requirements",
    exit: "ui.hud.state-exit",
    refund: "ui.hud.state-refund",
    idle: "ui.hud.state-idle",
    travel_ore: "ui.hud.state-ore",
    mining: "ui.hud.state-mining",
    no_ore: "ui.hud.state-no-ore",
    travel_dock: "ui.hud.state-dock",
    unloading: "ui.hud.state-unload",
    no_dropoff: "ui.hud.state-no-dropoff",
    bank_full: "ui.hud.state-bank",
    extracting: "ui.hud.state-working",
    depleted: "ui.hud.state-depleted",
    constructing: "ui.hud.state-constructing",
    claimed: "ui.hud.state-claimed",
    invalid_node: "ui.hud.state-node",
  } as const;
  return value in states ? text(states[value as keyof typeof states]) : value;
}
