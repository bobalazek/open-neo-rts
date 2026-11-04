import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { MAPS } from "../debug/maps";
import { DRAFT_OPPONENTS, type DraftScenario, defaultDraftScenario } from "./scenarios";

/** Collect preview-only settings before freezing content; cancel never changes the draft. */
export function chooseDraftScenario(
  signal: AbortSignal,
  previous = defaultDraftScenario(),
  mirrorAvailable = true,
): Promise<DraftScenario | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "match-menu";
    dialog.setAttribute("aria-label", text("ui.editor.scenario-title"));
    const canvas = document.createElement("canvas");
    canvas.className = "native-menu-canvas";
    canvas.hidden = true;
    canvas.tabIndex = -1;
    canvas.setAttribute("aria-hidden", "true");
    const section = document.createElement("section");
    const heading = document.createElement("h1");
    heading.textContent = text("ui.editor.scenario-title");
    section.append(heading);
    const field = (caption: Parameters<typeof text>[0], name: string) => {
      const label = document.createElement("label"),
        select = document.createElement("select");
      label.textContent = text(caption);
      select.name = name;
      select.setAttribute("aria-label", text(caption));
      label.append(select);
      section.append(label);
      return select;
    };
    const map = field("ui.skirmish.map", "draft-map"),
      opponent = field("ui.editor.scenario-opponent", "draft-opponent"),
      yours = field("ui.skirmish.your-spawn", "draft-your-spawn"),
      other = field("ui.skirmish.other-spawn", "draft-other-spawn");
    for (const { definition } of MAPS)
      map.add(new Option(definition.name, `core.${definition.id}`));
    for (const id of DRAFT_OPPONENTS.filter((id) => id !== "draft-mirror" || mirrorAvailable))
      opponent.add(new Option(text(`ui.editor.scenario-${id}`), id));
    map.value = previous.map;
    opponent.value =
      previous.opponent === "draft-mirror" && !mirrorAvailable ? "idle" : previous.opponent;
    const seedLabel = document.createElement("label"),
      seed = document.createElement("input");
    seedLabel.textContent = text("ui.skirmish.seed");
    seed.name = "draft-seed";
    seed.type = "text";
    seed.inputMode = "numeric";
    seed.value = String(previous.seed);
    seed.setAttribute("aria-label", text("ui.skirmish.seed"));
    seedLabel.append(seed);
    section.append(seedLabel);
    const note = document.createElement("p");
    note.textContent = text("ui.editor.scenario-help");
    section.append(note);
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    section.append(error);
    const cancel = document.createElement("button"),
      start = document.createElement("button");
    cancel.type = start.type = "button";
    cancel.textContent = text("ui.editor.scenario-cancel");
    start.textContent = text("ui.editor.scenario-start");
    start.className = "primary";
    cancel.setAttribute("data-panel-footer", "");
    start.setAttribute("data-panel-footer", "");
    section.append(cancel, start);
    dialog.append(canvas, section);
    document.body.append(dialog);
    dialog.showModal();
    const panel = mountNativePanel(dialog, section, canvas, {
      id: () => "draft-scenario",
      title: () => text("ui.editor.scenario-title"),
      modal: true,
    });
    const read = (): DraftScenario => {
      if (!/^(0|[1-9]\d*)$/.test(seed.value) || Number(seed.value) > 0xffffffff)
        throw new Error(text("ui.editor.scenario-seed-error"));
      if (!yours.value || yours.value === other.value)
        throw new Error(text("ui.skirmish.spawn-error"));
      return {
        map: map.value,
        opponent: opponent.value as DraftScenario["opponent"],
        yourSpawn: yours.value,
        otherSpawn: other.value,
        seed: Number(seed.value),
      };
    };
    const validate = () => {
      try {
        read();
        error.textContent = "";
        start.disabled = false;
      } catch (failure) {
        error.textContent = (failure as Error).message;
        start.disabled = true;
      }
      panel.update();
    };
    const spawns = (retain = false) => {
      const selected = MAPS.find(({ definition }) => `core.${definition.id}` === map.value)!;
      for (const field of [yours, other])
        field.replaceChildren(
          ...selected.definition.spawns.map(
            (spawn) => new Option(spawn.id.replaceAll("-", " "), spawn.id),
          ),
        );
      yours.value = retain ? previous.yourSpawn : selected.definition.spawns[0]!.id;
      other.value = retain ? previous.otherSpawn : selected.definition.spawns.at(-1)!.id;
      validate();
    };
    let closed = false;
    const close = (result?: DraftScenario) => {
      if (closed) return;
      closed = true;
      signal.removeEventListener("abort", abort);
      panel.dispose();
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const abort = () => close();
    signal.addEventListener("abort", abort, { once: true });
    cancel.addEventListener("click", abort);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    map.addEventListener("change", () => spawns());
    for (const control of [opponent, yours, other, seed]) {
      control.addEventListener("input", validate);
      control.addEventListener("change", validate);
    }
    start.addEventListener("click", () => {
      if (!start.disabled) close(read());
    });
    spawns(true);
    map.focus();
  });
}
