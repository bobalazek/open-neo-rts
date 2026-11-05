import { createModelPreview } from "@open-neo-rts/render";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { readDeviceSettings } from "../settings";
import type { ManualEntry } from "./catalog";

/** An isolated model view never loads or changes a match. */
export function inspectManualModel(entry: ManualEntry) {
  const origin = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "manual-model";
  dialog.setAttribute("aria-label", entry.name);
  dialog.innerHTML = `<canvas class="manual-model-canvas" tabindex="0"></canvas><canvas class="manual-model-controls" hidden></canvas><section><h1></h1><p>${text("ui.manual.model-help")}</p><p role="status" aria-live="polite"></p><p role="alert"></p><button type="button" data-back>${text("ui.manual.browse")}</button><button type="button" data-retry>${text("ui.common.retry")}</button></section>`;
  const canvas = dialog.querySelector<HTMLCanvasElement>(".manual-model-canvas")!;
  canvas.setAttribute("aria-label", `${entry.name}. ${text("ui.manual.model-help")}`);
  const semantics = dialog.querySelector<HTMLElement>("section")!;
  semantics.querySelector("h1")!.textContent = entry.name;
  const status = semantics.querySelector<HTMLElement>('[role="status"]')!;
  const error = semantics.querySelector<HTMLElement>('[role="alert"]')!;
  const retry = semantics.querySelector<HTMLButtonElement>("[data-retry]")!;
  const abort = new AbortController();
  let preview: Awaited<ReturnType<typeof createModelPreview>> | undefined;
  let disposed = false,
    pending = false;
  document.body.append(dialog);
  dialog.showModal();
  const panel = mountNativePanel(
    dialog,
    semantics,
    dialog.querySelector<HTMLCanvasElement>(".manual-model-controls")!,
    {
      id: () => "manual-model",
      title: () => entry.name,
      modal: false,
    },
  );
  async function load() {
    if (disposed || pending) return;
    pending = true;
    retry.hidden = true;
    status.textContent = text("ui.manual.model-loading");
    error.textContent = "";
    panel.update();
    try {
      if (!preview) {
        const next = await createModelPreview(canvas);
        if (disposed) {
          next.dispose();
          return;
        }
        preview = next;
      }
      if (!entry.model) throw new Error("Missing model");
      const response = await fetch(entry.model, { signal: abort.signal });
      if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (disposed) return;
      const clips = await preview.load(bytes, "#81d4ed", { materials: entry.materials });
      if (disposed) return;
      if (
        !readDeviceSettings().reducedMotion &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches &&
        clips?.includes("idle")
      )
        preview.play("idle");
      status.textContent = "";
    } catch {
      if (!disposed) {
        error.textContent = text("ui.manual.model-error");
        status.textContent = "";
        retry.hidden = false;
      }
    } finally {
      pending = false;
      if (!disposed) panel.update();
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    panel.dispose();
    preview?.dispose();
    dialog.close();
    dialog.remove();
    if (origin instanceof HTMLElement && origin.isConnected) origin.focus({ preventScroll: true });
  }
  dialog.querySelector("[data-back]")!.addEventListener("click", dispose);
  retry.addEventListener("click", () => void load());
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispose();
  });
  void load();
  return dispose;
}
