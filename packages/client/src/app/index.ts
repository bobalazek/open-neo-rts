// Supported local routes and disposable screen/session ownership. Phase 2.

import { content } from "virtual:normal-catalog";
import { SIM_VERSION } from "@open-neo-rts/sim";
import {
  loadGameScreen,
  parseSavedGame,
  type SavedGame,
  saveCompatibility,
  saveStore,
} from "../features/load-game";
import { homeScreen } from "../features/main-menu";
import { createNormalSession } from "../features/match/session";
import { applyInterfaceScale, readDeviceSettings, settingsScreen } from "../features/settings";
import { skirmishScreen } from "../features/skirmish";
import { defaultSkirmish, type SkirmishSetup } from "../features/skirmish/setup";
import { text } from "../shared";

/** URL navigation and ownership only: gameplay stays in one disposable normal worker. */
export function startApp(canvas: HTMLCanvasElement) {
  const originalCanvas = canvas;
  const previousScale = document.documentElement.style.fontSize;
  applyInterfaceScale(readDeviceSettings());
  let root = document.createElement("main");
  root.className = "game-shell";
  document.body.append(root);
  const signal = new AbortController();
  let disposed = false,
    loading = false,
    generation = 0,
    config = defaultSkirmish();
  let session: ReturnType<typeof createNormalSession> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let disposeScreen: (() => void) | undefined;
  let cancelLoading: (() => void) | undefined;
  function stop() {
    cancelLoading?.();
    cancelLoading = undefined;
    disposeScreen?.();
    disposeScreen = undefined;
    loading = false;
    generation++;
    clearTimeout(timeout);
    timeout = undefined;
    session?.dispose();
    session = undefined;
    root.classList.remove("match-shell");
    canvas.hidden = true;
  }
  function navigate(path: string, notice = "") {
    stop();
    history.pushState(null, "", path);
    show(notice);
  }
  function start(selected: SkirmishSetup) {
    void begin(selected).catch((error) => {
      const notice = root.querySelector("[data-menu-error]");
      if (notice)
        notice.textContent = error instanceof Error ? error.message : text("ui.loading.failed");
    });
  }
  async function begin(selected: SkirmishSetup, saved?: SavedGame): Promise<void> {
    if (loading || disposed) throw new Error(text("ui.saves.busy"));
    const previous = session;
    if (!previous && !saved) config = { ...selected };
    const requestedAt = generation;
    loading = true;
    if (previous) {
      try {
        await previous.pause();
      } catch (error) {
        if (generation === requestedAt) loading = false;
        throw error;
      }
      if (disposed || generation !== requestedAt || session !== previous)
        throw new Error(text("ui.saves.cancelled"));
    } else {
      disposeScreen?.();
      disposeScreen = undefined;
    }
    const ticket = ++generation;
    const nextRoot = previous ? document.createElement("main") : root;
    const nextCanvas = previous ? document.createElement("canvas") : canvas;
    const overlay = previous ? document.createElement("dialog") : undefined;
    if (previous) {
      nextRoot.className = "game-shell";
      nextRoot.style.visibility = "hidden";
      Object.assign(nextCanvas.style, { position: "fixed", inset: "0", visibility: "hidden" });
      nextCanvas.width = canvas.width;
      nextCanvas.height = canvas.height;
      document.body.append(nextCanvas, nextRoot);
      overlay!.className = "match-menu";
      root.append(overlay!);
    }
    const loadingRoot = overlay ?? root;
    loadingRoot.innerHTML = `<section class="loading-screen"><h1>${text("ui.loading.title")}</h1><p role="status" aria-live="polite" data-loading></p><progress aria-label="${text("ui.loading.title")}" max="5" value="0"></progress><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-cancel>${text("ui.common.cancel")}</button></div></section>`;
    overlay?.showModal();
    const current = () => !disposed && generation === ticket;
    let rejectLoad: (error: Error) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
    cancelLoading = () => rejectLoad(new Error(text("ui.saves.cancelled")));
    loadingRoot
      .querySelector("[data-cancel]")
      ?.addEventListener("click", () =>
        previous ? cancelLoading?.() : navigate(saved ? "/load" : "/skirmish"),
      );
    overlay?.addEventListener("cancel", (event) => {
      event.preventDefault();
      cancelLoading?.();
    });
    timeout = setTimeout(() => rejectLoad(new Error(text("ui.loading.timeout"))), 60_000);
    const stages = [
      "ui.loading.content",
      "ui.loading.map",
      "ui.loading.renderer",
      "ui.loading.worker",
      "ui.loading.models",
    ] as const;
    let committed = false;
    const candidate: ReturnType<typeof createNormalSession> = createNormalSession(
      nextCanvas,
      nextRoot,
      { ...selected },
      (stage) => {
        if (!current()) return;
        const status = loadingRoot.querySelector("[data-loading]"),
          progress = loadingRoot.querySelector("progress");
        if (status) status.textContent = text(stages[stage] ?? "ui.loading.content");
        if (progress) progress.value = stage;
      },
      (error) => {
        if (committed) {
          if (!disposed && session === candidate)
            navigate("/skirmish", error instanceof Error ? error.message : text("ui.match.failed"));
        } else if (current())
          rejectLoad(error instanceof Error ? error : new Error(text("ui.match.failed")));
      },
      () => navigate("/skirmish"),
      () => start(config),
      () => navigate("/"),
      { ...(saved && { saved }), load: (save) => begin(save.config, save) },
    );
    try {
      await Promise.race([candidate.ready, cancelled]);
      if (!current()) throw new Error(text("ui.saves.cancelled"));
      previous?.dispose();
      if (previous) {
        canvas.replaceWith(nextCanvas);
        root.remove();
        nextCanvas.id = originalCanvas.id;
        nextCanvas.style.removeProperty("visibility");
        nextRoot.style.removeProperty("visibility");
        canvas = nextCanvas;
        root = nextRoot;
      }
      session = candidate;
      config = { ...selected };
      committed = true;
      history.pushState(null, "", "/match");
    } catch (error) {
      candidate.dispose();
      if (previous) {
        nextRoot.remove();
        nextCanvas.remove();
      } else if (current()) {
        canvas.hidden = true;
        root.classList.remove("match-shell");
        root.innerHTML = `<section class="loading-screen"><h1>${text("ui.loading.failed")}</h1><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-retry>${text("ui.common.retry")}</button><button type="button" data-back>${text("ui.common.back")}</button></div></section>`;
        const detail = root.querySelector("[data-error]");
        if (detail)
          detail.textContent = error instanceof Error ? error.message : text("ui.match.failed");
        root
          .querySelector("[data-retry]")
          ?.addEventListener("click", () => void begin(selected, saved).catch(() => {}));
        root
          .querySelector("[data-back]")
          ?.addEventListener("click", () => navigate(saved ? "/load" : "/skirmish"));
      }
      throw error;
    } finally {
      overlay?.remove();
      if (generation === ticket) {
        loading = false;
        cancelLoading = undefined;
        clearTimeout(timeout);
        timeout = undefined;
      }
    }
  }
  function show(notice = "") {
    if (location.pathname === "/settings") {
      const settings = settingsScreen(root, applyInterfaceScale, () => navigate("/"));
      disposeScreen = settings.cancel;
    } else if (location.pathname === "/load") {
      disposeScreen = loadGameScreen(root, {
        load: (save) => begin(save.config, save),
        back: () => navigate("/"),
        start: () => start(defaultSkirmish()),
      });
    } else if (location.pathname === "/skirmish")
      disposeScreen = skirmishScreen(root, canvas, config, start, () => navigate("/"), notice);
    else if (location.pathname === "/match") {
      history.replaceState(null, "", "/skirmish");
      disposeScreen = skirmishScreen(
        root,
        canvas,
        config,
        start,
        () => navigate("/"),
        text("ui.skirmish.no-session"),
      );
    } else {
      const home = homeScreen(
        root,
        canvas,
        navigate,
        () => start(defaultSkirmish()),
        text("ui.home.version", { version: "0.1.0", sim: SIM_VERSION }),
      );
      disposeScreen = home.dispose;
      const homeRoot = root,
        ticket = generation;
      void saveStore
        .list()
        .then((rows) => {
          if (disposed || ticket !== generation || root !== homeRoot || location.pathname !== "/")
            return;
          const saves = rows
            .flatMap((row) => {
              try {
                const save = parseSavedGame(row);
                return saveCompatibility(save, content.catalog?.gameplayHash) ? [] : [save];
              } catch {
                return [];
              }
            })
            .sort((a, b) => b.createdAt - a.createdAt);
          const latest = saves[0];
          if (!latest) return;
          home.setContinue(() => void begin(latest.config, latest).catch(() => {}));
        })
        .catch(() => {});
    }
    root.querySelector<HTMLElement>("h1")?.setAttribute("tabindex", "-1");
    root.querySelector<HTMLElement>("h1")?.focus();
  }
  window.addEventListener(
    "popstate",
    () => {
      stop();
      show();
    },
    { signal: signal.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "Escape" && loading) {
        event.preventDefault();
        if (session) cancelLoading?.();
        else navigate("/skirmish");
      } else if (event.code === "Escape" && !session && location.pathname !== "/") navigate("/");
    },
    { signal: signal.signal },
  );
  canvas.hidden = true;
  show();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      signal.abort();
      root.remove();
      if (canvas !== originalCanvas) {
        canvas.replaceWith(originalCanvas);
        canvas = originalCanvas;
      }
      document.documentElement.style.fontSize = previousScale;
      canvas.hidden = false;
    },
  };
}
