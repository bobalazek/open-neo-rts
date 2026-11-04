import { builtins } from "virtual:debug-builtins";
import { content } from "virtual:normal-catalog";
import {
  CELL_SIZE,
  cameraGroundView,
  type createAudioMixer,
  createMapPresentation,
  createPlacementOverlay,
  createRenderer,
  LEVEL_HEIGHT,
  resourceInstances,
} from "@open-neo-rts/render";
import { setText, text } from "../../shared";
import { createOfflineMatch, NORMAL_GAME_SPEEDS, type OfflineState } from "../../worker";
import { catalogEntry, resolveEntityModel } from "../debug/catalog";
import { createPresentationClock } from "../debug/clock";
import { mapDecorations, resolveMapModel } from "../debug/map-visuals";
import { loadMap } from "../debug/maps";
import { createInGameMenu } from "../in-game-menu";
import type { MatchExit } from "../in-game-menu/exit";
import {
  type SavedGame,
  type SaveKind,
  saveCompatibility,
  saveMapHash,
  saveStore,
  saveThumbnail,
} from "../load-game";
import { createMatchGuidance } from "../onboarding/match";
import { postMatchScreen } from "../post-match";
import { savedReplay } from "../replays/files";
import { replayStore } from "../replays/storage";
import { applyInterfaceScale, type DeviceSettings, readDeviceSettings } from "../settings";
import { BINDINGS_CHANGED, bindingText, matchesBinding, readBindings } from "../settings/bindings";
import { firstPlayableRoster } from "../skirmish/roster";
import { map, normalSkirmish, type SkirmishSetup } from "../skirmish/setup";
import { createMatchPresentation } from ".";
import { createMatchAudio } from "./audio";
import { createMatchHud } from "./hud";
import type { HudDefinition } from "./hud-model";
import { actionText, decorateAction, hudIcon } from "./icons";
import { bindSelectionInput } from "./input";
import { bindWorldInteraction } from "./interaction";
import { createMinimap } from "./minimap";
import { mountNativeMatchHud } from "./native-hud";
import { bindWaypointInput } from "./waypoints";

