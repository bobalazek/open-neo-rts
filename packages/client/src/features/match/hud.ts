import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { type MatchResource, resourceNodeOrigin, resourceOccupies } from "@open-neo-rts/sim/maps";
import { text } from "../../shared";
import type { OfflineState } from "../../worker";
import { createControlGroups } from "./groups";
import {
  affordable,
  footprintCells,
  type HudDefinition,
  idleBuilder,
  recipeLock,
  selectedEntities,
} from "./hud-model";

type Point = { x: number; y: number };
type Mode =
  | {
      type:
        | "unit.move"
        | "unit.attackMove"
        | "unit.attack"
        | "economy.assistConstruction"
        | "economy.repair"
        | "production.rally";
      handles: string[];
    }
  | { type: "economy.build"; handles: string[]; definition: string; rotation: number };
type Options = {
  catalog: readonly HudDefinition[];
  roster: ReadonlySet<string>;
  resources: readonly MatchResource[];
  force: number;
  populationCap: number;
  selection: () => string[];
  select: (handles: readonly string[]) => void;
  pick: (x: number, y: number) => string | null;
  pickCell: (x: number, y: number) => Point | null;
  command: (type: string, payload: unknown) => Promise<unknown>;
  preview: (cells: readonly Point[] | null) => void;
  paused: () => boolean;
  fail: (error: unknown) => void;
};

