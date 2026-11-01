import type { createRenderer } from "@open-neo-rts/render";
import { createRenderCounters } from "@open-neo-rts/render";
import type { OfflineState } from "../../worker";

/** Session-owned counters. UI updates are throttled without changing the render loop. */
export function createPerformanceOverlay(
  panel: HTMLElement,
  renderer: Awaited<ReturnType<typeof createRenderer>>,
) {
  const output = document.createElement("output");
  output.setAttribute("aria-label", "Performance counters");
  panel.querySelector('[aria-label="Session status"]')?.after(output);
  const counters = createRenderCounters(renderer.scene);
  let tickMs: number | undefined;
  let updatedAt = 0;
  const observer = renderer.scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    if (now - updatedAt < 500) return;
    updatedAt = now;
    const frame = counters.read();
    output.textContent = `FPS ${frame.fps.toFixed(1)} · Frame ${frame.frameMs.toFixed(2)} ms · Draw calls ${frame.drawCalls} · Scene instances ${frame.instances} · Worker step ${tickMs === undefined ? "not sampled" : `${tickMs.toFixed(2)} ms`}`;
    for (const [key, value] of Object.entries(frame)) output.dataset[key] = String(value);
    if (tickMs !== undefined) output.dataset.tickMs = String(tickMs);
  });
  return {
    update(state: OfflineState) {
      tickMs = state.tickMs;
    },
    dispose() {
      renderer.scene.onAfterRenderObservable.remove(observer);
      counters.dispose();
      output.remove();
    },
  };
}
