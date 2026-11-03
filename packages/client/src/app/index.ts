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
import { replayLibrary } from "../features/replays";
import { replayViewer } from "../features/replays/viewer";
import { applyInterfaceScale, readDeviceSettings, settingsScreen } from "../features/settings";
import { skirmishScreen } from "../features/skirmish";
import { defaultSkirmish, type SkirmishSetup } from "../features/skirmish/setup";
import { text } from "../shared";
import { mountNativePanel } from "../shared/native-panel";

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
  let dismissLoading: (() => void) | undefined;
  let disposeLoading: (() => void) | undefined;
  let leavingHistory = false;
  function stop() {
    cancelLoading?.();
    cancelLoading = undefined;
    dismissLoading = undefined;
    disposeLoading?.();
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
    const previous = session,
      ticket = generation;
    const commit = () => {
      if (disposed || session !== previous || generation !== ticket) return;
      stop();
      history.pushState(null, "", path);
      show(notice);
    };
    if (!previous) commit();
    else
      void previous.confirmExit("leave").then((accepted) => {
        if (accepted) commit();
      });
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
    if (previous) {
      const ticket = generation;
      if (!(await previous.confirmExit(saved ? "load" : "restart"))) return;
      if (disposed || session !== previous || generation !== ticket) return;
    }
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
      root.replaceChildren();
    }
    const ticket = ++generation;
    const nextRoot = previous ? document.createElement("main") : root;
    const nextCanvas = previous ? document.createElement("canvas") : canvas;
    const overlay = document.createElement("dialog");
    if (previous) {
      nextRoot.className = "game-shell";
      nextRoot.style.visibility = "hidden";
      Object.assign(nextCanvas.style, { position: "fixed", inset: "0", visibility: "hidden" });
      nextCanvas.width = canvas.width;
      nextCanvas.height = canvas.height;
      document.body.append(nextCanvas, nextRoot);
    }
    overlay.className = "match-menu";
    overlay.setAttribute("aria-labelledby", "match-loading-title");
    overlay.innerHTML = `<canvas class="native-menu-canvas" tabindex="-1" aria-hidden="true" hidden></canvas><section class="loading-screen"><h1 id="match-loading-title">${text("ui.loading.title")}</h1><p role="status" aria-live="polite" data-loading></p><progress aria-label="${text("ui.loading.title")}" max="5" value="0"></progress><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-cancel>${text("ui.common.cancel")}</button></div></section>`;
    document.body.append(overlay);
    overlay.showModal();
    const loadingRoot = overlay;
    const nativeLoading = mountNativePanel(
      overlay,
      overlay.querySelector<HTMLElement>("section")!,
      overlay.querySelector<HTMLCanvasElement>("canvas")!,
      { id: () => "loading", title: () => text("ui.loading.title"), modal: true },
    );
    const releaseLoading = () => {
      nativeLoading.dispose();
      if (overlay.open) overlay.close();
      overlay.remove();
      if (disposeLoading === releaseLoading) disposeLoading = undefined;
    };
    disposeLoading = releaseLoading;
    const current = () => !disposed && generation === ticket;
    let rejectLoad: (error: Error) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
    cancelLoading = () => rejectLoad(new Error(text("ui.saves.cancelled")));
    const dismiss = () => (previous ? cancelLoading?.() : navigate(saved ? "/load" : "/skirmish"));
    dismissLoading = dismiss;
    loadingRoot.querySelector("[data-cancel]")?.addEventListener("click", dismiss);
    overlay.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismiss();
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
        nativeLoading.update();
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
      {
        ...(saved && { saved }),
        load: (save) => begin(save.config, save),
        replay: (id) => navigate(`/replay/${id}`),
      },
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
        root.innerHTML = `<section class="loading-screen"><h1 tabindex="-1">${text("ui.loading.error-title")}</h1><p role="alert" data-error></p><div class="setup-actions"><button type="button" class="primary" data-retry>${text("ui.common.retry")}</button><button type="button" data-return>${text("ui.common.back")}</button></div></section>`;
        const detail = root.querySelector("[data-error]");
        if (detail)
          detail.textContent = error instanceof Error ? error.message : text("ui.match.failed");
        root
          .querySelector("[data-retry]")
          ?.addEventListener("click", () => void begin(selected, saved).catch(() => {}));
        root
          .querySelector("[data-return]")
          ?.addEventListener("click", () => navigate(saved ? "/load" : "/skirmish"));
        const failurePanel = mountNativePanel(
          root,
          root.querySelector<HTMLElement>("section")!,
          canvas,
          {
            id: () => "loading-error",
            title: () => text("ui.loading.error-title"),
            modal: false,
          },
        );
        disposeScreen = failurePanel.dispose;
      }
      throw error;
    } finally {
      releaseLoading();
      // Restore focus after the modal's inert state has cleared in every browser.
      requestAnimationFrame(() => {
        if (!current()) return;
        if (committed) canvas.focus({ preventScroll: true });
        else if (!previous) root.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      });
      if (generation === ticket) {
        loading = false;
        cancelLoading = undefined;
        dismissLoading = undefined;
        clearTimeout(timeout);
        timeout = undefined;
      }
    }
  }
  function show(notice = "") {
    if (location.pathname === "/replays") {
      disposeScreen = replayLibrary(
        root,
        canvas,
        (id) => navigate(`/replay/${id}`),
        () => navigate("/"),
      );
    } else if (location.pathname.startsWith("/replay/")) {
      disposeScreen = replayViewer(root, canvas, location.pathname.slice(8), () =>
        navigate("/replays"),
      );
    } else if (location.pathname === "/settings") {
      const settings = settingsScreen(root, applyInterfaceScale, () => navigate("/"), canvas);
      disposeScreen = settings.cancel;
    } else if (location.pathname === "/load") {
      disposeScreen = loadGameScreen(
        root,
        {
          load: (save) => begin(save.config, save),
          back: () => navigate("/"),
          start: () => start(defaultSkirmish()),
        },
        canvas,
      );
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
    const heading = root.querySelector<HTMLElement>("h1"),
      shownAt = generation;
    heading?.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => {
      if (!disposed && generation === shownAt) heading?.focus({ preventScroll: true });
    });
  }
  window.addEventListener(
    "popstate",
    () => {
      if (session && !leavingHistory) {
        const previous = session,
          ticket = generation;
        history.pushState(null, "", "/match");
        void previous.confirmExit("leave").then((accepted) => {
          if (accepted && !disposed && previous === session && generation === ticket) {
            leavingHistory = true;
            history.back();
          }
        });
        return;
      }
      leavingHistory = false;
      stop();
      show();
    },
    { signal: signal.signal },
  );
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (session?.hasUnsavedProgress()) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    { signal: signal.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "Escape" && loading) {
        event.preventDefault();
        dismissLoading?.();
      } else if (
        event.code === "Escape" &&
        !event.defaultPrevented &&
        !session &&
        location.pathname !== "/" &&
        location.pathname !== "/replays" &&
        !location.pathname.startsWith("/replay/")
      )
        navigate("/");
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
