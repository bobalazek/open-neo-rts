import type { GameplayDefinition, SeatSnapshot } from "@open-neo-rts/sim";
import { text } from "../../shared";
import { decorateAction } from "../match/icons";
import { firstPlayableRoster } from "../skirmish/roster";
import { type ContextHint, createContextHints } from ".";
import { GUIDANCE_CHANGED, GUIDANCE_KEY, readGuidance, saveGuidance } from "./profile";

/** Semantic controls feed the existing native HUD; this owner never issues simulation commands. */
export function createMatchGuidance(
  root: HTMLElement,
  options: {
    force: number;
    definitions: readonly GameplayDefinition[];
    selection: () => readonly string[];
    manual: (definition?: string) => void;
    present: () => void;
  },
  signal: AbortSignal,
) {
  let profile = readGuidance(),
    help = false;
  let current: ContextHint | undefined;
  const detector = createContextHints(
    options.force,
    new Map(options.definitions.map((d) => [d.id, d])),
  );
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = text("ui.guidance.hud-help");
  toggle.dataset.hudHelpToggle = "";
  toggle.setAttribute("aria-pressed", "false");
  decorateAction(toggle, "help");
  root.querySelector(".match-top")!.append(toggle);
  const panel = document.createElement("section");
  panel.className = "match-guidance";
  panel.innerHTML = `<!-- THESIS: optional labels and one brief contextual hint keep the battlefield primary.
OWN-WORLD: incumbent graphite command stations and authored line pictograms.
STORY: recognize a current event, read one action, open its installed manual entry if needed.
FIRST VIEWPORT: quiet by default; opt-in region labels, one bounded hint below global feedback.
FORM: code-led Operate extension; native Babylon presentation with semantic fallback.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
<div data-hint hidden><p role="status" aria-live="polite"></p><button type="button" data-hint-more>${text("ui.guidance.more")}</button><button type="button" data-hint-dismiss>${text("ui.guidance.dismiss")}</button><small data-guidance-error role="status"></small></div><ul data-hud-help hidden>${["objective", "status", "global", "economy", "selection", "commands", "groups", "map", "notices"].map((id) => `<li data-help-region="${id}">${text(`ui.guidance.help-${id}` as "ui.guidance.help-map")}</li>`).join("")}</ul><button type="button" data-selection-manual hidden>${text("ui.guidance.more")}</button>`;
  root.querySelector(".match-hud")!.append(panel);
  const hint = panel.querySelector<HTMLElement>("[data-hint]")!;
  const message = hint.querySelector("p")!;
  const error = panel.querySelector("[data-guidance-error]")!;
  const selectedManual = panel.querySelector<HTMLButtonElement>("[data-selection-manual]")!;
  let selectedDefinition: string | undefined;
  const roster = new Set([...firstPlayableRoster, "core.structure:neutral/resource-extractor"]);
  toggle.addEventListener(
    "click",
    () => {
      help = !help;
      toggle.setAttribute("aria-pressed", String(help));
      panel.querySelector<HTMLElement>("[data-hud-help]")!.hidden = !help;
      hint.hidden = help || !current;
      options.present();
    },
    { signal },
  );
  panel.querySelector("[data-hint-dismiss]")!.addEventListener(
    "click",
    () => {
      detector.dismiss();
      current = undefined;
      hint.hidden = true;
      options.present();
    },
    { signal },
  );
  panel
    .querySelector("[data-hint-more]")!
    .addEventListener("click", () => options.manual(current?.definition ?? "guide:economy"), {
      signal,
    });
  selectedManual.addEventListener("click", () => options.manual(selectedDefinition), { signal });
  const refresh = () => {
    profile = readGuidance();
    if (profile.level === "off") {
      detector.dismiss();
      current = undefined;
      hint.hidden = true;
    }
    options.present();
  };
  window.addEventListener(GUIDANCE_CHANGED, refresh, { signal });
  window.addEventListener(
    "storage",
    (event) => {
      if (event.key === GUIDANCE_KEY || event.key === null) refresh();
    },
    { signal },
  );
  return {
    update(snapshot: SeatSnapshot, enabled: boolean) {
      const selected = new Set(options.selection());
      const definitions = new Set(
        snapshot.entities.filter((e) => selected.has(e.handle)).map((e) => e.definition),
      );
      selectedDefinition = definitions.size === 1 ? [...definitions][0] : undefined;
      selectedManual.hidden = !selectedDefinition || !roster.has(selectedDefinition);
      const next = detector.update(snapshot, profile, enabled && !help);
      if (next !== current) {
        current = next;
        message.textContent = next ? text(`ui.guidance.hint-${next.id}`) : "";
      }
      hint.hidden =
        !current || help || snapshot.mode !== "controlled" || !!snapshot.victory?.result;
      if (current && enabled && !help && !profile.seen.includes(current.id)) {
        profile.seen.push(current.id);
        try {
          const saved = readGuidance();
          saveGuidance({ ...saved, seen: [...new Set([...saved.seen, ...profile.seen])] });
          error.textContent = "";
        } catch {
          error.textContent = text("ui.guidance.session-only");
        }
      }
    },
  };
}
