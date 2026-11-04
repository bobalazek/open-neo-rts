// Native Babylon Home, with semantic controls for keyboard and assistive technology.
import { builtins } from "virtual:debug-builtins";
import { createMenuScene, type MenuAction } from "@open-neo-rts/render";
import { text } from "../../shared";
import { readDeviceSettings } from "../settings";

export function homeScreen(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  navigate: (path: string) => void,
  quickStart: () => void,
  version: string,
) {
  root.innerHTML = `<section class="home-screen"><h1>${text("ui.home.title")}</h1><p class="intro">${text("ui.home.intro")}</p><nav aria-label="${text("ui.home.single-player")}"></nav><p class="preview-note">${text("ui.home.preview")}</p><footer><span data-version></span></footer><p role="status" data-menu-status></p></section>`;
  root.querySelector("[data-version]")!.textContent = version;
  const signal = new AbortController();
  const previousCanvasAttributes = ["tabindex", "aria-label", "aria-hidden"].map(
    (name) => [name, canvas.getAttribute(name)] as const,
  );
  canvas.tabIndex = -1;
  canvas.removeAttribute("aria-label");
  canvas.setAttribute("aria-hidden", "true");
  let disposed = false;
  let revision = 0;
  let singlePlayer = false;
  let resume: (() => void) | undefined;
  let gui: Awaited<ReturnType<typeof createMenuScene>> | undefined;
  const nav = root.querySelector("nav")!;
  const footer = root.querySelector("footer")!;
  const controls = new Map<string, HTMLButtonElement>();
  let buttonEvents = new AbortController();
  function refresh() {
    buttonEvents.abort();
    buttonEvents = new AbortController();
    const active =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement.dataset.action
        : undefined;
    for (const button of controls.values()) button.remove();
    controls.clear();
    const actions: MenuAction[] = [];
    function action(
      id: string,
      label: string,
      activate: () => void,
      primary = false,
      secondary = false,
    ) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.action = id;
      if (id === "single") button.setAttribute("aria-expanded", String(singlePlayer));
      button.addEventListener("click", activate, { signal: buttonEvents.signal });
      button.addEventListener("focus", () => gui?.focus(id), { signal: buttonEvents.signal });
      button.addEventListener("blur", () => gui?.focus(), { signal: buttonEvents.signal });
      (secondary ? footer : nav).append(button);
      controls.set(id, button);
      actions.push({
        id,
        label,
        primary,
        secondary,
        activate: () => {
          button.focus({ preventScroll: true });
          button.click();
        },
      });
    }
    if (resume) action("continue", text("ui.saves.continue"), resume, true);
    if (singlePlayer) {
      action("skirmish", text("ui.home.skirmish"), () => navigate("/skirmish"), true);
      action("load", text("ui.saves.title"), () => navigate("/load"));
      action("replays", text("ui.replays.title"), () => navigate("/replays"));
      action("back", text("ui.common.back"), () => {
        singlePlayer = false;
        refresh();
        controls.get("single")?.focus();
      });
    } else {
      action("quick", text("ui.home.quick-start"), quickStart, !resume);
      action("single", text("ui.home.single-player"), () => {
        singlePlayer = true;
        refresh();
        controls.get("skirmish")?.focus();
      });
      action("settings", text("ui.settings.title"), () => navigate("/settings"));
      action("manual", text("ui.manual.title"), () => navigate("/manual"));
    }
    action(
      "debug",
      text("ui.home.debug"),
      () => {
        location.href = "/debug";
      },
      false,
      true,
    );
    action(
      "terrain",
      text("ui.home.terrain"),
      () => {
        location.href = "/debug?terrain=1";
      },
      false,
      true,
    );
    action(
      "content-tools",
      text("ui.tools.title"),
      () => {
        location.href = "/tools/content";
      },
      false,
      true,
    );
    if (gui) {
      const ticket = ++revision;
      canvas.dataset.menu = "drawing";
      void gui.setActions(actions).then(() => {
        if (disposed || ticket !== revision) return;
        root.classList.add("home-native");
        canvas.dataset.menu = "ready";
      });
    }
    if (active) controls.get(active)?.focus({ preventScroll: true });
    return actions;
  }
  refresh();
  root.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && singlePlayer) {
        event.preventDefault();
        singlePlayer = false;
        refresh();
        controls.get("single")?.focus();
      }
    },
    { signal: signal.signal },
  );
  const settings = readDeviceSettings();
  const reducedMotion =
    settings.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const model = builtins.find(
    ({ raw }) => (raw as { id: string }).id === "unit:eastern-collective/dragon-tank",
  );
  canvas.hidden = false;
  void createMenuScene(
    canvas,
    {
      intro: text("ui.home.intro"),
      note: text("ui.home.preview"),
      version,
      modelLabel: `Eastern Collective · ${(model?.raw as { name?: string } | undefined)?.name ?? "Dragon Tank"}`,
      reducedMotion,
      scale: settings.uiScale / 100,
      model: async (signal) => {
        if (!model?.model) throw new Error("Menu model unavailable");
        const response = await fetch(model.model, { signal });
        if (!response.ok) throw new Error(`Menu model HTTP ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      },
    },
    signal.signal,
  )
    .then((scene) => {
      if (disposed) {
        scene.dispose();
        return;
      }
      gui = scene;
      refresh();
    })
    .catch(() => {
      if (disposed) return;
      canvas.hidden = true;
      for (const [name, value] of previousCanvasAttributes) {
        if (value === null) canvas.removeAttribute(name);
        else canvas.setAttribute(name, value);
      }
      root.querySelector("[data-menu-status]")!.textContent = text("ui.home.gui-unavailable");
    });
  return {
    setContinue(activate: () => void) {
      resume = activate;
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      signal.abort();
      buttonEvents.abort();
      gui?.dispose();
      root.classList.remove("home-native");
      delete canvas.dataset.menu;
      canvas.hidden = true;
      for (const [name, value] of previousCanvasAttributes) {
        if (value === null) canvas.removeAttribute(name);
        else canvas.setAttribute(name, value);
      }
    },
  };
}
