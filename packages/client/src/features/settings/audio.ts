import { AUDIO_BUSES, type AudioVolumes } from "@open-neo-rts/render";

export const AUDIO_SETTINGS_KEY = "open-neo-rts.audio.v1";
export const AUDIO_PREVIEW = "open-neo-rts.audio-preview";
export const AUDIO_TEST = "open-neo-rts.audio-test";
export interface AudioSettings {
  format: 1;
  volumes: AudioVolumes;
  muted: boolean;
  muteUnfocused: boolean;
}
export const defaultAudioSettings = (): AudioSettings => ({
  format: 1,
  volumes: { master: 70, music: 60, effects: 80, voices: 80, announcer: 90, ui: 60, ambience: 50 },
  muted: false,
  muteUnfocused: true,
});
function fields(value: unknown, names: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error("Invalid audio settings");
  const data = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== names.length ||
    Object.keys(data).some((name) => !names.includes(name)) ||
    Object.values(data).some((field) => !("value" in field))
  )
    throw new Error("Invalid audio settings fields");
  return Object.fromEntries(
    Object.entries(data).map(([name, field]) => [name, field.value]),
  ) as Record<string, unknown>;
}
export function validateAudioSettings(value: unknown): AudioSettings {
  const input = fields(value, ["format", "volumes", "muted", "muteUnfocused"]);
  const volumes = fields(input.volumes, ["master", ...AUDIO_BUSES]);
  if (
    input.format !== 1 ||
    typeof input.muted !== "boolean" ||
    typeof input.muteUnfocused !== "boolean" ||
    Object.values(volumes).some(
      (v) => typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100,
    )
  )
    throw new Error("Invalid audio settings values");
  return {
    format: 1,
    volumes: volumes as AudioVolumes,
    muted: input.muted,
    muteUnfocused: input.muteUnfocused,
  };
}
export function readAudioSettings(storage?: Pick<Storage, "getItem">): AudioSettings {
  try {
    const raw = (storage ?? localStorage).getItem(AUDIO_SETTINGS_KEY);
    return raw === null || raw.length > 4096
      ? defaultAudioSettings()
      : validateAudioSettings(JSON.parse(raw));
  } catch {
    return defaultAudioSettings();
  }
}
export function saveAudioSettings(value: AudioSettings, storage?: Pick<Storage, "setItem">) {
  (storage ?? localStorage).setItem(
    AUDIO_SETTINGS_KEY,
    JSON.stringify(validateAudioSettings(value)),
  );
}
export function previewAudio(value: AudioSettings) {
  window.dispatchEvent(new CustomEvent(AUDIO_PREVIEW, { detail: validateAudioSettings(value) }));
}
