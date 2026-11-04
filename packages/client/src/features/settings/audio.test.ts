import { expect, test } from "bun:test";
import {
  AUDIO_SETTINGS_KEY,
  defaultAudioSettings,
  readAudioSettings,
  saveAudioSettings,
  validateAudioSettings,
} from "./audio";

test("audio settings own bounded channel values and keep stored preferences after failures", () => {
  const value = defaultAudioSettings();
  let raw: string | null = null;
  const storage = {
    getItem: (key: string) => {
      expect(key).toBe(AUDIO_SETTINGS_KEY);
      return raw;
    },
    setItem: (key: string, next: string) => {
      expect(key).toBe(AUDIO_SETTINGS_KEY);
      raw = next;
    },
  };
  saveAudioSettings(value, storage);
  const owned = readAudioSettings(storage);
  value.volumes.effects = 0;
  expect(owned.volumes.effects).toBe(80);
  for (const bad of [
    null,
    [],
    {},
    { ...value, format: 2 },
    { ...value, muted: 1 },
    { ...value, extra: true },
    { ...value, volumes: { ...value.volumes, effects: 101 } },
    { ...value, volumes: { ...value.volumes, ui: 1.2 } },
    { ...value, volumes: { ...value.volumes, music: NaN } },
    { ...value, volumes: { ...value.volumes, unknown: 50 } },
    Object.create(value),
  ])
    expect(() => validateAudioSettings(bad)).toThrow();
  let called = false;
  const hostile = { ...value };
  Object.defineProperty(hostile, "volumes", {
    get() {
      called = true;
      throw new Error("getter");
    },
  });
  expect(() => validateAudioSettings(hostile)).toThrow();
  expect(called).toBe(false);
  expect(() =>
    saveAudioSettings(value, {
      setItem() {
        throw new Error("quota");
      },
    }),
  ).toThrow("quota");
  expect(readAudioSettings(storage)).toEqual(owned);
  raw = "{";
  expect(readAudioSettings(storage)).toEqual(defaultAudioSettings());
  expect(
    readAudioSettings({
      getItem() {
        throw new Error("blocked");
      },
    }),
  ).toEqual(defaultAudioSettings());
});
