// Main-thread lifecycle only; gameplay imports belong exclusively in entry.ts.
import type { DebugOverlayOptions, DebugSpawn } from "@open-neo-rts/sim";
import {
  isDebugSessionExport,
  isPlacementDiagnostic,
  isWorkerReply,
  type OfflineSetup,
  type OfflineState,
  type WorkerRequest,
} from "./protocol";

export type { OfflineSetup, OfflineState, PlacementDiagnostic } from "./protocol";

/** One worker per match. Disposal rejects outstanding requests and ignores late replies. */
export function createOfflineMatch(
  onState: (state: OfflineState) => void,
  onError?: (error: Error) => void,
) {
  const worker = new Worker("/sim-worker.js", { type: "module" });
  let nextId = 1;
  let disposed = false;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  function dispose(reason = "Match disposed") {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    for (const request of pending.values()) request.reject(new Error(reason));
    pending.clear();
  }
  function fail(reason: string) {
    if (disposed) return;
    dispose(reason);
    onError?.(new Error(reason));
  }
  worker.onerror = () => fail("Simulation worker failed");
  worker.onmessageerror = () => fail("Invalid simulation worker message");
  worker.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (disposed) return;
    if (!isWorkerReply(data)) {
      fail("Invalid simulation worker reply");
      return;
    }
    const reply = data;
    if (reply.id !== 0 && !pending.has(reply.id)) return;
    const request = pending.get(reply.id);
    if (request) {
      pending.delete(reply.id);
      if (reply.error) request.reject(new Error(reply.error));
      else request.resolve(reply.result);
    }
    if (reply.state) onState(reply.state);
  };
  function request(message: WorkerRequest): Promise<unknown> {
    if (disposed) return Promise.reject(new Error("Match disposed"));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, ...message });
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error("Unable to send worker request"));
      }
    });
  }
  return {
    init: (options: OfflineSetup) => request({ type: "init", options }),
    command: (type: string, payload: unknown) =>
      request({ type: "command", command: { type, payload } }),
    pause: (paused: boolean) => request({ type: "pause", paused }),
    step: () => request({ type: "step" }),
    placement: (spawn: DebugSpawn) =>
      request({ type: "placement", spawn }).then((value) => {
        if (!isPlacementDiagnostic(value)) throw new Error("Invalid placement diagnostic");
        return value;
      }),
    speed: (speed: number) => request({ type: "speed", speed }),
    exportLog: () => request({ type: "export" }),
    exportSession: () =>
      request({ type: "export-session" }).then((value) => {
        if (!isDebugSessionExport(value)) throw new Error("Invalid debug session export");
        return value;
      }),
    overlays: (options: DebugOverlayOptions) => request({ type: "overlays", options }),
    dispose,
  };
}
