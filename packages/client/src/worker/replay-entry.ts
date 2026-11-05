import { createMatchPlayback, type MatchSetup } from "@open-neo-rts/sim";
import { isRecord } from "./protocol";
import {
  REPLAY_SPEEDS,
  type ReplayReply,
  type ReplayState,
  type ReplayVision,
} from "./replay-protocol";

const host = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(reply: ReplayReply): void;
};
let playback: ReturnType<typeof createMatchPlayback> | undefined, setup: MatchSetup | undefined;
let phase: ReplayState["phase"] = "preparing",
  vision: ReplayVision = "all",
  paused = true,
  speed = 1,
  epoch = 0,
  target = 0,
  initializing = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let winner: number | null | undefined;
let projectedEpoch = -1;
function publish(id = 0) {
  if (!playback) return;
  const snapshot =
    phase === "ready" ? playback.snapshot(vision, projectedEpoch !== epoch) : undefined;
  if (snapshot) projectedEpoch = epoch;
  host.postMessage({
    id,
    state: {
      phase,
      tick: playback.tick,
      duration: playback.duration,
      epoch,
      paused,
      speed,
      vision,
      ...(snapshot && { snapshot, winner }),
    },
  });
}
function schedule(delay = 0) {
  clearTimeout(timer);
  timer = setTimeout(pump, delay);
}
function pump() {
  if (!playback) return;
  try {
    if (phase === "preparing") {
      if (playback.prepare(20)) {
        winner = playback.kernel.victory!.snapshot().result!.winner;
        phase = "seeking";
        target = 0;
      }
    } else if (phase === "seeking") {
      if (playback.seek(target, 20)) phase = "ready";
    } else if (!paused) {
      const next = Math.min(playback.duration, playback.tick + Math.max(1, Math.floor(speed)));
      playback.seek(next, 8);
      if (playback.tick === playback.duration) paused = true;
    }
    if (phase === "ready" && initializing) {
      const id = initializing;
      initializing = 0;
      publish(id);
    } else publish();
    if (phase !== "ready") schedule();
    else if (!paused) schedule((50 * Math.max(1, Math.floor(speed))) / speed);
  } catch (error) {
    clearTimeout(timer);
    host.postMessage({ id: 0, error: error instanceof Error ? error.message : "Replay failed" });
    playback = undefined;
  }
}
host.onmessage = ({ data }) => {
  if (!isRecord(data) || !Number.isSafeInteger(data.id) || Number(data.id) < 1) return;
  const id = Number(data.id);
  try {
    if (data.type === "init") {
      if (playback || initializing) throw new Error("Replay already initialized");
      if (Object.keys(data).length !== 4 || !isRecord(data.setup))
        throw new Error("Invalid replay setup");
      setup = data.setup as unknown as MatchSetup;
      playback = createMatchPlayback(data.record, setup);
      initializing = id;
      publish();
      schedule();
      return;
    }
    if (!playback || !setup) throw new Error("Replay is not initialized");
    if (data.type === "export-record") {
      if (Object.keys(data).length !== 2 || phase !== "ready")
        throw new Error("Replay verification or seek is unfinished");
      host.postMessage({ id, record: playback.exportRecord() });
      return;
    }
    if (Object.keys(data).length !== 3) throw new Error("Invalid replay request");
    switch (data.type) {
      case "seek":
        if (
          !playback.verified ||
          !Number.isInteger(data.tick) ||
          Number(data.tick) < 0 ||
          Number(data.tick) > playback.duration
        )
          throw new Error("Invalid replay target");
        target = Number(data.tick);
        phase = "seeking";
        epoch++;
        schedule();
        break;
      case "pause":
        if (typeof data.paused !== "boolean") throw new Error("Invalid replay pause");
        paused = data.paused;
        if (phase !== "ready" || !paused) schedule();
        else clearTimeout(timer);
        break;
      case "speed":
        if (!REPLAY_SPEEDS.some((value) => value === data.speed))
          throw new Error("Invalid replay speed");
        speed = Number(data.speed);
        if (phase !== "ready" || !paused) schedule();
        break;
      case "vision":
        if (
          !(
            data.vision === "all" ||
            (typeof data.vision === "number" && setup.seats.includes(data.vision))
          )
        )
          throw new Error("Unknown replay vision");
        vision = data.vision === "all" ? "all" : Number(data.vision);
        epoch++;
        break;
      default:
        throw new Error("Replay is read-only");
    }
    publish(id);
  } catch (error) {
    host.postMessage({
      id,
      error: error instanceof Error ? error.message : "Invalid replay request",
    });
  }
};
