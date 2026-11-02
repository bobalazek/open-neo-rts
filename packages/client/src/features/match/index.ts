import { createEntityPresentation, createFogPresentation } from "@open-neo-rts/render";
import type { SeatSnapshot } from "@open-neo-rts/sim";

type Presentation = ReturnType<typeof createEntityPresentation>;
type Arguments = Parameters<typeof createEntityPresentation>;

/** Reusable projected-state consumer; a screen/worker host owns this disposable layer and its clock. */
export function createMatchPresentation(
  scene: Arguments[0],
  terrain: Arguments[1],
  resolveModel: Arguments[2],
  onSelectionChanged: (handles: readonly string[]) => void = () => {},
) {
  const fog = createFogPresentation(scene, terrain.width, terrain.height);
  const colors = new Map<number, string>();
  let live: Presentation, ghosts: Presentation;
  let selected: string[] = [];
  let allowed = new Set<string>();
  let group: string | undefined;
  let tick: number | undefined;
  let rate = 1;
  let disposed = false;
  const select = (handles: readonly string[]) => {
    const next = [...new Set(handles.filter((handle) => allowed.has(handle)))];
    const changed =
      selected.length !== next.length || selected.some((handle, i) => handle !== next[i]);
    selected = next;
    live.select(selected);
    if (changed) onSelectionChanged([...selected]);
  };
  function owners() {
    live = createEntityPresentation(scene, terrain, resolveModel);
    ghosts = createEntityPresentation(scene, terrain, resolveModel, { ghost: true });
    live.setPlaybackRate(rate);
    for (const [force, color] of colors) live.setForceColor(force, color);
  }
  function reset() {
    if (disposed) throw new Error("Match presentation is disposed");
    live.dispose();
    ghosts.dispose();
    fog.reset();
    allowed.clear();
    owners();
    select([]);
    group = undefined;
    tick = undefined;
  }
  owners();
  return {
    async accept(snapshot: SeatSnapshot, nowMs: number) {
      if (disposed) throw new Error("Match presentation is disposed");
      const next = `${snapshot.mode}:${snapshot.fog?.map((grid) => grid.group).join(",") ?? ""}`;
      if ((group !== undefined && next !== group) || (tick !== undefined && snapshot.tick < tick))
        reset();
      fog.accept(snapshot);
      group = next;
      tick = snapshot.tick;
      allowed = new Set(snapshot.entities.map((entity) => entity.handle));
      select(selected);
      // Ghosts contain only last-observed public fields; no live instance is consulted.
      const remembered: SeatSnapshot = {
        tick: snapshot.tick,
        mode: snapshot.mode,
        entities:
          snapshot.mode === "debug-no-fog"
            ? []
            : (snapshot.ghosts ?? []).map((ghost) => ({
                handle: `ghost:${ghost.handle}`,
                definition: ghost.definition,
                force: ghost.force,
                x: ghost.x,
                y: ghost.y,
                facing: ghost.facing,
                health: ghost.health,
                maxHealth: ghost.maxHealth,
                order: null,
              })),
      };
      await Promise.all([live.accept(snapshot, nowMs), ghosts.accept(remembered, nowMs)]);
    },
    render(nowMs: number) {
      live.render(nowMs);
      ghosts.render(nowMs);
    },
    select,
    selection: () => [...selected],
    pick: (x: number, y: number) => live.pick(x, y),
    inRectangle: (left: number, top: number, right: number, bottom: number) =>
      live.inRectangle(left, top, right, bottom),
    setForceColor(force: number, color: string) {
      live.setForceColor(force, color);
      colors.set(force, color);
    },
    setPlaybackRate(value: number) {
      live.setPlaybackRate(value);
      rate = value;
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      allowed.clear();
      select([]);
      live.dispose();
      ghosts.dispose();
      fog.dispose();
    },
  };
}
