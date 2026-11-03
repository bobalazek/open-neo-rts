// One disposable, modal owner for normal single-player match controls. Phase 2.
import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";
import { NORMAL_GAME_SPEEDS } from "../../worker";
import { loadGameScreen, type SavedGame } from "../load-game";
import { type DeviceSettings, settingsScreen } from "../settings";

export function createInGameMenu(
  root: HTMLElement,
  options: {
    state: () => { paused: boolean; speed: number; ended: boolean } | undefined;
    available: () => boolean;
    pause: (paused: boolean) => Promise<unknown>;
    speed: (speed: number) => Promise<unknown>;
    controls: (enabled: boolean) => void;
    applySettings: (settings: DeviceSettings) => void;
    restart: () => void;
    leave: () => void;
    surrender: () => Promise<boolean>;
    focus: () => void;
    save?: (name: string) => Promise<void>;
    saveName?: () => string;
    load?: (save: SavedGame) => Promise<void>;
    quicksave?: () => Promise<void>;
    quickload?: () => Promise<void>;
  },
  signal: AbortSignal,
) {
  const dialog = document.createElement("dialog");
  dialog.className = "match-menu";
  dialog.setAttribute("aria-labelledby", "match-menu-title");
  dialog.innerHTML = `<canvas class="native-menu-canvas" tabindex="-1" aria-hidden="true" hidden></canvas><div data-menu-semantics><h1 id="match-menu-title">${text("ui.menu.title")}</h1><p role="status" data-menu-state></p><div data-menu-body></div><p role="alert" data-menu-error></p></div>`;
  root.append(dialog);
  const body = dialog.querySelector<HTMLElement>("[data-menu-body]");
  const status = dialog.querySelector("[data-menu-state]");
  const error = dialog.querySelector("[data-menu-error]");
  if (!body || !status || !error) throw new Error("Match menu controls missing");
  const nativeCanvas = dialog.querySelector<HTMLCanvasElement>("canvas")!;
  const semantics = dialog.querySelector<HTMLElement>("[data-menu-semantics]")!;
  let native: ReturnType<typeof mountNativePanel> | undefined;
  let disposed = false,
    pending = false,
    pane = "menu";
  let settings: ReturnType<typeof settingsScreen> | undefined;
  let cleanupPane: (() => void) | undefined;
  const ended = () => !!options.state()?.ended;
  const focus = () => dialog.querySelector<HTMLButtonElement>("button")?.focus();
  function present() {
    if (!dialog.open || disposed) return;
    if (pane === "load") {
      native?.dispose();
      native = undefined;
      return;
    }
    if (!native)
      native = mountNativePanel(dialog, semantics, nativeCanvas, {
        id: () => pane,
        title: () =>
          body!.querySelector("h1,h2")?.textContent ??
          text(pane === "save" ? "ui.menu.save" : "ui.menu.title"),
        modal: true,
      });
    else native.update();
  }
  function update() {
    if (!dialog.open || disposed) return;
    if (ended()) {
      finish();
      return;
    }
    status!.textContent = text(
      options.state()?.paused ? "ui.menu.paused" : pending ? "ui.menu.pausing" : "ui.menu.running",
    );
    for (const control of dialog.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      "button,select",
    ))
      control.disabled = pending || control.hasAttribute("data-unavailable");
    const speed = dialog.querySelector<HTMLSelectElement>("[data-game-speed]");
    if (speed) speed.value = String(options.state()?.speed ?? 1);
    present();
  }
  function finish() {
    native?.dispose();
    native = undefined;
    cleanupPane?.();
    cleanupPane = undefined;
    settings?.cancel();
    settings = undefined;
    if (dialog.open) dialog.close();
    options.controls(true);
  }
  async function run(action: () => Promise<unknown>) {
    if (pending || disposed || ended()) return;
    pending = true;
    error!.textContent = "";
    update();
    try {
      await action();
    } catch {
      if (!disposed && !ended()) error!.textContent = text("ui.menu.failed");
    } finally {
      pending = false;
      if (!disposed) update();
    }
  }
  function menu() {
    cleanupPane?.();
    cleanupPane = undefined;
    settings?.cancel();
    settings = undefined;
    pane = "menu";
    body!.innerHTML = `<nav aria-label="${text("ui.menu.title")}"><button type="button" class="primary" data-resume>${text("ui.menu.resume")}</button><label>${text("ui.menu.speed")}<select data-game-speed>${NORMAL_GAME_SPEEDS.map((speed, index) => `<option value="${speed}">${text(["ui.menu.slow", "ui.menu.normal", "ui.menu.fast", "ui.menu.faster"][index] as "ui.menu.normal")} (${speed}×)</option>`).join("")}</select></label><button type="button" data-objectives>${text("ui.menu.objectives")}</button><button type="button" disabled data-unavailable title="${text("ui.menu.saves-unavailable")}">${text("ui.menu.save")}</button><button type="button" disabled data-unavailable title="${text("ui.menu.saves-unavailable")}">${text("ui.menu.load")}</button><button type="button" data-restart>${text("ui.menu.restart")}</button><button type="button" data-settings>${text("ui.settings.title")}</button><button type="button" data-keys>${text("ui.menu.keys")}</button><button type="button" data-surrender>${text("ui.result.surrender")}</button><button type="button" data-leave-menu>${text("ui.match.leave")}</button></nav>`;
    const unavailable = body!.querySelectorAll<HTMLButtonElement>("[data-unavailable]");
    const save = unavailable[0],
      load = unavailable[1];
    if (save && options.save) {
      save.removeAttribute("data-unavailable");
      save.removeAttribute("title");
      save.addEventListener("click", () => {
        pane = "save";
        body!.innerHTML = `<button type="button" data-back>${text("ui.common.back")}</button><form data-save-form><label>${text("ui.saves.name")}<input name="name" maxlength="96" required></label><button type="submit">${text("ui.menu.save")}</button><p role="status" data-saved></p></form>`;
        const input = body!.querySelector<HTMLInputElement>("input")!;
        input.value = options.saveName?.() ?? "";
        body!.querySelector("[data-back]")?.addEventListener("click", () => {
          menu();
          focus();
        });
        body!.querySelector("form")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const name = input.value.trim();
          if (!name) return;
          void run(async () => {
            await options.save?.(name);
            const notice = body!.querySelector("[data-saved]");
            if (!disposed && notice) notice.textContent = text("ui.saves.saved");
          });
        });
        input.focus();
        input.select();
        present();
      });
    }
    if (load && options.load) {
      load.removeAttribute("data-unavailable");
      load.removeAttribute("title");
      load.addEventListener("click", () => {
        pane = "load";
        cleanupPane = loadGameScreen(body!, {
          load: options.load!,
          back: () => {
            menu();
            focus();
          },
        });
        present();
      });
    }
    for (const [action, name] of [
      [options.quicksave, "ui.saves.quick-save"],
      [options.quickload, "ui.saves.quick-load"],
    ] as const) {
      if (!action) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text(name);
      button.addEventListener(
        "click",
        () =>
          void run(async () => {
            await action();
          }),
      );
      body!.querySelector("nav")?.append(button);
    }
    body!.querySelector("[data-resume]")?.addEventListener("click", () => void resume());
    body!.querySelector("[data-game-speed]")?.setAttribute("aria-label", text("ui.menu.speed"));
    body!.querySelector("[data-game-speed]")?.addEventListener("change", (event) => {
      const value = Number((event.target as HTMLSelectElement).value);
      void run(() => options.speed(value));
    });
    body!.querySelector("[data-settings]")?.addEventListener("click", () => {
      pane = "settings";
      settings = settingsScreen(body!, options.applySettings, () => {
        menu();
        focus();
      });
      focus();
      present();
    });
    for (const topic of ["objectives", "keys"] as const)
      body!.querySelector(`[data-${topic}]`)?.addEventListener("click", () => {
        pane = topic;
        body!.innerHTML = `<button type="button" data-back>${text("ui.common.back")}</button><h2>${text(topic === "keys" ? "ui.menu.keys" : "ui.menu.objectives")}</h2><p>${text(topic === "keys" ? "ui.menu.keys-help" : "ui.menu.objectives-help")}</p>`;
        body!.querySelector("[data-back]")?.addEventListener("click", () => {
          menu();
          focus();
        });
        focus();
        present();
      });
    body!.querySelector("[data-restart]")?.addEventListener("click", () => {
      if (window.confirm(text("ui.menu.restart-confirm"))) options.restart();
    });
    body!.querySelector("[data-leave-menu]")?.addEventListener("click", options.leave);
    body!.querySelector("[data-surrender]")?.addEventListener(
      "click",
      () =>
        void run(async () => {
          if (!(await options.surrender()) && !disposed && !ended()) await options.pause(true);
        }),
    );
    update();
  }
  async function resume() {
    await run(async () => {
      if (!ended()) await options.pause(false);
      if (!disposed && !ended()) {
        finish();
        options.focus();
      }
    });
  }
  async function open() {
    if (disposed || dialog.open || !options.available() || ended()) return;
    menu();
    dialog.showModal();
    options.controls(false);
    await run(() => options.pause(true));
  }
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (pending) return;
    if (pane === "menu") void resume();
    else {
      menu();
      focus();
    }
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    finish();
    dialog.remove();
  };
  signal.addEventListener("abort", dispose, { once: true });
  return { open, update, finish, isOpen: () => dialog.open };
}
