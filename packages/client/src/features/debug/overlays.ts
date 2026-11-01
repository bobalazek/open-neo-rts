import { type GroundDomain, WATER_PASSABLE } from "@open-neo-rts/content";
import type { createDebugOverlays, DebugOverlayVisibility } from "@open-neo-rts/render";
import type { createOfflineMatch, OfflineState } from "../../worker";

export function createOverlayControls(
  panel: HTMLElement,
  layer: ReturnType<typeof createDebugOverlays>,
  signal: AbortSignal,
) {
  const section = document.createElement("fieldset");
  section.className = "debug-overlays";
  section.disabled = true;
  section.innerHTML = `<legend>Debug overlays</legend><div class="model-check-controls">
    <label><input type="checkbox" name="grid" />Grid</label>
    <label><input type="checkbox" name="heights" />Heights</label>
    <label><input type="checkbox" name="navigation" />Navigation and costs</label>
    <label>Nav domain <select name="domain" aria-label="Nav domain">${Object.keys(WATER_PASSABLE)
      .map((domain) => `<option>${domain}</option>`)
      .join("")}</select></label>
    <label><input type="checkbox" name="paths" />Current paths</label>
    <label><input type="checkbox" disabled />Fog (unavailable)</label>
    </div><p>Heights: 0 blue → 7 purple. Navigation: red blocked, cyan cost 1, green cost 2, amber cost 3+. Red edges are disconnected. Nav uses a point profile (radius 0 subcells), not a particular unit's clearance. Cyan lines are current waypoints; amber crosses are targets. Pending searches never invent a direct route. Air has direct movement and no navigation grid.</p>
    <p role="status" aria-label="Overlay status">Overlays off.</p>`;
  panel.append(section);
  const inputs = Object.fromEntries(
    Array.from(section.querySelectorAll<HTMLInputElement>("input[name]")).map((input) => [
      input.name,
      input,
    ]),
  );
  const domain = section.querySelector<HTMLSelectElement>("select");
  const status = section.querySelector<HTMLElement>('[aria-label="Overlay status"]');
  if (!domain || !status) throw new Error("Overlay controls missing");
  let match: ReturnType<typeof createOfflineMatch> | undefined;
  let pending = 0;
  let navSummary = "";
  const options = (): DebugOverlayVisibility => ({
    grid: inputs.grid?.checked ?? false,
    heights: inputs.heights?.checked ?? false,
    navigation: inputs.navigation?.checked ? (domain.value as GroundDomain) : null,
    paths: inputs.paths?.checked ?? false,
  });
  section.addEventListener(
    "change",
    () => {
      const selected = options();
      layer.configure(selected);
      if (!match) return;
      const ticket = ++pending;
      status.textContent = "Requesting worker diagnostics…";
      void match
        .overlays({
          terrain:
            selected.grid || selected.heights || selected.navigation !== null || selected.paths,
          navigation: selected.navigation,
          paths: selected.paths,
        })
        .catch((error: unknown) => {
          if (!signal.aborted && pending === ticket)
            status.textContent =
              error instanceof Error ? error.message : "Overlay diagnostics failed";
        });
    },
    { signal },
  );
  signal.addEventListener(
    "abort",
    () => {
      match = undefined;
      pending++;
      section.remove();
    },
    { once: true },
  );
  return {
    bind(active: ReturnType<typeof createOfflineMatch>) {
      match = active;
      section.disabled = false;
    },
    update(state: OfflineState) {
      if (signal.aborted) return;
      const data = state.overlays;
      if (!data) {
        status.textContent = "Overlays off.";
        return;
      }
      layer.accept(data);
      if (data.navigation)
        navSummary = `${data.navigation.domain}: ${data.navigation.cost.filter((cost) => cost === 0).length}/${data.navigation.cost.length} blocked · radius ${data.navigation.radiusSubcells}`;
      status.textContent = `Diagnostics @${data.tick}${options().navigation ? ` · ${navSummary}` : ""}${options().paths ? ` · ${data.paths?.length ?? 0} current paths` : ""}`;
    },
  };
}
