import { builtins } from "virtual:debug-builtins";
import { content } from "virtual:normal-catalog";
import {
  CELL_SIZE,
  createMapPresentation,
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
import { map, normalSkirmish, type SkirmishSetup } from "../skirmish/setup";
import { createMatchPresentation } from ".";
import { bindSelectionInput } from "./input";
import { bindOrderInput } from "./orders";

/** A screen owns this session immediately, including resources that finish loading after cancellation. */
export function createNormalSession(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  config: SkirmishSetup,
  progress: (stage: number) => void,
  fail: (error: unknown) => void,
  leave: () => void,
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
  const clock = createPresentationClock();
  const release = () => {
    if (disposed) return;
    disposed = true;
    signal.abort();
    match?.dispose();
    presentation?.dispose();
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
      text("ui.match.credits", { value: state.snapshot.banks?.[0]?.resources.credits ?? 0 }),
    );
    label(
      "[data-materials]",
      text("ui.match.materials", { value: state.snapshot.banks?.[0]?.resources.materials ?? 0 }),
    );
    label(
      "[data-power]",
      text("ui.match.power", {
        used: state.snapshot.power?.[0]?.used ?? 0,
        produced: state.snapshot.power?.[0]?.produced ?? 0,
      }),
    );
    label(
      "[data-time]",
      text("ui.match.time", {
        value: `${Math.floor(state.snapshot.tick / 1200)}:${String(Math.floor(state.snapshot.tick / 20) % 60).padStart(2, "0")}`,
      }),
    );
    label("[data-pause]", text(state.paused ? "ui.match.resume" : "ui.match.pause"));
    void presentation?.accept(state.snapshot, clock.now(performance.now())).catch(failed);
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
      presentation = createMatchPresentation(
        renderer.scene,
        loaded.grid,
        async (id) => {
          const entry = catalog.find((entry) => entry.definition.id === id);
          if (!entry) throw new Error(`Model unavailable: ${id}`);
          return resolveEntityModel(entry);
        },
        (handles) =>
          label("[data-selection]", text("ui.match.selection", { count: handles.length })),
      );
      presentation.setForceColor(0, "#d8443a");
      presentation.setForceColor(1, "#3c93d9");
      const activePresentation = presentation;
      renderer.scene.onBeforeRenderObservable.add(() =>
        activePresentation.render(clock.now(performance.now())),
      );
      progress(3);
      match = createOfflineMatch(update, failed);
      await match.init({ setup, seat: 1, mode: "controlled" });
      if (disposed) return;
      if (!latest) throw new Error(text("ui.loading.failed"));
      progress(4);
      await presentation.accept(latest.snapshot, clock.now(performance.now()));
      if (disposed) return;
      root.classList.add("match-shell");
      root.innerHTML = `<section class="match-top" aria-label="${text("ui.match.title")}"><strong>${map.name}</strong><span data-credits></span><span data-materials></span><span data-power></span><span data-time></span><button type="button" data-pause>${text("ui.match.pause")}</button><button type="button" data-leave>${text("ui.match.leave")}</button></section><section class="match-controls"><p class="preview-note">${text("ui.match.preview")}</p><p data-selection>${text("ui.match.selection", { count: 0 })}</p><div data-orders></div><p role="status" data-order-result aria-live="polite"></p></section>`;
      const panel = root.querySelector<HTMLElement>("[data-orders]");
      if (!panel) throw new Error("Match controls missing");
      const activeMatch = match,
        activeRenderer = renderer;
      const ownUnits = () =>
        activePresentation
          .selection()
          .filter((handle) =>
            latest?.snapshot.entities.some(
              (entity) =>
                entity.handle === handle &&
                entity.force === 0 &&
                catalog.find((entry) => entry.definition.id === entity.definition)?.kind === "unit",
            ),
          );
      const toggle = async () => {
        if (!latest || busy || disposed) return;
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
      const orders = bindOrderInput(
        canvas,
        panel,
        {
          ready: () => ready && !disposed && !busy,
          selectMode: () => {},
          pickCell: activeRenderer.pickCell,
          order: async (type, cell) => {
            const handles = ownUnits();
            if (!handles.length) return text("ui.match.select-first");
            busy = true;
            try {
              const command = activeMatch.command(type, {
                entities: handles,
                ...(cell && { x: cell.x * 1024 + 512, y: cell.y * 1024 + 512 }),
              });
              if (latest?.paused) await activeMatch.step();
              const result = await command;
              return result === "accepted"
                ? ""
                : text("ui.match.order-refused", { reason: String(result) });
            } catch (error) {
              failed(error);
              return "";
            } finally {
              busy = false;
            }
          },
          feedback: (_type, result) => result,
        },
        signal.signal,
      );
      bindSelectionInput(
        canvas,
        {
          enabled: () => ready && !disposed && !busy && !orders.targeting(),
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
          if (event.code === "Escape" && !event.defaultPrevented && ready) {
            event.preventDefault();
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
