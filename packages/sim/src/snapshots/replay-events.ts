import { canObserveCombatEvent } from "../features/events/combat";
import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";

/** Presentation grouping, not a gameplay clock: one combat marker per ten-second interval. */
export const REPLAY_COMBAT_MARKER_INTERVAL = 200;
// Two hours of combat intervals plus at most eight Force outcomes.
export const MAX_REPLAY_MARKERS = 728;
export type ReplayMarker =
  | { type: "combat"; tick: number; x: number; y: number }
  | { type: "elimination"; tick: number; force: number; reason: "eliminated" | "surrendered" };

/** Capture once during full history verification, never again during seeking. */
export function createReplayEvents(setup: MatchSetup) {
  const histories = new Map<number | "all", ReplayMarker[]>(
    ["all" as const, ...setup.seats].map((vision) => [vision, []]),
  );
  const combatIntervals = new Map<number | "all", number>();
  return {
    capture(kernel: Kernel) {
      const interval = Math.floor((kernel.tick - 1) / REPLAY_COMBAT_MARKER_INTERVAL);
      const damage = (kernel.combatEvents ?? []).filter(
        (event) => event.type === "damage" && (event.amount ?? 0) > 0,
      );
      const eliminated = kernel
        .victory!.snapshot()
        .forces.filter((force) => force.reason !== "active" && force.tick === kernel.tick);
      for (const [vision, markers] of histories) {
        if (combatIntervals.get(vision) !== interval) {
          const event = damage.find((event) =>
            canObserveCombatEvent(kernel, vision === "all" ? 0 : vision, event, vision === "all"),
          );
          if (event) {
            markers.push({ type: "combat", tick: kernel.tick, x: event.x, y: event.y });
            combatIntervals.set(vision, interval);
          }
        }
        for (const force of eliminated)
          if (force.reason !== "active")
            markers.push({
              type: "elimination",
              tick: kernel.tick,
              force: force.force,
              reason: force.reason,
            });
      }
    },
    markers(vision: number | "all") {
      const markers = histories.get(vision);
      if (!markers) throw new Error("Unknown replay vision");
      return markers.map((marker) => ({ ...marker }));
    },
  };
}
