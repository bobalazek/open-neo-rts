import type { createOfflineMatch } from "../../worker";
import type { createInspector } from "./inspector";

/** Download the worker's canonical scenario; links retain the separately captured initial setup. */
export function createReproductionControls(
  panel: HTMLElement,
  perform: ReturnType<typeof createInspector>["perform"],
  signal: AbortSignal,
) {
  const section = document.createElement("fieldset");
  section.disabled = true;
  section.innerHTML = `<legend>Reproduce session</legend><div class="model-check-controls"><button type="button" name="export">Export command log</button><button type="button" name="copy-link">Copy initial setup link</button></div><label>Initial setup link <input type="url" name="initial-link" readonly /></label><p>Links restore initial map, seed, Forces and initial spawns. Exports capture the accepted command log through the exported tick, including later edits and orders.</p><p role="status" aria-label="Reproduction status">Start a session to export or copy its initial setup.</p>`;
  panel.append(section);
  const download = section.querySelector<HTMLButtonElement>('[name="export"]');
  const copy = section.querySelector<HTMLButtonElement>('[name="copy-link"]');
  const link = section.querySelector<HTMLInputElement>("input");
  const status = section.querySelector<HTMLElement>('[role="status"]');
  if (!download || !copy || !link || !status) throw new Error("Reproduction controls missing");
  let match: ReturnType<typeof createOfflineMatch> | undefined;
  const urls = new Set<string>();
  download.addEventListener(
    "click",
    () => {
      if (!match) return;
      const active = match;
      void perform(async (worker) => {
        if (worker !== active) return;
        const exported = await worker.exportSession();
        if (match !== active || signal.aborted) return;
        const url = URL.createObjectURL(
          new Blob([`${JSON.stringify(exported.scenario, null, 2)}\n`], {
            type: "application/json",
          }),
        );
        urls.add(url);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `debug-session-tick-${exported.tick}.json`;
        anchor.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        }, 1000);
        status.textContent = `Exported tick ${exported.tick} · Hash ${exported.hash}. Replay: bun neo run ${anchor.download} --ticks ${exported.tick}. Accepted commands retain their ticks/sequences; refused commands are omitted.`;
      });
    },
    { signal },
  );
  copy.addEventListener(
    "click",
    async () => {
      if (!match) return;
      link.focus();
      link.select();
      try {
        await navigator.clipboard.writeText(link.value);
        if (!signal.aborted) status.textContent = "Initial setup link copied.";
      } catch {
        if (!signal.aborted)
          status.textContent = "Clipboard unavailable. Copy the selected initial setup link.";
      }
    },
    { signal },
  );
  signal.addEventListener(
    "abort",
    () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
    { once: true },
  );
  return {
    bind(active?: ReturnType<typeof createOfflineMatch>, initial = "") {
      match = active;
      section.disabled = !active;
      copy.disabled = !initial;
      link.parentElement!.hidden = !initial;
      link.value = initial;
      status.textContent = active
        ? initial
          ? "Initial setup link ready. Export includes the current worker command log."
          : "Draft session: export includes edited definitions. A URL cannot carry this unsaved draft."
        : "Start a session to export or copy its initial setup.";
    },
  };
}
