/// <reference path="../../assets.d.ts" />
import { parseTerrain } from "@open-neo-rts/content";
import { createRenderer } from "@open-neo-rts/render";
import type { PresentedEntity, PresentedGhost, SeatSnapshot } from "@open-neo-rts/sim";
import reactorModel from "../../../../../content/core/factions/eastern-collective/structures/industrial-reactor/industrial-reactor.glb";
import reactor from "../../../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json";
import soldierModel from "../../../../../content/core/factions/eastern-collective/units/collective-soldier/collective-soldier.glb";
import soldier from "../../../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json";
import { createMatchPresentation } from ".";
import { bindSelectionInput } from "./input";

/** Debug-only renderer fixture: these are permitted packet fixtures, never an omniscient World. */
export async function startFogFixture(canvas: HTMLCanvasElement) {
  const panel = document.createElement("section");
  panel.className = "model-check";
  panel.setAttribute("aria-label", "Fog presentation fixture");
  panel.innerHTML = `<h1>Fog presentation fixture</h1>
    <div class="model-check-controls">
      <button type="button" data-stage="hidden">Lose sight</button>
      <button type="button" data-stage="empty">Re-observe empty site</button>
      <button type="button" data-stage="group">Switch vision group</button>
      <button type="button" data-stage="debug">Show debug no-fog</button>
      <button type="button" data-stage="observed">Reload fixture</button>
      <a href="/debug">Debug session</a>
    </div>
    <p>Left: visible. Middle: explored. Right: unexplored. Remembered structures are gray and cannot be selected.</p>
    <p>Copied snapshot fixtures only; the normal skirmish screen is separate.</p>
    <p role="status" aria-live="polite">Loading original models…</p>
    <p data-selection>Selected: none</p>`;
  document.body.classList.add("model-check-page");
  document.body.append(panel);
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Fog fixture map. Click visible models to select; remembered structures cannot be selected.",
  );
  const statusElement = panel.querySelector<HTMLElement>('[role="status"]');
  const selection = panel.querySelector<HTMLElement>("[data-selection]");
  if (!statusElement || !selection) throw new Error("Fog fixture controls missing");
  const status = statusElement;
  const signal = new AbortController();
  const grid = parseTerrain(24, 16, {});
  const renderer = await createRenderer(canvas, { terrain: grid, quality: "low" });
  const presentation = createMatchPresentation(
    renderer.scene,
    grid,
    async (definition) => {
      const structure = definition === `core.${reactor.id}`;
      if (!structure && definition !== `core.${soldier.id}`)
        throw new Error("Unknown fixture model");
      const response = await fetch(structure ? reactorModel : soldierModel);
      if (!response.ok) throw new Error("Original fixture model unavailable");
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        movementDomain: structure ? null : "foot",
        ...(structure && { footprint: reactor.footprint as [number, number], foundation: true }),
      };
    },
    (handles) => {
      selection.textContent = `Selected: ${handles.join(", ") || "none"}`;
    },
  );
  presentation.setForceColor(2, "#da4b3e");
  let tick = 0;
  let generation = 0;
  let disposed = false;
  const building: PresentedEntity = {
    handle: "e1",
    definition: `core.${reactor.id}`,
    force: 2,
    x: 10 * 1024,
    y: 7 * 1024,
    facing: 0x4000,
    health: 900,
    maxHealth: reactor.health,
    order: null,
  };
  const unit: PresentedEntity = {
    handle: "e2",
    definition: `core.${soldier.id}`,
    force: 2,
    x: 13 * 1024 + 512,
    y: 10 * 1024 + 512,
    facing: 0x4000,
    health: soldier.health,
    maxHealth: soldier.health,
    order: null,
  };
  const ghost: PresentedGhost = {
    handle: "g1",
    group: 1,
    definition: building.definition,
    force: building.force,
    x: building.x,
    y: building.y,
    facing: building.facing,
    health: building.health,
    maxHealth: building.maxHealth,
    seen: 0,
  };
  async function show(stage: string) {
    const current = ++generation;
    if (stage === "observed") {
      presentation.reset();
      tick = 0;
    } else tick++;
    const cells = new Uint8Array(24 * 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 24; x++) {
        cells[y * 24 + x] = stage === "group" ? (x < 8 ? 1 : 0) : x < 8 ? 2 : x < 16 ? 1 : 0;
        if ((stage === "observed" || stage === "empty") && x >= 9 && x < 15 && y >= 6 && y < 12)
          cells[y * 24 + x] = 2;
      }
    const observed = stage === "observed" || stage === "debug";
    const snapshot: SeatSnapshot = {
      tick,
      mode: stage === "debug" ? "debug-no-fog" : "controlled",
      entities: observed ? [building, unit] : [],
      fog: [{ group: stage === "group" ? 2 : 1, width: 24, height: 16, cells }],
      ghosts: stage === "hidden" ? [ghost] : [],
    };
    status.textContent = "Applying copied projection…";
    try {
      await presentation.accept(snapshot, performance.now());
      if (disposed || current !== generation) return;
      const live = renderer.scene.transformNodes.filter((node) =>
        /^entity e/.test(node.name),
      ).length;
      const remembered = renderer.scene.transformNodes.filter((node) =>
        /^entity ghost:/.test(node.name),
      ).length;
      canvas.dataset.stage = stage;
      canvas.dataset.live = String(live);
      canvas.dataset.ghosts = String(remembered);
      status.textContent = `${stage === "debug" ? "Explicit debug no-fog" : stage === "hidden" ? "Sight lost: last-seen structure retained; unit removed" : stage === "empty" ? "Empty site re-observed: remembered structure removed" : stage === "group" ? "Vision group switched: previous scene owners released" : "Observed structure and unit"} · ${live} live models · ${remembered} remembered structures`;
    } catch (error) {
      if (disposed || current !== generation) return;
      status.textContent = error instanceof Error ? error.message : "Fixture failed";
      status.setAttribute("role", "alert");
    }
  }
  panel.addEventListener(
    "click",
    (event) => {
      const stage =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-stage]")?.dataset.stage
          : undefined;
      if (stage) void show(stage);
    },
    { signal: signal.signal },
  );
  bindSelectionInput(
    canvas,
    {
      enabled: () => !disposed,
      selected: presentation.selection,
      select: presentation.select,
      pick: presentation.pick,
      inRectangle: presentation.inRectangle,
    },
    signal.signal,
  );
  const observer = renderer.scene.onBeforeRenderObservable.add(() =>
    presentation.render(performance.now()),
  );
  await show("observed");
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      signal.abort();
      renderer.scene.onBeforeRenderObservable.remove(observer);
      presentation.dispose();
      renderer.dispose();
      panel.remove();
      document.body.classList.remove("model-check-page");
    },
  };
}
