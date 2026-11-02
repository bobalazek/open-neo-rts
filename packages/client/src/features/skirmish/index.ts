// Skirmish setup screen. Phase 2.
import { text } from "../../shared";
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
  current: SkirmishSetup,
  start: (setup: SkirmishSetup) => void,
  back: () => void,
  notice = "",
) {
  root.innerHTML = `<section class="setup-screen"><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.skirmish.title")}</h1></header><form><div class="setup-columns"><section><h2>${text("ui.skirmish.forces")}</h2><div class="force-row"><strong>${text("ui.skirmish.you")}</strong><span>${faction.name}</span><label>${text("ui.skirmish.your-spawn")}<select name="yourSpawn"></select></label></div><div class="force-row"><strong>${text("ui.skirmish.opponent")}</strong><span>${faction.name}</span><label>${text("ui.skirmish.other-spawn")}<select name="otherSpawn"></select></label></div><p class="preview-note">${text("ui.skirmish.preview")}</p></section><aside><h2>${text("ui.skirmish.map")}</h2><h3>${map.name}</h3><p>${map.description}</p><p>128 × 128</p></aside></div><fieldset><legend>${text("ui.skirmish.rules")}</legend><div class="setup-fields"><label>${text("ui.skirmish.seed")}<input name="seed" inputmode="numeric" type="text" /></label>${numericSettings.map((id) => `<label>${text(id === "startingCredits" ? "ui.skirmish.credits" : id === "popCap" ? "ui.skirmish.population" : "ui.skirmish.structures")}<input name="${id}" inputmode="numeric" type="text" /></label>`).join("")}</div><p>${text("ui.skirmish.rules-note")}</p></fieldset><p role="status" aria-live="polite" data-status></p><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-save>${text("ui.skirmish.save")}</button><button type="button" data-load>${text("ui.skirmish.load")}</button><button type="button" data-defaults>${text("ui.skirmish.defaults")}</button><button type="submit" class="primary">${text("ui.skirmish.start")}</button></div></form></section>`;
  const form = root.querySelector("form"),
    status = root.querySelector<HTMLElement>("[data-status]"),
    error = root.querySelector<HTMLElement>("[data-error]"),
    submit = root.querySelector<HTMLButtonElement>('[type="submit"]');
  if (!form || !status || !error || !submit) throw new Error("Skirmish controls missing");
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  for (const name of ["yourSpawn", "otherSpawn"])
    (field(name) as HTMLSelectElement).replaceChildren(
      ...map.spawns.map(
        (spawn) => new Option(text(`ui.spawn.${spawn.id}` as "ui.spawn.north-west"), spawn.id),
      ),
    );
  const fill = (config: SkirmishSetup) => {
    for (const [key, value] of Object.entries(config))
      if (key !== "format") field(key).value = String(value);
  };
  const read = () =>
    validateSkirmish({
      format: 1,
      yourSpawn: field("yourSpawn").value,
      otherSpawn: field("otherSpawn").value,
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
  });
  root.querySelector("[data-load]")?.addEventListener("click", () => {
    try {
      fill(validateSkirmish(JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "null")));
      validate();
      status.textContent = text("ui.skirmish.loaded");
    } catch {
      status.textContent = text("ui.skirmish.load-failed");
    }
  });
  root.querySelector("[data-defaults]")?.addEventListener("click", () => {
    fill(defaultSkirmish());
    validate();
    status.textContent = "";
  });
}
