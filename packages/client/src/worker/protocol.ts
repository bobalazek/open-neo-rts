import type { DebugSpawn, MatchSetup, ProjectionMode, SeatSnapshot } from "@open-neo-rts/sim";

export interface OfflineSetup {
  setup: MatchSetup;
  seat: number;
  mode: ProjectionMode;
}
export interface OfflineState {
  snapshot: SeatSnapshot;
  paused: boolean;
  speed: number;
  /** Full-state hash is a debug inspection tool, never part of a normal seat view. */
  hash?: string;
}
export type WorkerRequest =
  | { type: "init"; options: OfflineSetup }
  | { type: "command"; command: { type: string; payload: unknown } }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: number }
  | { type: "placement"; spawn: DebugSpawn }
  | { type: "step" | "export" };

export interface WorkerReply {
  id: number;
  state?: OfflineState;
  result?: unknown;
  error?: string;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the copied wire shape before a consumer sees it. */
export function isWorkerReply(value: unknown): value is WorkerReply {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || Number(value.id) < 0) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.state === undefined) return true;
  const state = value.state;
  if (
    !isRecord(state) ||
    typeof state.paused !== "boolean" ||
    typeof state.speed !== "number" ||
    ![0.25, 0.5, 1, 2, 4, 8].includes(state.speed)
  )
    return false;
  if (
    state.hash !== undefined &&
    (typeof state.hash !== "string" || !/^[a-f0-9]{16}$/.test(state.hash))
  )
    return false;
  const snapshot = state.snapshot;
  if (
    !isRecord(snapshot) ||
    !Number.isSafeInteger(snapshot.tick) ||
    Number(snapshot.tick) < 0 ||
    !["controlled", "debug-no-fog"].includes(String(snapshot.mode)) ||
    !Array.isArray(snapshot.entities)
  )
    return false;
  return snapshot.entities.every((entity: unknown) => {
    if (
      !isRecord(entity) ||
      typeof entity.handle !== "string" ||
      typeof entity.definition !== "string"
    )
      return false;
    if (
      ![entity.force, entity.x, entity.y, entity.facing, entity.health, entity.maxHealth].every(
        Number.isInteger,
      )
    )
      return false;
    return (
      entity.order === null ||
      (isRecord(entity.order) &&
        entity.order.type === "move" &&
        Number.isInteger(entity.order.x) &&
        Number.isInteger(entity.order.y))
    );
  });
}