/** Normal command panels consume permitted copies only; every mutation travels through the worker. */
export function createMatchHud(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  options: Options,
  signal: AbortSignal,
) {
  const definitions = new Map(options.catalog.map((entry) => [entry.gameplay.id, entry]));
  const groups = createControlGroups();
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
  const section = document.createElement("section");
  section.className = "match-hud";
  section.setAttribute("aria-label", text("ui.hud.title"));
  section.innerHTML = `<div class="hud-feedback"><p data-mode role="status" aria-live="polite"></p><p data-result role="status" aria-live="polite"></p><div data-requests></div></div><nav class="hud-panel-tabs" aria-label="${text("ui.hud.panels")}" data-panel-tabs></nav><div class="hud-panels"><section class="hud-selection"><h2>${text("ui.hud.selection")}</h2><p data-summary></p><div data-types class="hud-types"></div><div data-details></div></section><section class="hud-command-panel"><h2>${text("ui.hud.commands")}</h2><div class="hud-command-grid" data-commands></div></section><section class="hud-build-panel"><h2 data-build-title>${text("ui.hud.build")}</h2><ol class="hud-queue" data-queue></ol><div class="hud-catalog" data-catalog></div><p data-advice></p></section></div><div class="hud-groups"><span>${text("ui.hud.groups")}</span><div data-groups></div><label>${text("ui.hud.group")}<select data-group-index>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<option>${n}</option>`).join("")}</select></label><button type="button" data-set-group>${text("ui.hud.set-group")}</button><button type="button" data-add-group>${text("ui.hud.add-group")}</button><button type="button" data-idle-builder></button><button type="button" data-idle-producer></button></div>`;
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
  sites.className = "hud-sites";
  sites.setAttribute("aria-label", text("ui.hud.sites"));
  menu.before(sites);
  const modeLabel = get("[data-mode]"),
    resultLabel = get("[data-result]"),
    requests = get("[data-requests]");
  const groupIndex = get<HTMLSelectElement>("[data-group-index]");
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
  const tabs = ["selection", "commands", "build"] as const;
  const panelButtons = tabs.map((panel) =>
    button(
      text(
        panel === "selection"
          ? "ui.hud.selection"
          : panel === "commands"
            ? "ui.hud.commands"
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
    mode = next;
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
  async function issue(type: string, payload: unknown) {
    if (busy) return;
    if (options.paused()) {
      feedback("ui.hud.resume-first");
      return;
    }
    busy = true;
    update();
    try {
      const result = await options.command(type, payload);
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
  function commandLabel(type: Mode["type"]) {
    const labels = {
      "unit.move": "ui.hud.move",
      "unit.attackMove": "ui.hud.attack-move",
      "unit.attack": "ui.hud.attack",
      "economy.assistConstruction": "ui.hud.assist",
      "economy.repair": "ui.hud.repair",
      "production.rally": "ui.hud.rally",
      "economy.build": "ui.hud.build",
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
  const groupButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((index) =>
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
    if (!cell) {
      feedback("ui.orders.outside");
      return;
    }
    const point = { x: cell.x * 1024 + 512, y: cell.y * 1024 + 512 };
    if (active.type === "economy.build") {
      const definition = definitions.get(active.definition)?.gameplay;
      const origin = definition ? placementCell(definition, cell) : cell;
      cancel();
      void issue(active.type, {
        definition: active.definition,
        builders: active.handles,
        force: options.force,
        x: origin.x * 1024,
        y: origin.y * 1024,
        facing: ((active.rotation + 1) * 0x4000) & 0xffff,
      });
    } else if (active.type === "unit.move" || active.type === "unit.attackMove") {
      cancel();
      void issue(active.type, { entities: active.handles, ...point });
    } else if (active.type === "production.rally") {
      cancel();
      void issue(active.type, { entity: active.handles[0], ...point });
    } else {
      const bounds = canvas.getBoundingClientRect(),
        handle = options.pick(x - bounds.left, y - bounds.top);
      const entity = snapshot.entities.find((entity) => entity.handle === handle);
      if (!entity) {
        feedback("ui.hud.pick-target");
        return;
      }
      if (
        active.type === "unit.attack"
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
      cancel();
      void issue(
        active.type,
        active.type === "unit.attack"
          ? { entities: active.handles, entity: handle }
          : { builders: active.handles, entity: handle },
      );
    }
  }
  canvas.addEventListener(
    "click",
    (event) => {
      if (mode && event.button === 0) target(event.clientX, event.clientY);
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button === 2)
        right = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
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
        !down ||
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
      if (!selected.length) return;
      const targetHandle = options.pick(event.clientX - bounds.left, event.clientY - bounds.top),
        enemy = snapshot?.entities.find(
          (entity) => entity.handle === targetHandle && entity.force !== options.force,
        );
      if (
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
      if (event.repeat || event.altKey || event.metaKey) return;
      if (/^Digit\d$/.test(event.code)) {
        event.preventDefault();
        const index = Number(event.code.at(-1));
        cancel();
        if (event.ctrlKey || event.shiftKey)
          groups.set(
            index,
            own().map((entity) => entity.handle),
            event.shiftKey,
          );
        else options.select(groups.get(index));
        update();
        return;
      }
      if (event.ctrlKey) return;
      if (event.code === "Escape") {
        const cancelled = cancel();
        if (cancelled || options.selection().length > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!cancelled) options.select([]);
          update();
          return;
        }
      }
      const index = keys.findIndex((key) => event.code === `Key${key}`);
      if (index >= 0) {
        event.preventDefault();
        activate(index);
      }
      if (event.code === "Period") {
        event.preventDefault();
        get<HTMLButtonElement>("[data-idle-builder]").click();
      }
      if (event.code === "Comma") {
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
    const structure = owned.find(
      (entity) => definitions.get(entity.definition)?.gameplay.kind === "structure",
    );
    const definition = structure && definitions.get(structure.definition)?.gameplay;
    summary.textContent = text("ui.match.selection", { count: selected.length });
    const nextSelectionKey = JSON.stringify(
      selected.map((entity) => [entity.handle, entity.definition]),
    );
    if (selectionKey !== nextSelectionKey) {
      selectionKey = nextSelectionKey;
      types.replaceChildren();
      const kinds = [...new Set(selected.map((entity) => entity.definition))];
      for (const id of kinds)
        button(
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
    }
    const lines = selected.slice(0, 8).map((entity) => describe(entity));
    details.textContent = lines.join("\n") || text("ui.hud.select-help");
    const disabled = busy || options.paused();
    renderSites(disabled);
    const eligible = [
      selectedUnits.some((entity) => (definitions.get(entity.definition)?.gameplay.speed ?? 0) > 0),
      selectedUnits.some((entity) => !!definitions.get(entity.definition)?.gameplay.weapons.length),
      selectedUnits.some(
        (entity) => definitions.get(entity.definition)?.gameplay.role === "harvester",
      ),
      !!structure?.production && !structure.constructionSite,
      selectedUnits.length > 0,
      selectedUnits.length > 0,
      selectedBuilders.length > 0,
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
    commandButtons[9]?.replaceChildren(
      document.createTextNode(
        `X · ${text(structure?.power?.enabled ? "ui.hud.power-off" : "ui.hud.power-on")}`,
      ),
    );
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
      menuKey = nextMenuKey;
      menu.replaceChildren();
      for (const id of choices) {
        const entry = definitions.get(id);
        if (!entry) continue;
        const item = button(
          entry.name,
          () => {
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
        item.className = "hud-recipe";
        if (entry.icon) {
          const image = document.createElement("img");
          image.src = entry.icon;
          image.alt = "";
          image.width = 40;
          image.height = 40;
          item.prepend(image);
        }
        item.append(document.createElement("small"));
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
      item.title = `${entry.description}\n${recipeText(entry.gameplay)}\n${reason}`;
      item.disabled = disabled || !!lock || full || (!producing && !funds);
      const cost = item.querySelector("small");
      const recipe = recipeText(entry.gameplay);
      if (cost) cost.textContent = `${recipe}${reason && reason !== recipe ? ` · ${reason}` : ""}`;
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
      const span = li.querySelector("span");
      if (span)
        span.textContent = text("ui.hud.queue-item", {
          name: name(item.definition),
          slot: item.slot ?? text("ui.hud.waiting"),
          progress: item.totalTicks
            ? Math.floor(((item.completedTicks + item.remainder / 1000) * 100) / item.totalTicks)
            : 100,
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
      const group = i === 9 ? 0 : i + 1;
      button.textContent = `${group}: ${groups.get(group).length}`;
      button.disabled = groups.get(group).length === 0;
      button.title = text("ui.hud.select-group", { group });
    });
    get<HTMLButtonElement>("[data-set-group]").disabled = !owned.length;
    get<HTMLButtonElement>("[data-add-group]").disabled = !owned.length;
    for (const producer of [false, true]) {
      const button = get<HTMLButtonElement>(
        producer ? "[data-idle-producer]" : "[data-idle-builder]",
      );
      const count = idle(producer).length;
      button.textContent = text(producer ? "ui.hud.idle-production" : "ui.hud.idle-builders", {
        count,
      });
      button.disabled = count === 0;
    }
    const population = snapshot.entities
      .filter((entity) => entity.force === options.force && entity.health > 0)
      .reduce((sum, entity) => sum + (definitions.get(entity.definition)?.gameplay.pop ?? 0), 0);
    const populationLabel = root.querySelector("[data-population]");
    if (populationLabel)
      populationLabel.textContent = text("ui.hud.population", {
        value: population,
        cap: options.populationCap,
      });
    renderRequests();
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
    const definition = definitions.get(entity.definition)?.gameplay;
    if (definition?.armor) lines.push(text("ui.hud.armor", { value: definition.armor }));
    if (definition?.weapons.length)
      lines.push(
        text("ui.hud.weapon-stats", {
          range: definition.weapons
            .map((weapon) => `${weapon.rangeSubcells[0] / 1024}–${weapon.rangeSubcells[1] / 1024}`)
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
    if (entity.power)
      lines.push(
        text(
          entity.power.enabled
            ? entity.power.powered
              ? "ui.hud.powered"
              : "ui.hud.brownout"
            : "ui.hud.disabled",
        ),
      );
    if (entity.order)
      lines.push(text(entity.order.type === "move" ? "ui.hud.moving" : "ui.hud.attacking"));
    if (entity.attackTarget) lines.push(text("ui.hud.attacking"));
    const unsupported = definition?.abilities.length || definition?.research.length;
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
    cancel,
    frame: preview,
  };
}

function recipeText(definition: GameplayDefinition) {
  if (!definition.construction) return text("ui.hud.unpriced");
  const resources = {
    credits: "ui.hud.credits",
    materials: "ui.hud.materials",
    "industrial-capacity": "ui.hud.industrial",
    "salvage-points": "ui.hud.salvage",
  } as const;
  const cost = Object.entries(definition.construction.cost)
    .map(
      ([key, amount]) =>
        `${amount} ${key in resources ? text(resources[key as keyof typeof resources]) : key}`,
    )
    .join(", ");
  return text("ui.hud.recipe", { cost, seconds: definition.construction.buildTicks / 20 });
}

function refusal(value: unknown) {
  const reasons = {
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

function workState(value: string) {
  const states = {
    approaching: "ui.hud.state-approaching",
    working: "ui.hud.state-working",
    blocked: "ui.hud.state-blocked",
    funds: "ui.hud.state-funds",
    grant: "ui.hud.state-grant",
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
