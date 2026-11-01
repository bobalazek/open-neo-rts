import { createEntityPresentation, createRenderer } from "@open-neo-rts/render";
import { createOfflineMatch } from "../../worker";
import { loadMap } from "./maps";

/** Owns one rendered, worker-hosted session; replaced loads never regain ownership. */
export function startDebugSession(canvas: HTMLCanvasElement) {
  const panel = document.createElement("section");
  panel.className = "model-check debug-session";
  panel.setAttribute("aria-label", "Debug session controls");
  panel.innerHTML = `
    <h1>Debug session</h1>
    <div class="model-check-controls">
      <button type="button">Reload session</button>
      <a href="/">Terrain view</a><a href="/debug?models=1">Model check</a>
    </div>
    <p>Debug no-fog · Paused · Empty setup</p>
    <p role="status" aria-live="polite">Loading session…</p>`;
  document.body.append(panel);
  document.body.classList.add("model-check-page");
  canvas.setAttribute("aria-label", "Debug map. Arrow keys pan; scroll to zoom.");
  canvas.tabIndex = 0;
  const statusElement = panel.querySelector<HTMLElement>('[role="status"]');
  const reload = panel.querySelector("button");
  if (!statusElement || !reload) throw new Error("Debug controls missing");
  const status = statusElement;
  const signal = new AbortController();
  let generation = 0;
  let disposed = false;
  let cleanup: (() => void) | undefined;

  async function load() {
    const ticket = ++generation;
    cleanup?.();
    cleanup = undefined;
    status.textContent = "Loading session…";
    status.setAttribute("role", "status");
    delete canvas.dataset.session;
    let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
    let entities: ReturnType<typeof createEntityPresentation> | undefined;
    let match: ReturnType<typeof createOfflineMatch> | undefined;
    let released = false;
    const current = () => !disposed && generation === ticket && !released;
    const release = () => {
      if (released) return;
      released = true;
      match?.dispose();
      entities?.dispose();
      renderer?.dispose();
    };
    cleanup = release;
    const fail = (error: unknown) => {
      if (!current()) return;
      status.textContent = `${error instanceof Error ? error.message : "Session failed"}. Reload session to retry.`;
      status.setAttribute("role", "alert");
      canvas.dataset.session = "error";
      release();
    };
    try {
      const { grid } = await loadMap("core.map:sandbox-flat");
      if (!current()) return;
      const nextRenderer = await createRenderer(canvas, { terrain: grid });
      if (!current()) {
        nextRenderer.dispose();
        return;
      }
      renderer = nextRenderer;
      entities = createEntityPresentation(renderer.scene, grid, async (definition) => {
        throw new Error(`Model unavailable: ${definition}`);
      });
      const presentation = entities;
      renderer.scene.onBeforeRenderObservable.add(() => presentation.render(performance.now()));
      match = createOfflineMatch((state) => {
        if (!current()) return;
        status.textContent = `Ready · Tick ${state.snapshot.tick} · ${state.snapshot.entities.length} entities · Paused · Debug no-fog`;
        canvas.dataset.session = "ready";
        void presentation.accept(state.snapshot, performance.now()).catch(fail);
      }, fail);
      await match.init({
        setup: {
          map: {
            id: "core.map:sandbox-flat",
            terrain: {
              width: grid.width,
              height: grid.height,
              level: Array.from(grid.level),
              ramp: Array.from(grid.ramp),
              surface: Array.from(grid.surface),
              water: Array.from(grid.water),
              biome: Array.from(grid.biome),
            },
            spawns: [],
            objects: [],
          },
          seed: 1,
          debug: true,
          forces: [{ index: 0, faction: "core.faction:eastern-collective" }],
          seats: [1],
          grants: [{ seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 }],
          definitions: [],
        },
        seat: 1,
        mode: "debug-no-fog",
      });
    } catch (error) {
      fail(error);
    }
  }
  reload.addEventListener("click", () => void load(), { signal: signal.signal });
  void load();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      signal.abort();
      cleanup?.();
      panel.remove();
      document.body.classList.remove("model-check-page");
      delete canvas.dataset.session;
    },
  };
}
