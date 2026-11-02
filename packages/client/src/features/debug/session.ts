import { builtins } from "virtual:debug-builtins";
import {
  createDebugOverlays,
  createEntityPresentation,
  createMapPresentation,
  createPlacementOverlay,
  createRenderer,
  resourceInstances,
} from "@open-neo-rts/render";
import { toMatchResources } from "@open-neo-rts/sim/maps";
import { createOfflineMatch, type OfflineState } from "../../worker";
import { bindSelectionInput } from "../match/input";
import { bindOrderInput } from "../match/orders";
import { catalogEntry, resolveEntityModel } from "./catalog";
import { createPresentationClock } from "./clock";
import { type DebugForce, FACTIONS, parseDebugSeed, validateDebugForces } from "./configuration";
import { createInspector } from "./inspector";
import { type DebugLink, debugLink, parseDebugLink, validateInitialSpawns } from "./links";
import { mapDecorations, resolveMapModel } from "./map-visuals";
import { loadMap, MAPS } from "./maps";
import { createOverlayControls } from "./overlays";
import { createSpawnPalette, spawnAtCell } from "./palette";
import { createPerformanceOverlay } from "./performance";
import { oppositeBase } from "./performance-scene";
import { bindPlacementPreview } from "./placement";
import { createReproductionControls } from "./reproduction";

const catalog = builtins.map(({ raw, model }) => catalogEntry(raw, model));
const linkMaps = MAPS.map(({ definition }) => ({
  id: `core.${definition.id}`,
  ...definition.size,
}));

