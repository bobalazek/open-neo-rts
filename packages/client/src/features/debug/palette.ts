import type { DebugSpawn } from "@open-neo-rts/sim";
import { type MatchResource, resourceNodeOrigin, resourceOccupies } from "@open-neo-rts/sim/maps";
import type { CatalogEntry } from "./catalog";
import type { DebugForce } from "./configuration";

/** Convert a picked cell, never predict placement policy in the client. */
export function spawnAtCell(
  entry: CatalogEntry,
  force: number,
  x: number,
  y: number,
  rotation: number,
  resources: readonly MatchResource[] = [],
): DebugSpawn {
  const node =
    entry.definition.nodeKinds &&
    resources.find(
      (r) =>
        r.kind !== "ore" &&
        entry.definition.nodeKinds?.includes(r.kind) &&
        resourceOccupies(r, x, y),
    );
  if (node) ({ x, y } = resourceNodeOrigin(node));
  const offset = entry.kind === "unit" ? 512 : 0;
  return {
    definition: entry.definition.id,
    force,
    x: x * 1024 + offset,
    y: y * 1024 + offset,
    facing: ((rotation + 1) * 0x4000) & 0xffff,
  };
}

export function createSpawnPalette(
  panel: HTMLElement,
  catalog: readonly CatalogEntry[],
  signal: AbortSignal,
) {
  const section = document.createElement("fieldset");
  section.innerHTML = `<legend>Spawn existing content</legend>
    <label>Search definitions <input type="search" /></label>
    <label>Map action <select name="map-action" aria-label="Map action"><option value="spawn">Spawn</option><option value="select">Select</option></select></label>
    <label>Definition <select aria-label="Definition" size="5"></select></label>
    <div class="model-check-controls">
      <label>Spawn Force <select name="spawn-force" aria-label="Spawn Force"></select></label>
      <label>Rotation <select name="rotation" aria-label="Rotation">
        <option value="0">0°</option><option value="1">90°</option><option value="2">180°</option><option value="3">270°</option>
      </select></label>
    </div>
    <p>Spawn: pick a definition, then left-click the map. Select: click an entity; Shift adds, Ctrl/Cmd toggles. A paused spawn advances one tick.</p>
    <p role="status" aria-label="Spawn result">No spawn submitted.</p>
    <p role="status" aria-label="Model status">No entity models loaded.</p>`;
  section.insertAdjacentHTML(
    "beforeend",
    `<p role="status" aria-label="Placement preview">Hover the map in Spawn mode to preview placement.</p><details><summary>Placement cells · green allowed, red refused</summary><ul aria-label="Placement cells"></ul></details>`,
  );
  panel.append(section);
  const search = section.querySelector("input");
  const definitions = section.querySelector<HTMLSelectElement>('[aria-label="Definition"]');
  const force = section.querySelector<HTMLSelectElement>('[name="spawn-force"]');
  const rotation = section.querySelector<HTMLSelectElement>('[name="rotation"]');
  const action = section.querySelector<HTMLSelectElement>('[name="map-action"]');
  const result = section.querySelector<HTMLElement>('[aria-label="Spawn result"]');
  const models = section.querySelector<HTMLElement>('[aria-label="Model status"]');
  const preview = section.querySelector<HTMLElement>('[aria-label="Placement preview"]');
  const previewCells = section.querySelector<HTMLUListElement>('[aria-label="Placement cells"]');
  if (
    !search ||
    !definitions ||
    !force ||
    !rotation ||
    !action ||
    !result ||
    !models ||
    !preview ||
    !previewCells
  )
    throw new Error("Spawn controls missing");
  const controls = { search, definitions, force, rotation };
  function filter() {
    const selected = controls.definitions.value;
    const query = controls.search.value.toLowerCase();
    const entries = catalog.filter((entry) =>
      `${entry.name} ${entry.definition.id}`.toLowerCase().includes(query),
    );
    controls.definitions.replaceChildren(
      ...entries.map(
        (entry) =>
          new Option(
            `${entry.name} · ${entry.definition.id}${entry.model ? "" : " · Model unavailable"}`,
            entry.definition.id,
          ),
      ),
    );
    if (entries.some((entry) => entry.definition.id === selected))
      controls.definitions.value = selected;
  }
  filter();
  search.addEventListener("input", filter, { signal });
  return {
    result,
    models,
    choose(id: string) {
      search.value = "";
      filter();
      definitions.value = id;
    },
    preview,
    previewCells,
    spawning: () => action.value === "spawn",
    cancel() {
      if (action.value !== "spawn") return false;
      action.value = "select";
      return true;
    },
    setForces(forces: readonly DebugForce[], controlled: number) {
      force.replaceChildren(
        ...forces.map((force) => new Option(`Force ${force.index + 1}`, String(force.index))),
      );
      force.value = String(controlled);
    },
    selection() {
      const entry = catalog.find((entry) => entry.definition.id === definitions.value);
      if (!entry || !force.options.length) return null;
      return { entry, force: Number(force.value), rotation: Number(rotation.value) };
    },
  };
}
