import type { createPlacementOverlay } from "@open-neo-rts/render";
import type { DebugSpawn } from "@open-neo-rts/sim";
import type { MatchResource } from "@open-neo-rts/sim/maps";
import type { PlacementDiagnostic } from "../../worker";
import { type createSpawnPalette, spawnAtCell } from "./palette";

/** Coalesce requests; only the current intent and a current authoritative tick may paint. */
export function createPlacementQueries(
  query: (spawn: DebugSpawn) => Promise<PlacementDiagnostic>,
  pending: (spawn: DebugSpawn | null) => void,
  show: (spawn: DebugSpawn, result: PlacementDiagnostic) => void,
  failed: (error: unknown) => void,
) {
  let target: DebugSpawn | null = null;
  let key = "";
  let revision = 0;
  let tick = -1;
  let shownRevision = -1;
  let shownTick = -1;
  let running: Promise<void> | undefined;
  let disposed = false;
  function pump(): Promise<void> {
    if (running) return running;
    running = (async () => {
      while (!disposed && target && (shownRevision !== revision || shownTick < tick)) {
        const requested = target;
        const ticket = revision;
        try {
          const result = await query(requested);
          if (disposed || ticket !== revision || result.tick < tick) continue;
          shownRevision = ticket;
          shownTick = result.tick;
          show(requested, result);
        } catch (error) {
          if (disposed || ticket !== revision) continue;
          shownRevision = ticket;
          shownTick = tick;
          failed(error);
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  return {
    update(spawn: DebugSpawn | null, atTick: number) {
      if (disposed) return Promise.resolve();
      const next = JSON.stringify(spawn);
      const changed = next !== key || atTick > tick;
      if (next !== key) {
        target = spawn;
        key = next;
        revision++;
      }
      tick = Math.max(tick, atTick);
      if (changed) pending(target);
      if (!target || (shownRevision === revision && shownTick >= tick))
        return running ?? Promise.resolve();
      return pump();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      target = null;
      revision++;
      pending(null);
    },
  };
}

export function bindPlacementPreview(
  canvas: HTMLCanvasElement,
  palette: ReturnType<typeof createSpawnPalette>,
  layer: ReturnType<typeof createPlacementOverlay>,
  options: {
    enabled: () => boolean;
    pickCell: (x: number, y: number) => { x: number; y: number } | null;
    viewKey: () => string;
    query: (spawn: DebugSpawn) => Promise<PlacementDiagnostic>;
    resources?: readonly MatchResource[];
  },
  signal: AbortSignal,
) {
  let pointer: { x: number; y: number } | null = null;
  let input = "";
  let payload: DebugSpawn | null = null;
  let tick = 0;
  const queries = createPlacementQueries(
    options.query,
    (spawn) => {
      layer.accept(null);
      palette.previewCells.replaceChildren();
      palette.preview.textContent = spawn
        ? "Checking authoritative placement…"
        : "Hover the map in Spawn mode to preview placement.";
    },
    (spawn, result) => {
      layer.accept(result);
      const reasons =
        result.failure ??
        [
          ...new Set(result.cells?.flatMap((cell) => (cell.failure ? [cell.failure] : [])) ?? []),
        ].join(", ");
      palette.preview.textContent = `${result.ok ? "Allowed" : "Refused"} @${result.tick} · Cell ${Math.floor(spawn.x / 1024)}, ${Math.floor(spawn.y / 1024)} · ${(((spawn.facing >>> 14) + 3) % 4) * 90}°${reasons ? ` · ${reasons}` : ""}`;
      palette.previewCells.replaceChildren(
        ...(result.cells ?? []).map((cell) => {
          const row = document.createElement("li");
          row.textContent = `${cell.x}, ${cell.y} · ${cell.rule ?? "prop"} · ${cell.failure ?? "allowed"}`;
          row.dataset.failure = cell.failure ?? "";
          return row;
        }),
      );
    },
    (error) => {
      palette.preview.textContent = `Placement preview unavailable: ${error instanceof Error ? error.message : String(error)}`;
    },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    },
    { signal },
  );
  const leave = () => {
    pointer = null;
    payload = null;
    input = "";
    void queries.update(null, tick);
  };
  canvas.addEventListener("pointerleave", leave, { signal });
  canvas.addEventListener("pointercancel", leave, { signal });
  window.addEventListener("blur", leave, { signal });
  signal.addEventListener("abort", () => queries.dispose(), { once: true });
  return {
    update(atTick: number) {
      tick = atTick;
      void queries.update(payload, tick);
    },
    frame() {
      const selection = palette.selection();
      const bounds = canvas.getBoundingClientRect();
      const next = JSON.stringify([
        options.enabled(),
        pointer,
        options.viewKey(),
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        selection?.entry.definition.id,
        selection?.force,
        selection?.rotation,
      ]);
      if (next !== input) {
        input = next;
        const cell =
          options.enabled() && pointer && selection ? options.pickCell(pointer.x, pointer.y) : null;
        payload =
          cell && selection
            ? spawnAtCell(
                selection.entry,
                selection.force,
                cell.x,
                cell.y,
                selection.rotation,
                options.resources,
              )
            : null;
      }
      void queries.update(payload, tick);
    },
  };
}