/** Owns one rendered, worker-hosted session; replaced loads never regain ownership. */
export function startDebugSession(canvas: HTMLCanvasElement) {
  const panel = document.createElement("section");
  panel.className = "model-check debug-session";
  panel.setAttribute("aria-label", "Debug session controls");
  panel.innerHTML = `
    <h1>Debug session</h1>
    <div class="model-check-controls">
      <label>Map <select name="map" aria-label="Map"></select></label>
      <label>Seed <input name="seed" type="text" inputmode="numeric" value="1" /></label>
      <button type="button" name="reload">Reload session</button>
      <a href="/">Terrain view</a><a href="/debug?models=1">Model check</a>
      <a href="/debug?scene=terrain-200">Load 200-unit terrain scene</a>
    </div>
    <fieldset><legend>Forces</legend><div data-forces></div><button type="button" name="add-force">Add Force</button></fieldset>
    <label>Controlled Force <select name="controlled" aria-label="Controlled Force"></select></label>
    <p>Debug no-fog. Setup changes apply on reload.</p>
    <p role="status" aria-label="Session status" aria-live="polite">Loading session…</p>`;
  document.body.append(panel);
  document.body.classList.add("model-check-page");
  canvas.setAttribute("aria-label", "Debug map. Arrow keys pan; scroll to zoom.");
  canvas.tabIndex = 0;
  const statusElement = panel.querySelector<HTMLElement>('[role="status"]');
  const reload = panel.querySelector<HTMLButtonElement>('[name="reload"]');
  const map = panel.querySelector<HTMLSelectElement>('[name="map"]');
  const seed = panel.querySelector<HTMLInputElement>('[name="seed"]');
  const forceRows = panel.querySelector<HTMLElement>("[data-forces]");
  const controlled = panel.querySelector<HTMLSelectElement>('[name="controlled"]');
  const addForce = panel.querySelector<HTMLButtonElement>('[name="add-force"]');
  if (!statusElement || !reload || !map || !seed || !forceRows || !controlled || !addForce)
    throw new Error("Debug controls missing");
  const status = statusElement;
  const controls = { forceRows, controlled, addForce };
  const signal = new AbortController();
  const palette = createSpawnPalette(panel, catalog, signal.signal);
  let updateSelection: (handles: readonly string[]) => void = () => {};
  const inspector = createInspector(panel, catalog, signal.signal, (handles) =>
    updateSelection(handles),
  );
  const reproduction = createReproductionControls(panel, inspector.perform, signal.signal);
  map.replaceChildren(
    ...MAPS.map(({ definition }) => new Option(definition.name, `core.${definition.id}`)),
  );
  let initial: DebugLink;
  let linkError: string | undefined;
  try {
    initial = parseDebugLink(location.search, linkMaps, catalog);
  } catch (error) {
    linkError = error instanceof Error ? error.message : "Invalid debug link";
    initial = parseDebugLink("", linkMaps, catalog);
  }
  map.value = initial.map;
  seed.value = String(initial.seed);
  const forces: DebugForce[] = [];
  function appendForce(configured?: DebugForce) {
    if (forces.length >= 8) return;
    const index = forces.length;
    const faction = FACTIONS[index % FACTIONS.length];
    if (!faction) return;
    const force: DebugForce = configured
      ? { ...configured }
      : { index, faction: `core.${faction.id}`, color: faction.color };
    forces.push(force);
    const row = document.createElement("div");
    row.className = "model-check-controls";
    const factionLabel = document.createElement("label");
    factionLabel.textContent = `Force ${index + 1} faction`;
    const picker = document.createElement("select");
    picker.replaceChildren(
      ...FACTIONS.map((faction) => new Option(faction.name, `core.${faction.id}`)),
    );
    picker.value = force.faction;
    picker.addEventListener(
      "change",
      () => {
        force.faction = picker.value;
      },
      { signal: signal.signal },
    );
    factionLabel.append(picker);
    const colorLabel = document.createElement("label");
    colorLabel.textContent = `Force ${index + 1} colour`;
    const color = document.createElement("input");
    color.type = "color";
    color.value = force.color;
    color.addEventListener(
      "input",
      () => {
        force.color = color.value;
      },
      { signal: signal.signal },
    );
    colorLabel.append(color);
    row.append(factionLabel, colorLabel);
    controls.forceRows.append(row);
    controls.controlled.add(new Option(`Force ${index + 1}`, String(index)));
    controls.addForce.disabled = forces.length === 8;
  }
  for (const force of initial.forces) appendForce(force);
  controlled.value = String(initial.controlled);
  if (initial.scene) {
    for (const input of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    ))
      if (input === seed || input === map || input === controlled || forceRows.contains(input))
        input.disabled = true;
    addForce.disabled = true;
    const note = document.createElement("p");
    note.textContent =
      "Fixed scene: Training Grounds 128×128, seed 1, Medium, 200 Dragon Tanks crossing opposite base ramps. Run to start; reload repeats the setup. Counters are observations, not a performance pass.";
    panel.append(note);
  }
  addForce.addEventListener("click", () => appendForce(), { signal: signal.signal });
  let generation = 0;
  let disposed = false;
  let cleanup: (() => void) | undefined;

  async function load() {
    let selectedSeed: number;
    const selectedForces = forces.map((force) => ({ ...force }));
    const controlledValue = controlled?.value ?? "";
    const selectedControlled = /^(0|[1-9][0-9]*)$/.test(controlledValue)
      ? Number(controlledValue)
      : NaN;
    try {
      selectedSeed = parseDebugSeed(seed?.value ?? "");
      validateDebugForces(selectedForces, selectedControlled);
      const selectedMap = linkMaps.find((entry) => entry.id === map?.value);
      if (!selectedMap) throw new Error(`Unknown map: ${map?.value}`);
      validateInitialSpawns(initial.spawns, selectedMap, selectedForces, catalog);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Invalid setup";
      status.setAttribute("role", "alert");
      return;
    }
    const mapId = map?.value ?? "";
    const ticket = ++generation;
    cleanup?.();
    cleanup = undefined;
    inspector.bind();
    reproduction.bind();
    status.textContent = "Loading session…";
    status.setAttribute("role", "status");
    delete canvas.dataset.session;
    palette.setForces(selectedForces, selectedControlled);
    palette.result.textContent = "No spawn submitted.";
    palette.models.textContent = "No entity models loaded.";
    let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
    let entities: ReturnType<typeof createEntityPresentation> | undefined;
    let match: ReturnType<typeof createOfflineMatch> | undefined;
    let art: ReturnType<typeof createMapPresentation> | undefined;
    let overlays: ReturnType<typeof createDebugOverlays> | undefined;
    let placementLayer: ReturnType<typeof createPlacementOverlay> | undefined;
    let placementPreview: ReturnType<typeof bindPlacementPreview> | undefined;
    let performanceOverlay: ReturnType<typeof createPerformanceOverlay> | undefined;
    let released = false;
    const clicks = new AbortController();
    const current = () => !disposed && generation === ticket && !released;
    const release = () => {
      if (released) return;
      released = true;
      clicks.abort();
      match?.dispose();
      updateSelection = () => {};
      inspector.bind();
      reproduction.bind();
      overlays?.dispose();
      placementLayer?.dispose();
      performanceOverlay?.dispose();
      entities?.dispose();
      art?.dispose();
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
      const { definition, grid } = await loadMap(mapId);
      const resources = toMatchResources(definition.resources);
      if (!current()) return;
      const nextRenderer = await createRenderer(canvas, { terrain: grid, quality: "medium" });
      if (!current()) {
        nextRenderer.dispose();
        return;
      }
      renderer = nextRenderer;
      placementLayer = createPlacementOverlay(renderer.scene, grid);
      performanceOverlay = createPerformanceOverlay(panel, renderer);
      overlays = createDebugOverlays(renderer.scene);
      const overlayControls = createOverlayControls(panel, overlays, clicks.signal);
      art = createMapPresentation(
        renderer.scene,
        grid,
        [
          ...mapDecorations(definition.objects),
          ...resourceInstances(definition, grid, selectedSeed),
        ],
        resolveMapModel,
      );
      await art.ready;
      if (!current()) return;
      entities = createEntityPresentation(renderer.scene, grid, async (definition) => {
        const entry = catalog.find((entry) => entry.definition.id === definition);
        if (!entry) throw new Error(`Unknown definition model: ${definition}`);
        return resolveEntityModel(entry);
      });
      const presentation = entities;
      updateSelection = (handles) => presentation.select(handles);
      const clock = createPresentationClock();
      for (const force of selectedForces) presentation.setForceColor(force.index, force.color);
      renderer.scene.onBeforeRenderObservable.add(() => {
        presentation.render(clock.now(performance.now()));
        placementPreview?.frame();
      });
      let modelTick = -1;
      let modelFailed = false;
      let initialized = false;
      let latestState: OfflineState | undefined;
      const receive = (state: OfflineState) => {
        if (!current()) return;
        latestState = state;
        placementPreview?.update(state.snapshot.tick);
        performanceOverlay?.update(state);
        status.textContent = `${definition.name} · ${initialized ? "Ready" : "Initializing"} · Tick ${state.snapshot.tick} · ${state.snapshot.entities.length} entities · ${state.paused ? "Paused" : "Running"} · Debug no-fog · Seed ${selectedSeed} · Controlled Force ${selectedControlled + 1}`;
        canvas.dataset.session = initialized ? "ready" : "loading";
        clock.update(performance.now(), state.paused, state.speed);
        presentation.setPlaybackRate(state.paused ? 0 : state.speed);
        inspector.update(state);
        overlayControls.update(state);
        if (state.snapshot.tick <= modelTick) return;
        art?.setOccupiedNodes(
          state.snapshot.entities
            .filter(
              (entity) =>
                catalog.find((entry) => entry.definition.id === entity.definition)?.definition
                  .nodeKinds,
            )
            .map((entity) => ({ x: Math.floor(entity.x / 1024), y: Math.floor(entity.y / 1024) })),
        );
        modelTick = state.snapshot.tick;
        const presentedTick = modelTick;
        if (!modelFailed && state.snapshot.entities.length)
          palette.models.textContent = `Loading models · ${state.snapshot.entities.length} projected entities`;
        void presentation
          .accept(state.snapshot, clock.now(performance.now()))
          .then(() => {
            if (!current() || modelTick !== presentedTick) return;
            modelFailed = false;
            palette.models.textContent = state.snapshot.entities.length
              ? `Models ready · ${state.snapshot.entities.length} projected entities`
              : "No entity models loaded.";
          })
          .catch((error: unknown) => {
            if (current() && modelTick === presentedTick) {
              modelFailed = true;
              palette.models.textContent =
                error instanceof Error ? error.message : "Model presentation failed";
            }
          });
      };
      match = createOfflineMatch(receive, fail);
      await match.init({
        setup: {
          map: {
            id: mapId,
            terrain: {
              width: grid.width,
              height: grid.height,
              level: Array.from(grid.level),
              ramp: Array.from(grid.ramp),
              surface: Array.from(grid.surface),
              water: Array.from(grid.water),
              biome: Array.from(grid.biome),
            },
            spawns: definition.spawns.map((spawn) => ({
              id: spawn.id,
              position: [
                Math.round((spawn.position[0] ?? 0) * 1024),
                Math.round((spawn.position[1] ?? 0) * 1024),
              ],
              facing: Math.round(((90 - spawn.facing) * 65536) / 360) & 0xffff,
            })),
            resources,
            objects: [],
          },
          seed: selectedSeed,
          debug: true,
          forces: selectedForces.map(({ index, faction }) => ({ index, faction })),
          seats: [1],
          grants: [
            { seat: 1, force: selectedControlled, scopes: ["unit.orders"], grantedAtTick: 0 },
          ],
          definitions: catalog.map((entry) => entry.definition),
        },
        seat: 1,
        mode: "debug-no-fog",
      });
      if (!current()) return;
      const activeMatch = match;
      if (initial.spawns.length) {
        const commands = initial.spawns.map((spawn) => {
          const entry = catalog.find((entry) => entry.definition.id === spawn.definition);
          if (!entry) throw new Error(`Unknown initial spawn: ${spawn.definition}`);
          return activeMatch.command(
            "debug.spawn",
            spawnAtCell(entry, spawn.force, spawn.x, spawn.y, spawn.rotation),
          );
        });
        const [results] = await Promise.all([Promise.all(commands), activeMatch.step()]);
        if (!current()) return;
        const refused = results.findIndex((result) => result !== "accepted");
        if (refused !== -1)
          throw new Error(`Initial spawn ${refused + 1} refused: ${String(results[refused])}`);
      }
      if (initial.scene) {
        const snapshot = latestState?.snapshot;
        if (snapshot?.entities.length !== 200)
          throw new Error("Performance scene requires 200 projected tanks");
        const commands = snapshot.entities.map((entity) =>
          activeMatch.command("unit.move", {
            entities: [entity.handle],
            ...oppositeBase(Math.floor(entity.x / 1024), Math.floor(entity.y / 1024)),
          }),
        );
        const [results] = await Promise.all([Promise.all(commands), activeMatch.step()]);
        if (results.some((result) => result !== "accepted"))
          throw new Error("Performance scene move refused");
        if (latestState)
          await presentation.accept(latestState.snapshot, clock.now(performance.now()));
        if (!current()) return;
      }
      initialized = true;
      inspector.bind(activeMatch);
      if (latestState) receive(latestState);
      reproduction.bind(
        activeMatch,
        debugLink(location.href, {
          map: mapId,
          seed: selectedSeed,
          forces: selectedForces,
          controlled: selectedControlled,
          spawns: initial.spawns,
          ...(initial.scene ? { scene: initial.scene } : {}),
        }),
      );
      overlayControls.bind(activeMatch);
      const activeRenderer = renderer;
      let busy = false;
      const orders = bindOrderInput(
        canvas,
        panel,
        {
          ready: () => current() && !busy && !inspector.busy(),
          selectMode: () => {
            palette.cancel();
          },
          pickCell: (x, y) => activeRenderer.pickCell(x, y),
          order: async (type, cell) => {
            const handles = inspector.selected();
            if (!handles.length) return "Select an entity first.";
            let result = "Control busy.";
            await inspector.perform(async (active, state) => {
              const command = active.command(type, {
                entities: handles,
                ...(cell ? { x: cell.x * 1024 + 512, y: cell.y * 1024 + 512 } : {}),
              });
              if (state.paused) await active.step();
              result = String(await command);
              return result;
            });
            return result;
          },
        },
        clicks.signal,
      );
      const selectionInput = bindSelectionInput(
        canvas,
        {
          enabled: () =>
            current() && !busy && !inspector.busy() && !palette.spawning() && !orders.targeting(),
          selected: inspector.selected,
          select: inspector.select,
          pick: (x, y) => presentation.pick(x, y),
          inRectangle: (left, top, right, bottom) =>
            presentation.inRectangle(left, top, right, bottom),
        },
        clicks.signal,
      );
      placementPreview = bindPlacementPreview(
        canvas,
        palette,
        placementLayer,
        {
          enabled: () =>
            current() && !busy && !inspector.busy() && palette.spawning() && !orders.targeting(),
          pickCell: (x, y) => activeRenderer.pickCell(x, y),
          viewKey: () =>
            `${activeRenderer.camera.getViewMatrix().updateFlag}:${activeRenderer.camera.getProjectionMatrix().updateFlag}`,
          query: activeMatch.placement,
          resources,
        },
        clicks.signal,
      );
      placementPreview.update(latestState?.snapshot.tick ?? 0);
      canvas.addEventListener(
        "keydown",
        (event) => {
          if (event.code !== "Escape") return;
          event.preventDefault();
          if (selectionInput.cancel()) return;
          if (!palette.cancel()) inspector.select([]);
        },
        { signal: clicks.signal },
      );
      canvas.addEventListener(
        "click",
        async (event) => {
          if (!current() || busy || inspector.busy() || event.button !== 0) return;
          if (!palette.spawning() || orders.targeting()) return;
          const selection = palette.selection();
          const cell = activeRenderer.pickCell(event.clientX, event.clientY);
          if (!selection || !cell) {
            palette.result.textContent = "Choose a definition and a map cell.";
            return;
          }
          busy = true;
          const payload = spawnAtCell(
            selection.entry,
            selection.force,
            cell.x,
            cell.y,
            selection.rotation,
            resources,
          );
          palette.result.textContent = `Submitting ${selection.entry.name} at ${cell.x}, ${cell.y}…`;
          try {
            await inspector.perform(async (_match, state) => {
              const command = activeMatch.command("debug.spawn", payload);
              if (state.paused) await activeMatch.step();
              const result = await command;
              if (!current()) return;
              if (result === "accepted")
                palette.result.textContent = `Spawned ${selection.entry.name} · Force ${selection.force + 1} · Cell ${cell.x}, ${cell.y}`;
              else if (result === "placement_failed") {
                const placement = await activeMatch.placement(payload);
                if (!current()) return;
                const reasons = new Set(
                  placement.cells?.flatMap((cell) => (cell.failure ? [cell.failure] : [])) ?? [],
                );
                palette.result.textContent = `Refused ${selection.entry.name}: ${result} · ${placement.failure ?? [...reasons].join(", ")}`;
              } else
                palette.result.textContent = `Refused ${selection.entry.name}: ${String(result)}`;
            });
          } catch (error) {
            fail(error);
          } finally {
            busy = false;
          }
        },
        { signal: clicks.signal },
      );
    } catch (error) {
      fail(error);
    }
  }
  reload.addEventListener("click", () => void load(), { signal: signal.signal });
  if (linkError) {
    status.textContent = `Invalid debug link: ${linkError}. Edit the URL, or Reload session to start the setup shown.`;
    status.setAttribute("role", "alert");
    canvas.dataset.session = "error";
  } else void load();
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
