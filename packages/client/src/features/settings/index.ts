// Device preferences and one shared Home/in-match settings panel. Phase 2.
import type { GraphicsQuality } from "@open-neo-rts/render";
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";

export const DEVICE_SETTINGS_KEY = "open-neo-rts.settings.v1";
export const UI_SCALES = [75, 100, 125, 150] as const;
export const CAMERA_SPEEDS = [50, 75, 100, 150, 200] as const;
export interface DeviceSettings {
  format: 1;
  quality: GraphicsQuality;
  uiScale: number;
  cameraSpeed: number;
  edgeScroll: boolean;
  reducedMotion: boolean;
}
export const defaultDeviceSettings = (): DeviceSettings => ({
  format: 1,
  quality: "medium",
  uiScale: 100,
  cameraSpeed: 100,
  edgeScroll: true,
  reducedMotion: false,
});

export function validateDeviceSettings(value: unknown): DeviceSettings {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new Error("Invalid device settings");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== 6 ||
    Object.keys(fields).sort().join(",") !==
      "cameraSpeed,edgeScroll,format,quality,reducedMotion,uiScale" ||
    Object.values(fields).some((field) => !("value" in field))
  )
    throw new Error("Invalid device settings fields");
  const input = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.value]),
  ) as Record<string, unknown>;
  const quality = (["low", "medium", "high", "ultra"] as const).find(
    (quality) => quality === input.quality,
  );
  if (
    input.format !== 1 ||
    !quality ||
    typeof input.uiScale !== "number" ||
    typeof input.cameraSpeed !== "number" ||
    !UI_SCALES.some((scale) => scale === input.uiScale) ||
    !CAMERA_SPEEDS.some((speed) => speed === input.cameraSpeed) ||
    typeof input.edgeScroll !== "boolean" ||
    typeof input.reducedMotion !== "boolean"
  )
    throw new Error("Invalid device settings values");
  return {
    format: 1,
    quality,
    uiScale: input.uiScale,
    cameraSpeed: input.cameraSpeed,
    edgeScroll: input.edgeScroll,
    reducedMotion: input.reducedMotion,
  };
}

export function readDeviceSettings(storage?: Pick<Storage, "getItem">): DeviceSettings {
  try {
    const saved = (storage ?? localStorage).getItem(DEVICE_SETTINGS_KEY);
    return saved === null ? defaultDeviceSettings() : validateDeviceSettings(JSON.parse(saved));
  } catch {
    return defaultDeviceSettings();
  }
}
export function saveDeviceSettings(value: DeviceSettings, storage?: Pick<Storage, "setItem">) {
  (storage ?? localStorage).setItem(
    DEVICE_SETTINGS_KEY,
    JSON.stringify(validateDeviceSettings(value)),
  );
}
export function applyInterfaceScale(value: DeviceSettings) {
  document.documentElement.style.fontSize = `${value.uiScale}%`;
}

export function settingsScreen(
  root: HTMLElement,
  apply: (settings: DeviceSettings) => void,
  back: () => void,
  canvas?: HTMLCanvasElement,
) {
  let saved = readDeviceSettings();
  root.innerHTML = `<section class="settings-screen"><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.settings.title")}</h1></header><form><label>${text("ui.settings.quality")}<select name="quality" title="${text("ui.settings.quality-help")}">${["low", "medium", "high", "ultra"].map((quality) => `<option value="${quality}">${text(`ui.settings.${quality}` as "ui.settings.low")}</option>`).join("")}</select><small>${text("ui.settings.quality-help")}</small></label><label>${text("ui.settings.scale")}<select name="uiScale" title="${text("ui.settings.scale-help")}">${UI_SCALES.map((scale) => `<option value="${scale}">${scale}%</option>`).join("")}</select><small>${text("ui.settings.scale-help")}</small></label><label>${text("ui.settings.camera")}<select name="cameraSpeed" title="${text("ui.settings.camera-help")}">${CAMERA_SPEEDS.map((speed) => `<option value="${speed}">${speed}%</option>`).join("")}</select><small>${text("ui.settings.camera-help")}</small></label><label class="settings-check"><input type="checkbox" name="edgeScroll" />${text("ui.settings.edge")}<small>${text("ui.settings.edge-help")}</small></label><label class="settings-check"><input type="checkbox" name="reducedMotion" />${text("ui.settings.motion")}<small>${text("ui.settings.motion-help")}</small></label><p role="status" aria-live="polite" data-status></p><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-reset>${text("ui.settings.defaults")}</button><button type="submit" class="primary">${text("ui.settings.apply")}</button></div></form></section>`;
  const form = root.querySelector("form");
  const error = root.querySelector("[data-error]");
  const status = root.querySelector("[data-status]");
  if (!form || !error || !status) throw new Error("Settings controls missing");
  let panel: ReturnType<typeof mountNativePanel> | undefined;
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const fill = (value: DeviceSettings) => {
    for (const name of ["quality", "uiScale", "cameraSpeed"] as const)
      field(name).value = String(value[name]);
    for (const name of ["edgeScroll", "reducedMotion"] as const)
      (field(name) as HTMLInputElement).checked = value[name];
  };
  const read = () =>
    validateDeviceSettings({
      format: 1,
      quality: field("quality").value,
      uiScale: Number(field("uiScale").value),
      cameraSpeed: Number(field("cameraSpeed").value),
      edgeScroll: (field("edgeScroll") as HTMLInputElement).checked,
      reducedMotion: (field("reducedMotion") as HTMLInputElement).checked,
    });
  for (const [name, label] of [
    ["quality", "ui.settings.quality"],
    ["uiScale", "ui.settings.scale"],
    ["cameraSpeed", "ui.settings.camera"],
    ["edgeScroll", "ui.settings.edge"],
    ["reducedMotion", "ui.settings.motion"],
  ] as const) {
    const control = field(name);
    control.setAttribute("aria-label", text(label));
    const help = control.closest("label")?.querySelector("small");
    if (help) {
      help.id = `device-${name}-help`;
      control.setAttribute("aria-describedby", help.id);
    }
  }
  fill(saved);
  form.addEventListener("change", () => {
    status.textContent = "";
    try {
      apply(read());
      error.textContent = "";
    } catch {
      error.textContent = text("ui.settings.invalid");
    }
    panel?.update();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const next = read();
      apply(next);
      saveDeviceSettings(next);
      saved = next;
      status.textContent = text("ui.settings.saved");
      error.textContent = "";
    } catch {
      try {
        apply(saved);
      } catch {
        /* The saved preferences still remain unchanged if rendering is unavailable. */
      }
      error.textContent = text("ui.settings.save-failed");
      status.textContent = "";
    }
    panel?.update();
  });
  root.querySelector("[data-reset]")?.addEventListener("click", () => {
    fill(defaultDeviceSettings());
    apply(read());
    status.textContent = "";
    error.textContent = "";
    panel?.update();
  });
  root.querySelector("[data-back]")?.addEventListener("click", back);
  if (canvas)
    panel = mountNativePanel(root, root.querySelector<HTMLElement>(".settings-screen")!, canvas, {
      id: () => "settings",
      title: () => text("ui.settings.title"),
      modal: false,
    });
  return {
    cancel: () => {
      panel?.dispose();
      apply(saved);
    },
  };
}
