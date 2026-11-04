import { text } from "../../shared";
import {
  GUIDANCE_CHANGED,
  type HintLevel,
  readGuidance,
  saveGuidance,
} from "../onboarding/profile";

export function guidanceScreen(root: HTMLElement, back: () => void) {
  const draft = readGuidance();
  let reset = false;
  const abort = new AbortController();
  root.innerHTML = `<section class="settings-screen"><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.guidance.title")}</h1></header><form><label>${text("ui.guidance.level")}<select name="hintLevel">${(["all", "important", "off"] as const).map((level) => `<option value="${level}">${text(`ui.guidance.${level}`)}</option>`).join("")}</select><small>${text("ui.guidance.level-help")}</small></label><p>${text("ui.guidance.profile-help")}</p><p role="status" aria-live="polite"></p><p role="alert"></p><div class="setup-actions"><button type="button" data-reset-hints>${text("ui.guidance.reset")}</button><button type="submit" class="primary">${text("ui.settings.apply")}</button></div></form></section>`;
  const select = root.querySelector("select")!;
  select.setAttribute("aria-label", text("ui.guidance.level"));
  const help = select.closest("label")!.querySelector("small")!;
  help.id = "guidance-level-help";
  select.setAttribute("aria-describedby", help.id);
  const status = root.querySelector('[role="status"]')!;
  const error = root.querySelector('[role="alert"]')!;
  select.value = draft.level;
  const changed = () => status.dispatchEvent(new Event("input", { bubbles: true }));
  select.addEventListener(
    "change",
    () => {
      draft.level = select.value as HintLevel;
      status.textContent = "";
      error.textContent = "";
      changed();
    },
    { signal: abort.signal },
  );
  root.querySelector("[data-reset-hints]")!.addEventListener(
    "click",
    () => {
      reset = true;
      status.textContent = text("ui.guidance.reset-staged");
      changed();
    },
    { signal: abort.signal },
  );
  root.querySelector("form")!.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      try {
        saveGuidance({ ...draft, seen: reset ? [] : readGuidance().seen });
        reset = false;
        window.dispatchEvent(new Event(GUIDANCE_CHANGED));
        status.textContent = text("ui.settings.saved");
        error.textContent = "";
      } catch {
        status.textContent = "";
        error.textContent = text("ui.guidance.save-failed");
      }
      changed();
    },
    { signal: abort.signal },
  );
  root.querySelector("[data-back]")!.addEventListener("click", back, { signal: abort.signal });
  return { dispose: () => abort.abort() };
}
