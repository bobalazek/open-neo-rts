import { builtins } from "virtual:debug-builtins";
import {
  createEntityPresentation,
  createMapPresentation,
  createRenderer,
  resourceInstances,
} from "@open-neo-rts/render";
import type { SpawnPlacement } from "@open-neo-rts/sim";
import { toMatchResources } from "@open-neo-rts/sim/maps";
import { createOfflineMatch } from "../../worker";
import { catalogEntry, resolveEntityModel } from "./catalog";
import { createPresentationClock } from "./clock";
import { type DebugForce, FACTIONS, parseDebugSeed, validateDebugForces } from "./configuration";
import { createInspector } from "./inspector";
import { mapDecorations, resolveMapModel } from "./map-visuals";
import { loadMap, MAPS } from "./maps";
import { createSpawnPalette, spawnAtCell } from "./palette";

const catalog = builtins.map(({ raw, model }) => catalogEntry(raw, model));

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
    </div>
    <fieldset><legend>Forces</legend><div data-forces></div><button type="button" name="add-force">Add Force</button></fieldset>
    <label>Controlled Force <select name="controlled" aria-label="Controlled Force"></select></label>
    <p>Debug no-fog · Empty setup. Setup changes apply on reload.</p>
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
  const inspector = createInspector(panel, catalog, signal.signal, () => {});
  map.replaceChildren(
    ...MAPS.map(({ definition }) => new Option(definition.name, `core.${definition.id}`)),
  );
  const initialMap = new URLSearchParams(location.search).get("map") ?? "core.map:sandbox-flat";
  if (!MAPS.some(({ definition }) => `core.${definition.id}` === initialMap))
    map.add(new Option("Unknown map", initialMap));
  map.value = initialMap;
  const forces: DebugForce[] = [];
  function appendForce() {
    if (forces.length >= 8) return;
    const index = forces.length;
    const faction = FACTIONS[index % FACTIONS.length];
    if (!faction) return;
    const force: DebugForce = { index, faction: `core.${faction.id}`, color: faction.color };
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
  appendForce();
  addForce.addEventListener("click", appendForce, { signal: signal.signal });
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
    let released = false;
    const clicks = new AbortController();
    const current = () => !disposed && generation === ticket && !released;
    const release = () => {
      if (released) return;
      released = true;
      clicks.abort();
      match?.dispose();
      inspector.bind();
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
      if (!current()) return;
      const nextRenderer = await createRenderer(canvas, { terrain: grid });
      if (!current()) {
        nextRenderer.dispose();
        return;
      }
      renderer = nextRenderer;
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
      const clock = createPresentationClock();
      for (const force of selectedForces) presentation.setForceColor(force.index, force.color);
      renderer.scene.onBeforeRenderObservable.add(() =>
        presentation.render(clock.now(performance.now())),
      );
      let modelTick = -1;
      let modelFailed = false;
      match = createOfflineMatch((state) => {
        if (!current()) return;
        status.textContent = `${definition.name} · Ready · Tick ${state.snapshot.tick} · ${state.snapshot.entities.length} entities · ${state.paused ? "Paused" : "Running"} · Debug no-fog · Seed ${selectedSeed} · Controlled Force ${selectedControlled + 1}`;
        canvas.dataset.session = "ready";
        clock.update(performance.now(), state.paused, state.speed);
        presentation.setPlaybackRate(state.paused ? 0 : state.speed);
        inspector.update(state);
        if (state.snapshot.tick <= modelTick) return;
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
      }, fail);
      inspector.bind(match);
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
            resources: toMatchResources(definition.resources),
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
      const activeRenderer = renderer;
      let busy = false;
      canvas.addEventListener(
        "click",
        async (event) => {
          if (!current() || busy || inspector.busy() || event.button !== 0) return;
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
                const placement = (await activeMatch.placement(payload)) as SpawnPlacement;
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
