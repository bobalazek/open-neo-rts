import { content } from "virtual:normal-catalog";
import type { MatchRecord } from "@open-neo-rts/sim";
import { createReplayWorker, type ReplayState } from "../../worker/replay";
import { loadMap } from "../debug/maps";
import { map, normalSkirmish, type SkirmishSetup } from "../skirmish/setup";
import { replayCompatibility, type SavedReplay } from "./storage";

export function savedReplay(
  record: MatchRecord,
  config: SkirmishSetup,
  winner: number | null,
): SavedReplay {
  if (!content.cosmeticHash) throw new Error("Core content is unavailable");
  return {
    format: 1,
    id: `replay-${crypto.randomUUID()}`,
    name: map.name,
    createdAt: Date.now(),
    config: { ...config },
    packs: content.packs,
    cosmeticHash: content.cosmeticHash,
    winner,
    record,
  };
}
export async function installedReplay(replay: SavedReplay, signal: AbortSignal) {
  const reason = replayCompatibility(replay, content.packs, content.cosmeticHash);
  if (reason) throw new Error(reason);
  if (!content.catalog) throw new Error("Core content is unavailable");
  const loaded = await loadMap(`core.${map.id}`);
  signal.throwIfAborted();
  return { loaded, setup: normalSkirmish(replay.config, loaded.grid, content.catalog) };
}
/** Verify before persisting any imported record; cancellation terminates the isolated candidate. */
export async function verifyReplay(
  replay: SavedReplay,
  signal: AbortSignal,
  progress: (state: ReplayState) => void,
) {
  const { setup } = await installedReplay(replay, signal);
  let latest: ReplayState | undefined,
    rejectFailure: (error: Error) => void = () => {};
  const failed = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  const worker = createReplayWorker(
    (state) => {
      latest = state;
      progress(state);
    },
    (error) => rejectFailure(error),
  );
  const cancel = () => worker.dispose("Replay import cancelled");
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    worker.dispose("Replay verification timed out");
    rejectFailure(new Error("Replay verification timed out"));
  }, 60000);
  try {
    signal.throwIfAborted();
    await Promise.race([worker.request({ type: "init", setup, record: replay.record }), failed]);
    signal.throwIfAborted();
    if (!latest || latest.winner === undefined) throw new Error("Replay has no verified result");
    return latest.winner;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    worker.dispose();
  }
}
