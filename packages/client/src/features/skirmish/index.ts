// Skirmish setup screen. Phase 2.
import { createSkirmishScene, type SkirmishField } from "@open-neo-rts/render";
import { text } from "../../shared";
import { loadMap } from "../debug/maps";
import { readDeviceSettings } from "../settings";
import {
  defaultSkirmish,
  faction,
  map,
  numericSettings,
  SETUP_STORAGE_KEY,
  type SkirmishSetup,
  validateSkirmish,
} from "./setup";

export function skirmishScreen(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  current: SkirmishSetup,
  start: (setup: SkirmishSetup) => void,
  back: () => void,
  notice = "",
) {
  root.innerHTML = `<section class="setup-screen"><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.skirmish.title")}</h1></header><form><div class="setup-columns"><section><h2>${text("ui.skirmish.forces")}</h2><div class="force-row"><strong>${text("ui.skirmish.you")}</strong><span>${faction.name}</span><label>${text("ui.skirmish.your-spawn")}<select name="yourSpawn"></select></label></div><div class="force-row"><strong>${text("ui.skirmish.opponent")}</strong><span>${faction.name}</span><label>${text("ui.skirmish.other-spawn")}<select name="otherSpawn"></select></label></div><p class="preview-note">${text("ui.skirmish.preview")}</p></section><aside><h2>${text("ui.skirmish.map")}</h2><h3>${map.name}</h3><p>${map.description}</p><p>128 × 128</p></aside></div><fieldset><legend>${text("ui.skirmish.rules")}</legend><div class="setup-fields"><label>${text("ui.skirmish.seed")}<input name="seed" inputmode="numeric" type="text" /></label>${numericSettings.map((id) => `<label>${text(id === "startingCredits" ? "ui.skirmish.credits" : id === "popCap" ? "ui.skirmish.population" : "ui.skirmish.structures")}<input name="${id}" inputmode="numeric" type="text" /></label>`).join("")}<label class="setup-toggle"><input type="checkbox" name="veterancy" />${text("ui.skirmish.veterancy")}</label></div><p>${text("ui.skirmish.rules-note")}</p></fieldset><p role="status" aria-live="polite" data-status></p><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-save>${text("ui.skirmish.save")}</button><button type="button" data-load>${text("ui.skirmish.load")}</button><button type="button" data-defaults>${text("ui.skirmish.defaults")}</button><button type="submit" class="primary">${text("ui.skirmish.start")}</button></div></form></section>`;
  const form = root.querySelector("form"),
    status = root.querySelector<HTMLElement>("[data-status]"),
    error = root.querySelector<HTMLElement>("[data-error]"),
    submit = root.querySelector<HTMLButtonElement>('[type="submit"]');
  if (!form || !status || !error || !submit) throw new Error("Skirmish controls missing");
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const signal = new AbortController();
  let disposed = false;
  let gui: Awaited<ReturnType<typeof createSkirmishScene>> | undefined;
  const previousAttributes = ["tabindex", "aria-label", "aria-hidden"].map(
    (name) => [name, canvas.getAttribute(name)] as const,
  );
  canvas.tabIndex = -1;
  canvas.removeAttribute("aria-label");
  canvas.setAttribute("aria-hidden", "true");
  const names = ["yourSpawn", "otherSpawn", "seed", ...numericSettings];
  function sync() {
    gui?.update({
      values: Object.fromEntries(names.map((name) => [name, field(name).value])),
      veterancy: (field("veterancy") as HTMLInputElement).checked,
      status: status!.textContent ?? "",
      error: error!.textContent ?? "",
      canStart: !submit!.disabled,
    });
  }
  for (const name of ["yourSpawn", "otherSpawn"])
    (field(name) as HTMLSelectElement).replaceChildren(
      ...map.spawns.map(
        (spawn) => new Option(text(`ui.spawn.${spawn.id}` as "ui.spawn.north-west"), spawn.id),
      ),
    );
  const fill = (config: SkirmishSetup) => {
    for (const [key, value] of Object.entries(config))
      if (key === "veterancy") (field(key) as HTMLInputElement).checked = value === true;
      else if (key !== "format") field(key).value = String(value);
  };
  const read = () =>
    validateSkirmish({
      format: 1,
      yourSpawn: field("yourSpawn").value,
      otherSpawn: field("otherSpawn").value,
      veterancy: (field("veterancy") as HTMLInputElement).checked,
      ...Object.fromEntries(
        ["seed", ...numericSettings].map((key) => [
          key,
          /^(0|[1-9]\d*)$/.test(field(key).value) ? Number(field(key).value) : NaN,
        ]),
      ),
    });
  const validate = () => {
    try {
      read();
      error.textContent = "";
      submit.disabled = false;
    } catch (failure) {
      error.textContent =
        failure instanceof Error ? failure.message : text("ui.skirmish.load-failed");
      submit.disabled = true;
    }
    sync();
  };
  fill(current);
  validate();
  status.textContent = notice;
  form.addEventListener("input", validate);
  form.addEventListener("change", validate);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    validate();
    if (!submit.disabled) start(read());
  });
  root.querySelector("[data-back]")?.addEventListener("click", back);
  root.querySelector("[data-save]")?.addEventListener("click", () => {
    try {
      const config = read();
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(config));
      status.textContent = text("ui.skirmish.saved");
    } catch {
      status.textContent = text("ui.skirmish.save-failed");
    }
    sync();
  });
  root.querySelector("[data-load]")?.addEventListener("click", () => {
    try {
      fill(validateSkirmish(JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "null")));
      validate();
      status.textContent = text("ui.skirmish.loaded");
    } catch {
      status.textContent = text("ui.skirmish.load-failed");
    }
    sync();
  });
  root.querySelector("[data-defaults]")?.addEventListener("click", () => {
    fill(defaultSkirmish());
    validate();
    status.textContent = "";
    sync();
  });
  const fields: SkirmishField[] = names.map((name) => {
    const element = field(name);
    return {
      id: name,
      label: element.labels?.[0]?.firstChild?.textContent?.trim() ?? name,
      value: element.value,
      ...(element instanceof HTMLSelectElement && {
        choices: [...element.options].map((option) => ({
          value: option.value,
          label: option.text,
        })),
      }),
    };
  });
  function action(selector: string, id: string, primary = false) {
    const button = root.querySelector<HTMLButtonElement>(selector)!;
    button.dataset.setupAction = id;
    return {
      id,
      label: button.textContent ?? "",
      primary,
      activate: () => {
        button.focus({ preventScroll: true });
        button.click();
      },
    };
  }
  const backAction = action("[data-back]", "back");
  const actions = [
    action("[data-save]", "save"),
    action("[data-load]", "load"),
    action("[data-defaults]", "defaults"),
    action('[type="submit"]', "start", true),
  ];
  root.addEventListener(
    "focusin",
    (event) => {
      const element = event.target;
      // shortcut: semantic text edits show a focus frame; mirror caret/selection during input polish.
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement)
        gui?.focus(element.name);
      else if (element instanceof HTMLButtonElement) gui?.focus(element.dataset.setupAction);
    },
    { signal: signal.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (document.activeElement !== canvas || event.key !== "Tab") return;
      const controls = [
        ...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
          "input, select, button",
        ),
      ].filter((control) => !control.disabled);
      const index = controls.findIndex((control) => control.name === gui?.activeField());
      const next = controls[index + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        event.stopImmediatePropagation();
        next.focus({ preventScroll: true });
      }
    },
    { capture: true, signal: signal.signal },
  );
  canvas.hidden = false;
  const preview = loadMap(`core.${map.id}`).catch(() => undefined);
  void createSkirmishScene(
    canvas,
    {
      title: text("ui.skirmish.title"),
      back: backAction,
      forcesTitle: text("ui.skirmish.forces"),
      forces: [text("ui.skirmish.you"), text("ui.skirmish.opponent")],
      faction: faction.name,
      previewNote: text("ui.skirmish.preview"),
      rulesTitle: text("ui.skirmish.rules"),
      rulesNote: text("ui.skirmish.rules-note"),
      veterancy: text("ui.skirmish.veterancy"),
      mapTitle: text("ui.skirmish.map"),
      mapName: map.name,
      mapDescription: map.description,
      previewUnavailable: text("ui.skirmish.preview-unavailable"),
      spawns: map.spawns,
      resources: map.resources,
      fields,
      actions,
      scale: readDeviceSettings().uiScale / 100,
      change: (name, value) => {
        const control = field(name);
        if (name === "veterancy") (control as HTMLInputElement).checked = value === true;
        else control.value = String(value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
      },
      enter: () => form.requestSubmit(),
    },
    signal.signal,
  )
    .then(async (scene) => {
      if (disposed) {
        scene.dispose();
        return;
      }
      gui = scene;
      sync();
      await scene.drawn();
      if (disposed) return;
      root.classList.add("setup-native");
      canvas.dataset.setup = "ready";
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement)
        gui.focus(active.name);
      void preview.then((map) => {
        if (!disposed && map) scene.setMap(map.grid);
      });
    })
    .catch(() => {
      if (!disposed) canvas.hidden = true;
    });
  return () => {
    if (disposed) return;
    disposed = true;
    signal.abort();
    gui?.dispose();
    root.classList.remove("setup-native");
    delete canvas.dataset.setup;
    canvas.hidden = true;
    for (const [name, value] of previousAttributes) {
      if (value === null) canvas.removeAttribute(name);
      else canvas.setAttribute(name, value);
    }
  };
}
