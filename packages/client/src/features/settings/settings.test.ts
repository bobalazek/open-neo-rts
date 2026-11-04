import { expect, test } from "bun:test";
import {
  DEVICE_SETTINGS_KEY,
  defaultDeviceSettings,
  readDeviceSettings,
  saveDeviceSettings,
  validateDeviceSettings,
} from ".";

test("device settings round-trip independently, reject unknown data and fall back safely", () => {
  let stored: string | null = null;
  const storage = {
    getItem: (key: string) => {
      expect(key).toBe(DEVICE_SETTINGS_KEY);
      return stored;
    },
    setItem: (key: string, value: string) => {
      expect(key).toBe(DEVICE_SETTINGS_KEY);
      stored = value;
    },
  };
  expect(readDeviceSettings(storage)).toEqual(defaultDeviceSettings());
  const selected = {
    ...defaultDeviceSettings(),
    quality: "low" as const,
    uiScale: 150,
    cameraSpeed: 50,
    mouseSensitivity: 150,
    invertDragRotate: true,
    edgeScroll: false,
    reducedMotion: true,
  };
  saveDeviceSettings(selected, storage);
  expect(readDeviceSettings(storage)).toEqual(selected);
  selected.uiScale = 100;
  expect(readDeviceSettings(storage).uiScale).toBe(150);
  for (const value of [
    null,
    [],
    {},
    { ...selected, format: 3 },
    { ...selected, quality: "custom" },
    { ...selected, uiScale: 1000 },
    { ...selected, cameraSpeed: "100" },
    { ...selected, mouseSensitivity: 0 },
    { ...selected, mouseSensitivity: "100" },
    { ...selected, invertDragRotate: 1 },
    { ...selected, edgeScroll: 1 },
    { ...selected, extra: true },
    Object.create(selected),
    { ...selected, [Symbol("extra")]: true },
  ])
    expect(() => validateDeviceSettings(value)).toThrow();
  const getter = { ...selected };
  Object.defineProperty(getter, "quality", {
    enumerable: true,
    get() {
      throw new Error("Getter must not execute");
    },
  });
  expect(() => validateDeviceSettings(getter)).toThrow("Invalid device settings fields");
  stored = "broken-json";
  expect(readDeviceSettings(storage)).toEqual(defaultDeviceSettings());
  expect(
    readDeviceSettings({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
  ).toEqual(defaultDeviceSettings());
  expect(() =>
    saveDeviceSettings(defaultDeviceSettings(), {
      setItem: () => {
        throw new Error("quota");
      },
    }),
  ).toThrow("quota");
});

test("legacy preferences gain mouse defaults without losing saved choices", () => {
  const legacy = {
    format: 1,
    quality: "high" as const,
    uiScale: 125,
    cameraSpeed: 75,
    edgeScroll: false,
    reducedMotion: true,
  };
  expect(readDeviceSettings({ getItem: () => JSON.stringify(legacy) })).toEqual({
    ...legacy,
    format: 2,
    mouseSensitivity: 100,
    invertDragRotate: false,
  });
  expect(() => validateDeviceSettings({ ...legacy, mouseSensitivity: 150 })).toThrow();
});
