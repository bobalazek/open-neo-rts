import { AUDIO_BUSES, type AudioBusName } from "@open-neo-rts/render";
import { text } from "../../shared";
import {
  AUDIO_TEST,
  defaultAudioSettings,
  previewAudio,
  readAudioSettings,
  saveAudioSettings,
} from "./audio";

/** Native panel fields share this semantic preview/apply/cancel controller. */
export function audioScreen(root: HTMLElement, back: () => void) {
  let saved = readAudioSettings(),
    draft = readAudioSettings(),
    disposed = false,
    testing = false;
  const events = new AbortController();
  root.innerHTML = `<section class="settings-screen"><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.audio.title")}</h1></header><form><label>${text("ui.audio.bus")}<select name="bus">${["master", ...AUDIO_BUSES].map((bus) => `<option value="${bus}">${text(`ui.audio.${bus}` as "ui.audio.master")}</option>`).join("")}</select></label><label>${text("ui.audio.volume")}<select name="volume">${Array.from({ length: 101 }, (_, i) => `<option value="${i}">${i}%</option>`).join("")}</select></label><label><input name="muted" type="checkbox" />${text("ui.audio.muted")}</label><label><input name="muteUnfocused" type="checkbox" />${text("ui.audio.unfocused")}</label><p role="status" aria-live="polite"></p><p role="alert"></p><div class="setup-actions"><button type="button" data-audio-test>${text("ui.audio.test")}</button><button type="button" data-default>${text("ui.settings.defaults")}</button><button type="submit" class="primary">${text("ui.settings.apply")}</button></div></form></section>`;
  const form = root.querySelector("form")!;
  const bus = form.elements.namedItem("bus") as HTMLSelectElement,
    volume = form.elements.namedItem("volume") as HTMLSelectElement;
  const status = root.querySelector('[role="status"]')!,
    error = root.querySelector('[role="alert"]')!;
  const mute = form.elements.namedItem("muted") as HTMLInputElement,
    background = form.elements.namedItem("muteUnfocused") as HTMLInputElement;
  const test = root.querySelector<HTMLButtonElement>("[data-audio-test]")!;
  for (const [control, help] of [
    [bus, "ui.audio.bus-help"],
    [volume, "ui.audio.volume-help"],
    [mute, "ui.audio.muted-help"],
    [background, "ui.audio.unfocused-help"],
    [test, "ui.audio.test-help"],
  ] as const) {
    control.title = text(help);
    control.setAttribute("data-contextual-help", "");
    const description = document.createElement("span");
    description.hidden = true;
    description.id = `audio-${control.getAttribute("name") ?? "test"}-help`;
    description.textContent = text(help);
    control.setAttribute("aria-describedby", description.id);
    control.after(description);
  }
  const changed = () => status.dispatchEvent(new Event("input", { bubbles: true }));
  function fill() {
    volume.value = String(draft.volumes[bus.value as keyof typeof draft.volumes]);
    mute.checked = draft.muted;
    background.checked = draft.muteUnfocused;
  }
  bus.addEventListener("change", fill, { signal: events.signal });
  form.addEventListener(
    "change",
    (event) => {
      if (event.target === bus) return;
      draft.volumes[bus.value as keyof typeof draft.volumes] = Number(volume.value);
      draft.muted = mute.checked;
      draft.muteUnfocused = background.checked;
      previewAudio(draft);
      status.textContent = text("ui.audio.preview");
      error.textContent = "";
      changed();
    },
    { signal: events.signal },
  );
  test.addEventListener(
    "click",
    () => {
      if (testing) return;
      testing = true;
      test.disabled = true;
      status.textContent = "";
      error.textContent = "";
      changed();
      window.dispatchEvent(
        new CustomEvent(AUDIO_TEST, {
          detail: {
            bus: bus.value === "master" ? "ui" : (bus.value as AudioBusName),
            done: (failure?: unknown, played = false) => {
              if (disposed) return;
              testing = false;
              test.disabled = false;
              if (failure) error.textContent = text("ui.audio.failed");
              else status.textContent = text(played ? "ui.audio.tested" : "ui.audio.silent");
              changed();
            },
          },
        }),
      );
    },
    { signal: events.signal },
  );
  root.querySelector("[data-default]")!.addEventListener(
    "click",
    () => {
      draft = defaultAudioSettings();
      fill();
      previewAudio(draft);
      status.textContent = text("ui.audio.preview");
      error.textContent = "";
      changed();
    },
    { signal: events.signal },
  );
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      try {
        saveAudioSettings(draft);
        saved = readAudioSettings();
        status.textContent = text("ui.settings.saved");
        error.textContent = "";
      } catch {
        error.textContent = text("ui.audio.save-failed");
      }
      changed();
    },
    { signal: events.signal },
  );
  root.querySelector("[data-back]")!.addEventListener("click", back, { signal: events.signal });
  fill();
  return {
    dispose() {
      disposed = true;
      events.abort();
      previewAudio(saved);
    },
  };
}
