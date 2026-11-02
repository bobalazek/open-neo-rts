import { builtins } from "virtual:debug-builtins";
import { content } from "virtual:normal-catalog";
import {
  CELL_SIZE,
  createMapPresentation,
  createPlacementOverlay,
  createRenderer,
  LEVEL_HEIGHT,
  resourceInstances,
} from "@open-neo-rts/render";
import { text } from "../../shared";
import { createOfflineMatch, type OfflineState } from "../../worker";
import { catalogEntry, resolveEntityModel } from "../debug/catalog";
import { createPresentationClock } from "../debug/clock";
import { mapDecorations, resolveMapModel } from "../debug/map-visuals";
import { loadMap } from "../debug/maps";
import { postMatchScreen } from "../post-match";
import { firstPlayableRoster } from "../skirmish/roster";
import { map, normalSkirmish, type SkirmishSetup } from "../skirmish/setup";
import { createMatchPresentation } from ".";
import { createMatchHud } from "./hud";
import type { HudDefinition } from "./hud-model";
import { bindSelectionInput } from "./input";

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
) {
  const signal = new AbortController();
  let disposed = false,
    ready = false,
    busy = false;
  let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
  let presentation: ReturnType<typeof createMatchPresentation> | undefined;
  let art: ReturnType<typeof createMapPresentation> | undefined;
  let match: ReturnType<typeof createOfflineMatch> | undefined;
  let latest: OfflineState | undefined;
  let hud: ReturnType<typeof createMatchHud> | undefined;
  let footprint: ReturnType<typeof createPlacementOverlay> | undefined;
  let resultScreen: HTMLDialogElement | undefined;
  const clock = createPresentationClock();
  const release = () => {
    if (disposed) return;
    disposed = true;
    signal.abort();
    resultScreen?.remove();
    match?.dispose();
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
    if (element) element.textContent = value;
  };
  const update = (state: OfflineState) => {
    if (disposed) return;
    latest = state;
    clock.update(performance.now(), state.paused, state.speed);
    presentation?.setPlaybackRate(state.paused ? 0 : state.speed);
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
    hud?.update(state);
    void presentation?.accept(state.snapshot, clock.now(performance.now())).catch(failed);
    if (state.snapshot.victory?.result && !resultScreen) {
      hud?.cancel();
      footprint?.accept(null);
      resultScreen = postMatchScreen(root, state.snapshot.victory, 0, rematch, home);
    }
  };
  async function initialize() {
    try {
      progress(0);
      if (!content.catalog)
        throw new Error(`${text("ui.skirmish.content-error")} ${content.error ?? ""}`);
      progress(1);
      const loaded = await loadMap(`core.${map.id}`);
      if (disposed) return;
      const setup = normalSkirmish(config, loaded.grid, content.catalog);
      progress(2);
      canvas.hidden = false;
      const nextRenderer = await createRenderer(canvas, {
        terrain: loaded.grid,
        quality: "medium",
      });
      if (disposed) {
        nextRenderer.dispose();
        return;
      }
      renderer = nextRenderer;
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
      const catalog = builtins.map(({ raw, model }) => catalogEntry(raw, model));
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
      presentation = createMatchPresentation(
        renderer.scene,
        loaded.grid,
        async (id) => {
          const entry = catalog.find((entry) => entry.definition.id === id);
          if (!entry) throw new Error(`Model unavailable: ${id}`);
          return resolveEntityModel(entry);
        },
        () => hud?.update(),
      );
      presentation.setForceColor(0, "#d8443a");
      presentation.setForceColor(1, "#3c93d9");
      const activePresentation = presentation;
      renderer.scene.onBeforeRenderObservable.add(() => {
        activePresentation.render(clock.now(performance.now()));
        hud?.frame();
      });
      progress(3);
      match = createOfflineMatch(update, failed);
      await match.init({ setup, seat: 1, mode: "controlled" });
      if (disposed) return;
      if (!latest) throw new Error(text("ui.loading.failed"));
      progress(4);
      await presentation.accept(latest.snapshot, clock.now(performance.now()));
      if (disposed) return;
      root.classList.add("match-shell");
      root.innerHTML = `<section class="match-top" aria-label="${text("ui.match.title")}"><strong>${map.name}</strong><span data-credits></span><span data-materials></span><span data-industrial></span><span data-salvage></span><span data-power></span><span data-population></span><span data-time></span><button type="button" data-pause>${text("ui.match.pause")}</button><button type="button" data-leave>${text("ui.match.leave")}</button></section>`;
      const activeMatch = match,
        activeRenderer = renderer;
      const toggle = async () => {
        if (!latest || busy || disposed || latest.snapshot.victory?.result) return;
        busy = true;
        try {
          await activeMatch.pause(!latest.paused);
        } catch (error) {
          failed(error);
        } finally {
          busy = false;
        }
      };
      root
        .querySelector("[data-pause]")
        ?.addEventListener("click", () => void toggle(), { signal: signal.signal });
      root
        .querySelector("[data-leave]")
        ?.addEventListener("click", leave, { signal: signal.signal });
      footprint = createPlacementOverlay(renderer.scene, loaded.grid, "#81d4ed");
      hud = createMatchHud(
        canvas,
        root,
        {
          catalog: uiCatalog,
          roster: firstPlayableRoster,
          resources: setup.map?.resources ?? [],
          force: 0,
          populationCap: config.popCap,
          selection: activePresentation.selection,
          select: activePresentation.select,
          pick: activePresentation.pick,
          pickCell: activeRenderer.pickCell,
          command: activeMatch.command,
          paused: () => !!latest?.paused || busy || !!latest?.snapshot.victory?.result,
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
        },
        signal.signal,
      );
      bindSelectionInput(
        canvas,
        {
          enabled: () => ready && !disposed && !busy && !latest?.snapshot.victory?.result && !hud?.targeting(),
          selected: activePresentation.selection,
          select: activePresentation.select,
          pick: activePresentation.pick,
          inRectangle: activePresentation.inRectangle,
        },
        signal.signal,
      );
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.code === "Escape" && !event.defaultPrevented && ready && !latest?.snapshot.victory?.result) {
            event.preventDefault();
            if (hud?.cancel()) return;
            if (activePresentation.selection().length) {
              activePresentation.select([]);
              return;
            }
            void toggle();
          }
        },
        { signal: signal.signal },
      );
      canvas.setAttribute("aria-label", text("ui.match.map-label"));
      canvas.tabIndex = 0;
      ready = true;
      canvas.dataset.session = "ready";
      canvas.dataset.mode = "controlled";
      update(latest);
      await match.pause(false);
      if (!disposed) canvas.focus({ preventScroll: true });
    } catch (error) {
      if (!disposed) {
        release();
        throw error;
      }
    }
  }
  return { ready: initialize(), dispose: release };
}
