import type { Kernel } from "../../kernel";
import { canObserveEventSource } from ".";

export const MAX_COMBAT_EVENTS = 8192;
export const COMBAT_EVENT_TYPES = ["launch", "flight", "impact", "damage", "death"] as const;
export type CombatEventType = (typeof COMBAT_EVENT_TYPES)[number];
export interface CombatEvent {
  readonly type: CombatEventType;
  readonly x: number;
  readonly y: number;
  readonly force: number;
  readonly round?: number;
  readonly entity?: number;
  readonly amount?: number;
  readonly projectile?: "instant" | "beam" | "bullet" | "missile";
}
export type PresentedCombatEvent = Omit<CombatEvent, "force" | "round" | "entity"> & {
  readonly handle?: string;
  readonly entity?: string;
};

/** Presentation output only: event capacity cannot change damage, allocation or simulation hashes. */
export function emitCombatEvent(kernel: Kernel, event: CombatEvent): void {
  kernel.combatEvents ??= [];
  const events = kernel.combatEvents;
  if (events.length < MAX_COMBAT_EVENTS) events.push(event);
  else if (event.type === "death") {
    const disposable = events.findIndex((prior) => prior.type !== "death");
    if (disposable >= 0) {
      events.splice(disposable, 1);
      events.push(event);
    }
  }
}

export function projectCombatEvents(
  kernel: Kernel,
  seat: number,
  handleOf: (round: number) => string,
  actorHandle: (entity: number, type: CombatEventType) => string | undefined,
  replayAll = false,
): PresentedCombatEvent[] {
  const owned = kernel.visibility?.forcesForSeat(seat) ?? [];
  return (kernel.combatEvents ?? [])
    .filter(
      (event) =>
        replayAll ||
        canObserveEventSource(kernel, seat, {
          x: Math.floor(event.x / 1024),
          y: Math.floor(event.y / 1024),
        }) ||
        (["launch", "damage", "death"].includes(event.type) && owned.includes(event.force)),
    )
    .map(({ force: _force, round, entity, ...event }) => {
      const actor = entity === undefined ? undefined : actorHandle(entity, event.type);
      return {
        ...event,
        ...(round !== undefined && { handle: handleOf(round) }),
        ...(actor && { entity: actor }),
      };
    });
}
