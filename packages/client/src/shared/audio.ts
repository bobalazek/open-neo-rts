import { type AudioBusName, createAudioMixer, createAudioTestCue } from "@open-neo-rts/render";
import {
  AUDIO_PREVIEW,
  AUDIO_TEST,
  type AudioSettings,
  readAudioSettings,
  validateAudioSettings,
} from "../features/settings/audio";

/** One app-owned engine survives navigation. Screens only own their playback scopes. */
export function createClientAudio() {
  const mixer = createAudioMixer(),
    ui = mixer.scope(),
    events = new AbortController();
  let settings = readAudioSettings(),
    cue: AudioBuffer | undefined;
  let disposed = false;
  const apply = () =>
    mixer.apply(
      settings.volumes,
      settings.muted || (settings.muteUnfocused && (document.hidden || !document.hasFocus())),
    );
  const unlock = () => {
    void mixer.unlock().catch(() => {});
  };
  for (const name of ["pointerdown", "keydown"])
    window.addEventListener(name, unlock, { capture: true, signal: events.signal });
  for (const name of ["focus", "blur"])
    window.addEventListener(name, apply, { signal: events.signal });
  document.addEventListener("visibilitychange", apply, { signal: events.signal });
  window.addEventListener(
    AUDIO_PREVIEW,
    (event) => {
      try {
        settings = validateAudioSettings((event as CustomEvent<AudioSettings>).detail);
        apply();
      } catch {
        /* Invalid local events cannot change the mixer. */
      }
    },
    { signal: events.signal },
  );
  async function test(bus: AudioBusName) {
    if (disposed) return false;
    await mixer.unlock();
    cue ??= createAudioTestCue();
    return ui.play(cue, { bus, priority: 2 });
  }
  window.addEventListener(
    AUDIO_TEST,
    (event) => {
      const request = (
        event as CustomEvent<{
          bus: AudioBusName;
          done: (error?: unknown, played?: boolean) => void;
        }>
      ).detail;
      void test(request.bus).then((played) => request.done(undefined, played), request.done);
    },
    { signal: events.signal },
  );
  document.addEventListener(
    "click",
    (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("button") ||
        event.target.closest("[data-audio-test]")
      )
        return;
      // A late decode never queues old clicks for the next user gesture.
      cue ??= typeof AudioBuffer === "function" ? createAudioTestCue() : undefined;
      if (cue) void ui.play(cue, { bus: "ui" }).catch(() => {});
    },
    { signal: events.signal },
  );
  apply();
  return {
    mixer,
    dispose() {
      disposed = true;
      events.abort();
      ui.dispose();
      mixer.dispose();
    },
  };
}