/** A screen owns this session immediately, including resources that finish loading after cancellation. */
export function createNormalSession(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  config: SkirmishSetup,
  progress: (stage: number) => void,
  fail: (error: unknown) => void,
  leave: () => void,
  rematch: () => void,
  home: () => void,
  persistence?: {
    saved?: SavedGame;
    load: (save: SavedGame) => Promise<void>;
    replay?: (id: string) => void;
  },
  audio?: ReturnType<typeof createAudioMixer>,
) {
  const signal = new AbortController();
  let disposed = false,
    ready = false,
    busy = false;
  let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
  let presentation: ReturnType<typeof createMatchPresentation> | undefined;
  const sounds = new Map(
    builtins.map((entry) => [`core.${(entry.raw as { id: string }).id}`, entry.sounds ?? {}]),
  );
  const matchAudio = audio && createMatchAudio(audio, sounds);
  let art: ReturnType<typeof createMapPresentation> | undefined;
  let match: ReturnType<typeof createOfflineMatch> | undefined;
  let latest: OfflineState | undefined;
  let hud: ReturnType<typeof createMatchHud> | undefined;
  let footprint: ReturnType<typeof createPlacementOverlay> | undefined;
  let resultScreen: ReturnType<typeof postMatchScreen> | undefined;
  let minimap: ReturnType<typeof createMinimap> | undefined;
  let nativeHud: ReturnType<typeof mountNativeMatchHud> | undefined;
  let interaction: ReturnType<typeof bindWorldInteraction> | undefined;
  let waypointInput: ReturnType<typeof bindWaypointInput> | undefined;
  let menu: ReturnType<typeof createInGameMenu> | undefined;
  let guidance: ReturnType<typeof createMatchGuidance> | undefined;
  let preferences = readDeviceSettings();
  let bindings = readBindings();
  window.addEventListener(
    BINDINGS_CHANGED,
    () => {
      if (disposed) return;
      bindings = readBindings();
      if (latest) {
        hud?.update(latest);
        minimap?.update(latest.snapshot);
      }
      nativeHud?.update();
    },
    { signal: signal.signal },
  );
  let resultDefinitions: { id: string; name: string; kind: string }[] = [];
  const replayUrls = new Set<string>();
  let autosave: ReturnType<typeof setInterval> | undefined,
    saving = false,
    autoSlot = 0;
  let lastSavedTick = persistence?.saved?.match.tick;
  const saveName = () =>
    `${map.name} · ${Math.floor((latest?.snapshot.tick ?? 0) / 1200)}:${String(Math.floor((latest?.snapshot.tick ?? 0) / 20) % 60).padStart(2, "0")}`;
  async function persist(kind: SaveKind, name: string) {
    if (saving) throw new Error(text("ui.saves.busy"));
    if (!match || !renderer || disposed || !content.cosmeticHash)
      throw new Error(text("ui.saves.failed"));
    saving = true;
    try {
      const snapshot = await match.exportMatchSnapshot();
      if (disposed) return;
      renderer.scene.render();
      const file: SavedGame = {
        format: 1,
        id:
          kind === "quick"
            ? "quicksave"
            : kind === "auto"
              ? `autosave-${autoSlot % 3}`
              : `manual-${crypto.randomUUID()}`,
        name,
        kind,
        createdAt: Date.now(),
        config: { ...config },
        thumbnail: saveThumbnail(canvas),
        packs: content.packs,
        cosmeticHash: content.cosmeticHash,
        mapHash: saveMapHash(snapshot),
        match: snapshot,
      };
      await saveStore.write(file);
      if (disposed) return;
      lastSavedTick = snapshot.tick;
      if (kind === "auto") autoSlot++;
      label("[data-save-notice]", text("ui.saves.saved"));
    } finally {
      saving = false;
    }
  }
  const applyPreferences = (next: DeviceSettings) => {
    if (disposed) return;
    if (next.quality !== preferences.quality) renderer?.setQuality(next.quality);
    renderer?.camera.setControls({
      panSpeed: next.cameraSpeed / 100,
      edgeScroll: next.edgeScroll,
      reducedMotion: next.reducedMotion,
    });
    preferences = next;
    applyInterfaceScale(next);
  };
  const clock = createPresentationClock();
  const release = () => {
    if (disposed) return;
    menu?.finish();
    disposed = true;
    clearInterval(autosave);
    signal.abort();
    for (const url of replayUrls) URL.revokeObjectURL(url);
    replayUrls.clear();
    resultScreen?.dispose();
    interaction?.dispose();
    nativeHud?.dispose();
    match?.dispose();
    matchAudio?.dispose();
    presentation?.dispose();
    footprint?.dispose();
    art?.dispose();
    renderer?.dispose();
    delete canvas.dataset.session;
    delete canvas.dataset.tick;
    delete canvas.dataset.mode;
    delete canvas.dataset.entities;
  };
  const failed = (error: unknown) => {
    if (!disposed) {
      release();
      fail(error);
    }
  };
  const label = (selector: string, value: string) => {
    const element = root.querySelector(selector);
    if (element instanceof HTMLButtonElement && element.classList.contains("hud-action"))
      actionText(element, value);
    else if (element) setText(element.querySelector("[data-stat-text]") ?? element, value);
  };
  const update = (state: OfflineState) => {
    if (disposed) return;
    latest = state;
    clock.update(performance.now(), state.paused, state.speed);
    presentation?.setPlaybackRate(state.paused ? 0 : state.speed);
    if (ready && root.style.visibility !== "hidden" && renderer) audio?.listen(renderer.camera);
    matchAudio?.accept(
      state.snapshot,
      ready && !state.paused && root.style.visibility !== "hidden",
    );
    if (!ready) return;
    canvas.dataset.tick = String(state.snapshot.tick);
    canvas.dataset.entities = String(state.snapshot.entities.length);
    label(
      "[data-credits]",
      text("ui.match.credits", { value: state.snapshot.banks?.[0]?.resources.credits ?? "—" }),
    );
    label(
      "[data-materials]",
      text("ui.match.materials", { value: state.snapshot.banks?.[0]?.resources.materials ?? "—" }),
    );
    for (const [selector, resource, name] of [
      ["industrial", "industrial-capacity", "ui.hud.industrial"],
      ["salvage", "salvage-points", "ui.hud.salvage"],
    ] as const) {
      const element = root.querySelector<HTMLElement>(`[data-${selector}]`);
      const value = state.snapshot.banks?.[0]?.resources[resource] ?? 0;
      if (element) {
        element.hidden = value === 0;
        element.textContent = text("ui.hud.stock", { name: text(name), value });
      }
    }
    label(
      "[data-power]",
      text("ui.match.power", {
        used: state.snapshot.power?.[0]?.used ?? "—",
        produced: state.snapshot.power?.[0]?.produced ?? "—",
      }),
    );
    root
      .querySelector("[data-power]")
      ?.classList.toggle("hud-warning", state.snapshot.power?.[0]?.brownout ?? false);
    label(
      "[data-time]",
      text("ui.match.time", {
        value: `${Math.floor(state.snapshot.tick / 1200)}:${String(Math.floor(state.snapshot.tick / 20) % 60).padStart(2, "0")}`,
      }),
    );
    label("[data-pause]", text(state.paused ? "ui.match.resume" : "ui.match.pause"));
    root
      .querySelector("[data-pause]")
      ?.setAttribute(
        "title",
        `${text(state.paused ? "ui.match.resume" : "ui.match.pause")} · ${bindingText(bindings, "pause")}`,
      );
    canvas.setAttribute(
      "aria-label",
      text("ui.match.bound-map-label", {
        camera: ["panUp", "panLeft", "panDown", "panRight"]
          .map((id) => bindingText(bindings, id as "panUp"))
          .join(" / "),
      }),
    );
    root.querySelector("[data-pause]")?.setAttribute("aria-pressed", String(state.paused));
    label("[data-speed]", text("ui.menu.current-speed", { speed: state.speed }));
    menu?.update();
    hud?.update(state);
    minimap?.update(state.snapshot);
    guidance?.update(state.snapshot, !state.paused && !busy && !menu?.isOpen());
    nativeHud?.update();
    void presentation?.accept(state.snapshot, clock.now(performance.now())).catch(failed);
    if (state.snapshot.victory?.result && !resultScreen) {
      hud?.cancel();
      footprint?.accept(null);
      resultScreen = postMatchScreen(
        root,
        state.snapshot.victory,
        0,
        rematch,
        home,
        state.snapshot.statistics,
        async () => {
          if (!match || disposed) return;
          const record = await match.exportMatchRecord();
          if (disposed) return;
          const url = URL.createObjectURL(
            new Blob([`${JSON.stringify(record)}\n`], { type: "application/json" }),
          );
          replayUrls.add(url);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `open-neo-rts-replay-tick-${record.tick}.json`;
          anchor.click();
          setTimeout(() => {
            URL.revokeObjectURL(url);
            replayUrls.delete(url);
          }, 1000);
        },
        resultDefinitions,
        persistence?.replay
          ? async () => {
              if (!match || disposed || !state.snapshot.victory?.result) return;
              const record = await match.exportMatchRecord();
              if (disposed) return;
              const file = savedReplay(record, config, state.snapshot.victory.result.winner);
              await replayStore.write(file);
              if (!disposed) persistence.replay?.(file.id);
            }
          : undefined,
      );
    }
  };
  async function initialize() {
    try {
      progress(0);
      if (!content.catalog)
        throw new Error(`${text("ui.skirmish.content-error")} ${content.error ?? ""}`);
      if (persistence?.saved) {
        const reason = saveCompatibility(persistence.saved, content.catalog.gameplayHash);
        if (reason) throw new Error(reason);
        if (saveMapHash(persistence.saved.match) !== persistence.saved.mapHash)
          throw new Error(text("ui.saves.invalid"));
      }
      progress(1);
      const loaded = await loadMap(`core.${map.id}`);
      if (disposed) return;
      const setup = normalSkirmish(config, loaded.grid, content.catalog);
      progress(2);
      canvas.hidden = false;
      const nextRenderer = await createRenderer(canvas, {
        terrain: loaded.grid,
        quality: preferences.quality,
      });
      if (disposed) {
        nextRenderer.dispose();
        return;
      }
      renderer = nextRenderer;
      renderer.camera.setKeyResolver((event) => {
        for (const [id, action] of [
          ["panUp", "up"],
          ["panDown", "down"],
          ["panLeft", "left"],
          ["panRight", "right"],
          ["resetCamera", "reset"],
        ] as const)
          if (matchesBinding(bindings, id, event)) return action;
        return undefined;
      });
      applyPreferences(preferences);
      const spawn = map.spawns.find((spawn) => spawn.id === config.yourSpawn);
      if (!spawn) throw new Error(text("ui.skirmish.spawn-error"));
      const x = spawn.position[0] as number,
        y = spawn.position[1] as number;
      renderer.camera.target.set(
        x * CELL_SIZE,
        (loaded.grid.level[y * loaded.grid.width + x] ?? 0) * LEVEL_HEIGHT,
        y * CELL_SIZE,
      );
      art = createMapPresentation(
        renderer.scene,
        loaded.grid,
        [
          ...mapDecorations(loaded.definition.objects),
          ...resourceInstances(loaded.definition, loaded.grid, config.seed),
        ],
        resolveMapModel,
      );
      await art.ready;
      if (disposed) return;
      const catalog = builtins.map(({ raw, model, wreck }) => catalogEntry(raw, model, wreck));
      const uiCatalog: HudDefinition[] = content.catalog.definitions.map((gameplay) => {
        const entry = builtins.find(
          ({ raw }) => `core.${(raw as { id: string }).id}` === gameplay.id,
        );
        const raw = entry?.raw as { name: string; description: string } | undefined;
        return {
          gameplay,
          name: raw?.name ?? gameplay.id,
          description: raw?.description ?? "",
          ...(entry?.icon && { icon: entry.icon }),
        };
      });
      resultDefinitions = uiCatalog.map(({ gameplay, name }) => ({
        id: gameplay.id,
        name,
        kind: gameplay.kind,
      }));
      presentation = createMatchPresentation(
        renderer.scene,
        loaded.grid,
        async (id, variant) => {
          const entry = catalog.find((entry) => entry.definition.id === id);
          if (!entry) throw new Error(`Model unavailable: ${id}`);
          return resolveEntityModel(entry, variant);
        },
        () => {
          hud?.update();
          if (latest) guidance?.update(latest.snapshot, false);
          nativeHud?.update();
        },
      );
      presentation.setForceColor(0, "#d8443a");
      presentation.setForceColor(1, "#3c93d9");
      const activePresentation = presentation;
      renderer.scene.onBeforeRenderObservable.add(() => {
        if (ready && root.style.visibility !== "hidden") audio?.listen(renderer!.camera);
        activePresentation.render(clock.now(performance.now()));
        interaction?.frame(performance.now());
        waypointInput?.frame();
        hud?.frame();
        if (minimap?.frame(performance.now())) nativeHud?.frame();
      });
      progress(3);
      match = createOfflineMatch(update, failed);
      await match.init({
        setup,
        seat: 1,
        mode: "controlled",
        ...(persistence?.saved && { savedMatch: persistence.saved.match }),
      });
      if (disposed) return;
      if (!latest) throw new Error(text("ui.loading.failed"));
      progress(4);
      await presentation.accept(latest.snapshot, clock.now(performance.now()));
      if (disposed) return;
      root.classList.add("match-shell");
      root.innerHTML = `<section class="match-top" aria-label="${text("ui.match.title")}"><strong>${map.name}</strong><span data-credits></span><span data-materials></span><span data-industrial></span><span data-salvage></span><span data-power></span><span data-population></span><span data-time></span><span data-speed></span><button type="button" data-pause>${text("ui.match.pause")}</button><button type="button" data-menu>${text("ui.menu.title")}</button><button type="button" data-leave>${text("ui.match.leave")}</button></section>`;
      const activeMatch = match,
        activeRenderer = renderer;
      for (const [attribute, icon] of [
        ["credits", "credits"],
        ["materials", "materials"],
        ["power", "power"],
        ["population", "population"],
        ["time", "clock"],
        ["speed", "surge"],
      ] as const) {
        const element = root.querySelector(`[data-${attribute}]`);
        if (!element) continue;
        const value = document.createElement("span");
        value.dataset.statText = "";
        element.append(hudIcon(icon), value);
        element.classList.add("hud-stat");
      }
      for (const [attribute, icon] of [
        ["pause", "pause"],
        ["menu", "menu"],
        ["leave", "exit"],
      ] as const) {
        const button = root.querySelector<HTMLButtonElement>(`[data-${attribute}]`);
        if (button) decorateAction(button, icon);
      }
      const saveNotice = document.createElement("span");
      saveNotice.setAttribute("role", "status");
      saveNotice.setAttribute("data-save-notice", "");
      root.querySelector(".match-top")?.append(saveNotice);
      const toggle = async () => {
        if (!latest || busy || disposed || latest.snapshot.victory?.result) return;
        busy = true;
        try {
          await activeMatch.pause(!latest.paused);
        } catch (error) {
          if (!latest?.snapshot.victory?.result) failed(error);
        } finally {
          busy = false;
        }
      };
      root
        .querySelector("[data-pause]")
        ?.addEventListener("click", () => void toggle(), { signal: signal.signal });
      const leaveMatch = () => {
        leave();
      };
      root
        .querySelector("[data-leave]")
        ?.addEventListener("click", leaveMatch, { signal: signal.signal });
      const surrender = document.createElement("button");
      surrender.type = "button";
      surrender.textContent = text("ui.result.surrender");
      decorateAction(surrender, "surrender");
      root.querySelector(".match-top")?.append(surrender);
      const surrenderMatch = async (): Promise<boolean> => {
        if (
          busy ||
          disposed ||
          latest?.snapshot.victory?.result ||
          !window.confirm(text("ui.result.confirm-surrender"))
        )
          return false;
        busy = true;
        surrender.disabled = true;
        try {
          hud?.cancel();
          if (latest?.paused) await activeMatch.pause(false);
          if (disposed) return false;
          const result = await activeMatch.command("match.surrender", { force: 0 });
          if (disposed) return false;
          if (result !== "accepted" && !latest?.snapshot.victory?.result) {
            actionText(surrender, text("ui.result.surrender-refused"));
            surrender.disabled = false;
          }
          return result === "accepted" || !!latest?.snapshot.victory?.result;
        } catch (error) {
          if (!latest?.snapshot.victory?.result) failed(error);
          return !!latest?.snapshot.victory?.result;
        } finally {
          busy = false;
        }
      };
      surrender.addEventListener("click", () => void surrenderMatch(), { signal: signal.signal });
      footprint = createPlacementOverlay(renderer.scene, loaded.grid, "#81d4ed");
      hud = createMatchHud(
        canvas,
        root,
        {
          catalog: uiCatalog,
          roster: firstPlayableRoster,
          resources: setup.map?.resources ?? [],
          force: 0,
          forceIdentity: (force) => ({
            label: text(force === 0 ? "ui.skirmish.you" : "ui.skirmish.opponent"),
            color: force === 0 ? "#d8443a" : "#3c93d9",
          }),
          populationCap: config.popCap,
          selection: activePresentation.selection,
          select: activePresentation.select,
          pick: activePresentation.pick,
          pickCell: activeRenderer.pickCell,
          command: activeMatch.command,
          paused: () =>
            !!latest?.paused || busy || !!menu?.isOpen() || !!latest?.snapshot.victory?.result,
          preview: (cells) =>
            footprint?.accept(
              cells
                ? {
                    ok: true,
                    cells: cells.filter(
                      (cell) =>
                        cell.x >= 0 &&
                        cell.y >= 0 &&
                        cell.x < loaded.grid.width &&
                        cell.y < loaded.grid.height,
                    ),
                  }
                : null,
            ),
          fail: failed,
          present: () => nativeHud?.update(),
          blocksPointer: (x, y) => nativeHud?.blocksPointer(x, y) ?? false,
          bindings: () => bindings,
        },
        signal.signal,
      );
      minimap = createMinimap(
        root,
        canvas,
        {
          terrain: loaded.grid,
          definitions: content.catalog.definitions,
          force: 0,
          colors: new Map([
            [0, "#d8443a"],
            [1, "#3c93d9"],
          ]),
          selection: activePresentation.selection,
          pan: (point) => {
            const x = Math.max(0, Math.min(loaded.grid.width - 1, point.x));
            const y = Math.max(0, Math.min(loaded.grid.height - 1, point.y));
            activeRenderer.camera.panTo(
              x * CELL_SIZE,
              y * CELL_SIZE,
              (loaded.grid.level[Math.floor(y) * loaded.grid.width + Math.floor(x)] ?? 0) *
                LEVEL_HEIGHT,
            );
          },
          zoom: activeRenderer.camera.zoomBy,
          view: () =>
            cameraGroundView(activeRenderer.camera).map((point) => ({
              x: point.x / CELL_SIZE,
              y: point.z / CELL_SIZE,
            })),
          camera: () => ({
            x: activeRenderer.camera.target.x / CELL_SIZE,
            y: activeRenderer.camera.target.z / CELL_SIZE,
          }),
          order: hud.orderPoint,
          armAttackMove: hud.armAttackMove,
          bindings: () => bindings,
        },
        signal.signal,
      );
      guidance = createMatchGuidance(
        root,
        {
          force: 0,
          definitions: content.catalog.definitions,
          selection: activePresentation.selection,
          manual: (definition) => {
            hud?.cancel();
            void menu?.openManual(definition);
          },
          present: () => nativeHud?.update(),
        },
        signal.signal,
      );
      nativeHud = mountNativeMatchHud(
        root,
        canvas,
        activeRenderer.scene,
        minimap,
        signal.signal,
        () => bindings,
      );
      interaction = bindWorldInteraction(
        canvas,
        activeRenderer.scene,
        activePresentation,
        art,
        {
          snapshot: () => latest?.snapshot,
          enabled: () => ready && !disposed && !menu?.isOpen() && !latest?.snapshot.victory?.result,
          blocksPointer: (x, y) => nativeHud?.blocksPointer(x, y) ?? false,
        },
        signal.signal,
      );
      activeRenderer.camera.setPointerBlocker((x, y) => nativeHud?.blocksPointer(x, y) ?? false);
      waypointInput = bindWaypointInput(
        canvas,
        {
          waypoints: activePresentation.waypoints,
          enabled: () =>
            ready &&
            !disposed &&
            !busy &&
            !menu?.isOpen() &&
            !latest?.snapshot.victory?.result &&
            (hud?.waypointReady() ?? false),
          blocksPointer: (x, y) => nativeHud?.blocksPointer(x, y) ?? false,
          pickCell: (x, y) => activeRenderer.pickCell(x, y),
          commit: (marker, cell) => hud?.changeWaypoint(marker.handle, cell) ?? Promise.resolve(),
          fail: failed,
        },
        signal.signal,
      );
      const topBar = root.querySelector<HTMLElement>(".match-top");
      const bottomHud = root.querySelector<HTMLElement>(".match-hud");
      if (topBar && bottomHud) {
        const layout = () => {
          if (!disposed)
            activeRenderer.setViewInsets(
              nativeHud ? 0 : topBar.getBoundingClientRect().height,
              nativeHud ? 0 : bottomHud.getBoundingClientRect().height,
            );
        };
        const sizes = new ResizeObserver(layout);
        sizes.observe(topBar);
        sizes.observe(bottomHud);
        sizes.observe(canvas);
        layout();
        signal.signal.addEventListener("abort", () => sizes.disconnect(), { once: true });
      }
      menu = createInGameMenu(
        root,
        {
          state: () =>
            latest && {
              paused: latest.paused,
              speed: latest.speed,
              ended: !!latest.snapshot.victory?.result,
            },
          available: () => ready && !disposed && !busy,
          pause: activeMatch.pause,
          speed: activeMatch.speed,
          controls: (enabled) => {
            activeRenderer.camera.setInputEnabled(enabled);
            // Pause replies arrive before modal teardown; refresh command availability on restoration.
            if (latest) hud?.update(latest);
            nativeHud?.update();
          },
          applySettings: applyPreferences,
          restart: rematch,
          leave: leaveMatch,
          surrender: surrenderMatch,
          focus: () => canvas.focus({ preventScroll: true }),
          save: (name) => persist("manual", name),
          saveName,
          load: persistence?.load,
          quicksave: () => persist("quick", text("ui.saves.quick")),
          quickload:
            persistence &&
            (async () => {
              const saved = await saveStore.read("quicksave");
              await persistence.load(saved);
            }),
        },
        signal.signal,
      );
      root.querySelector("[data-menu]")?.addEventListener(
        "click",
        () => {
          hud?.cancel();
          void menu?.open();
        },
        { signal: signal.signal },
      );
      bindSelectionInput(
        canvas,
        {
          enabled: (event) =>
            ready &&
            !disposed &&
            !busy &&
            !menu?.isOpen() &&
            !latest?.snapshot.victory?.result &&
            !hud?.targeting() &&
            !(event && nativeHud?.blocksPointer(event.clientX, event.clientY)),
          selected: activePresentation.selection,
          select: activePresentation.select,
          pick: activePresentation.pick,
          inRectangle: activePresentation.inRectangle,
          rectangle: (rect) => nativeHud?.box(rect),
        },
        signal.signal,
      );
      window.addEventListener(
        "keydown",
        (event) => {
          if (
            !ready ||
            disposed ||
            busy ||
            menu?.isOpen() ||
            latest?.snapshot.victory?.result ||
            event.defaultPrevented ||
            event.repeat ||
            event.isComposing
          )
            return;
          if (
            event.target instanceof Element &&
            (event.target.closest("input,select,textarea,[contenteditable]") ||
              (event.code !== "Escape" && event.target.closest("button,a")))
          )
            return;
          if (matchesBinding(bindings, "pause", event)) {
            event.preventDefault();
            void toggle();
            return;
          }
          if (
            (matchesBinding(bindings, "speedUp", event) ||
              matchesBinding(bindings, "speedDown", event)) &&
            latest
          ) {
            event.preventDefault();
            const index = NORMAL_GAME_SPEEDS.findIndex((speed) => speed === latest?.speed);
            const next =
              NORMAL_GAME_SPEEDS[
                Math.max(
                  0,
                  Math.min(
                    NORMAL_GAME_SPEEDS.length - 1,
                    index + (matchesBinding(bindings, "speedUp", event) ? 1 : -1),
                  ),
                )
              ];
            if (next !== undefined) void activeMatch.speed(next).catch(failed);
            return;
          }
          if (matchesBinding(bindings, "quicksave", event)) {
            event.preventDefault();
            void persist("quick", text("ui.saves.quick")).catch((error) => {
              if (!disposed)
                label(
                  "[data-save-notice]",
                  error instanceof Error ? error.message : text("ui.saves.failed"),
                );
            });
            return;
          }
          if (matchesBinding(bindings, "quickload", event) && persistence) {
            event.preventDefault();
            void saveStore
              .read("quicksave")
              .then((saved) => {
                if (!disposed) return persistence.load(saved);
              })
              .catch((error) => {
                if (!disposed)
                  label(
                    "[data-save-notice]",
                    error instanceof Error ? error.message : text("ui.saves.failed"),
                  );
              });
            return;
          }
          if (
            event.code === "Escape" &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.defaultPrevented &&
            ready &&
            !latest?.snapshot.victory?.result
          ) {
            event.preventDefault();
            if (hud?.cancel()) return;
            if (activePresentation.selection().length) {
              activePresentation.select([]);
              return;
            }
            void menu?.open();
          }
        },
        { signal: signal.signal },
      );
      canvas.setAttribute("aria-label", text("ui.match.map-label"));
      canvas.tabIndex = 0;
      if (!persistence?.saved) await match.pause(false);
      if (disposed) return;
      ready = true;
      canvas.dataset.mode = "controlled";
      update(latest);
      const auto = () => {
        if (disposed || saving || latest?.snapshot.victory?.result) return;
        return persist("auto", text("ui.saves.auto")).catch(() => {
          if (!disposed) label("[data-save-notice]", text("ui.saves.auto-failed"));
        });
      };
      // shortcut: three wall-clock slots every three minutes; expose cadence with future save preferences.
      autosave = setInterval(auto, 3 * 60 * 1000);
      if (!persistence?.saved) auto();
    } catch (error) {
      if (!disposed) {
        release();
        throw error;
      }
    }
  }
  return {
    ready: initialize(),
    dispose: release,
    pause: () => match?.pause(true) ?? Promise.resolve(),
    confirmExit: (kind: MatchExit) =>
      disposed || !ready || latest?.snapshot.victory?.result
        ? Promise.resolve(true)
        : (menu?.confirmExit(kind) ?? Promise.resolve(false)),
    hasUnsavedProgress: () =>
      !disposed &&
      ready &&
      !latest?.snapshot.victory?.result &&
      (!latest?.paused || latest.snapshot.tick !== lastSavedTick),
  };
}
