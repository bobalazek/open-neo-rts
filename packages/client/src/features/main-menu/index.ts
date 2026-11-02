// Home, first launch, credits. Phase 2.
import { text } from "../../shared";

export function homeScreen(
  root: HTMLElement,
  navigate: (path: string) => void,
  quickStart: () => void,
) {
  root.innerHTML = `<section class="home-screen"><h1>${text("ui.home.title")}</h1><p class="intro">${text("ui.home.intro")}</p><nav aria-label="${text("ui.home.single-player")}"><button type="button" data-single aria-expanded="false">${text("ui.home.single-player")}</button><div data-single-menu hidden><button type="button" data-skirmish>${text("ui.home.skirmish")}</button></div><button type="button" class="primary" data-quick>${text("ui.home.quick-start")}</button></nav><p class="preview-note">${text("ui.home.preview")}</p><footer><a href="/debug">${text("ui.home.debug")}</a><a href="/debug?terrain=1">${text("ui.home.terrain")}</a><span data-version></span></footer></section>`;
  root.querySelector("[data-single]")?.addEventListener("click", (event) => {
    const menu = root.querySelector<HTMLElement>("[data-single-menu]");
    if (!menu) return;
    menu.hidden = !menu.hidden;
    (event.currentTarget as HTMLButtonElement).setAttribute("aria-expanded", String(!menu.hidden));
  });
  root.querySelector("[data-skirmish]")?.addEventListener("click", () => navigate("/skirmish"));
  root.querySelector("[data-quick]")?.addEventListener("click", quickStart);
}
