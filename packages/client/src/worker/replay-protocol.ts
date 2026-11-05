import {
  MAX_REPLAY_MARKERS,
  type MatchRecord,
  type MatchSetup,
  type ReplayMarker,
  type SeatSnapshot,
} from "@open-neo-rts/sim";
import { isMatchRecord, isRecord, isWorkerReply } from "./protocol";

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type ReplayVision = number | "all";
export interface ReplayState {
  phase: "preparing" | "seeking" | "ready";
  tick: number;
  duration: number;
  epoch: number;
  paused: boolean;
  speed: number;
  vision: ReplayVision;
  winner?: number | null;
  snapshot?: SeatSnapshot;
  markers?: readonly ReplayMarker[];
}
export type ReplayRequest =
  | { type: "init"; record: MatchRecord; setup: MatchSetup }
  | { type: "export-record" }
  | { type: "seek"; tick: number }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: number }
  | { type: "vision"; vision: ReplayVision };
export interface ReplayReply {
  id: number;
  error?: string;
  state?: ReplayState;
  record?: MatchRecord;
}

export function isReplayReply(value: unknown): value is ReplayReply {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) < 0 ||
    Number(value.id) > 0x7fffffff ||
    Object.keys(value).some((key) => !["id", "error", "state", "record"].includes(key))
  )
    return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.record !== undefined && (!isMatchRecord(value.record) || value.record.format !== 2))
    return false;
  if (value.state === undefined) return true;
  const state = value.state;
  if (
    !isRecord(state) ||
    !(state.phase === "preparing" || state.phase === "seeking" || state.phase === "ready") ||
    Object.keys(state).some(
      (key) =>
        ![
          "phase",
          "duration",
          "tick",
          "epoch",
          "paused",
          "speed",
          "vision",
          ...(state.phase === "ready" ? ["snapshot", "winner", "markers"] : []),
        ].includes(key),
    ) ||
    !Number.isSafeInteger(state.duration) ||
    Number(state.duration) < 1 ||
    Number(state.duration) > 144000 ||
    !Number.isSafeInteger(state.tick) ||
    Number(state.tick) < 0 ||
    Number(state.tick) > Number(state.duration) ||
    !Number.isSafeInteger(state.epoch) ||
    Number(state.epoch) < 0 ||
    Number(state.epoch) > 0x7fffffff ||
    typeof state.paused !== "boolean" ||
    !REPLAY_SPEEDS.some((speed) => speed === state.speed) ||
    !(
      state.vision === "all" ||
      (Number.isSafeInteger(state.vision) &&
        Number(state.vision) > 0 &&
        Number(state.vision) <= 0x7fffffff)
    )
  )
    return false;
  if (state.phase !== "ready") return state.snapshot === undefined;
  if (
    state.markers !== undefined &&
    (!Array.isArray(state.markers) ||
      state.markers.length > MAX_REPLAY_MARKERS ||
      !Array.from(state.markers).every(
        (marker, index, markers) =>
          isRecord(marker) &&
          Number.isSafeInteger(marker.tick) &&
          Number(marker.tick) >= 1 &&
          Number(marker.tick) <= Number(state.duration) &&
          (index === 0 || Number(marker.tick) >= Number(markers[index - 1].tick)) &&
          (marker.type === "combat"
            ? Object.keys(marker).length === 4 &&
              [marker.x, marker.y].every(
                (value) =>
                  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 0x7fffffff,
              )
            : marker.type === "elimination" &&
              Object.keys(marker).length === 4 &&
              Number.isSafeInteger(marker.force) &&
              Number(marker.force) >= 0 &&
              Number(marker.force) <= 0x7fffffff &&
              (marker.reason === "eliminated" || marker.reason === "surrendered")),
      ))
  )
    return false;
  return (
    (state.winner === null ||
      (Number.isSafeInteger(state.winner) &&
        Number(state.winner) >= 0 &&
        Number(state.winner) <= 0x7fffffff)) &&
    isRecord(state.snapshot) &&
    Object.keys(state.snapshot).every((key) =>
      [
        "groundFire",
        "remains",
        "statistics",
        "victory",
        "tick",
        "mode",
        "entities",
        "banks",
        "power",
        "constructionRequests",
        "fog",
        "ghosts",
        "combatEvents",
        "productionExits",
        "resourceNodes",
      ].includes(key),
    ) &&
    state.snapshot.mode === "controlled" &&
    state.snapshot.tick === state.tick &&
    isWorkerReply({
      id: value.id,
      state: { paused: state.paused, speed: state.speed, snapshot: state.snapshot },
    })
  );
}
