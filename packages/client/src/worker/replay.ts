import { isReplayReply, type ReplayRequest, type ReplayState } from "./replay-protocol";

export {
  REPLAY_SPEEDS,
  type ReplayRequest,
  type ReplayState,
  type ReplayVision,
} from "./replay-protocol";

/** A replay owns a different worker and deliberately exposes no command, save or debug API. */
export function createReplayWorker(
  update: (state: ReplayState) => void,
  error: (error: Error) => void,
) {
  const worker = new Worker("/replay-worker.js", { type: "module" });
  let disposed = false,
    next = 0;
  const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  function dispose(reason = "Replay disposed") {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    for (const request of pending.values()) request.reject(new Error(reason));
    pending.clear();
  }
  function fail(reason: string) {
    if (disposed) return;
    dispose(reason);
    error(new Error(reason));
  }
  worker.onerror = () => fail("Replay worker failed");
  worker.onmessageerror = () => fail("Invalid replay worker message");
  worker.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (disposed) return;
    if (!isReplayReply(data)) return fail("Invalid replay worker reply");
    if (data.id === 0 && data.error) return fail(data.error);
    const request = pending.get(data.id);
    if (data.id && !request) return;
    if (data.state) update(data.state);
    if (request) {
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve();
    }
  };
  return {
    request(message: ReplayRequest): Promise<void> {
      if (disposed) return Promise.reject(new Error("Replay disposed"));
      return new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, ...message });
        } catch (cause) {
          pending.delete(id);
          reject(cause);
        }
      });
    },
    dispose,
  };
}
