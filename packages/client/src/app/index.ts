// Supported local routes and disposable screen/session ownership. Phase 2.
import { SIM_VERSION } from "@open-neo-rts/sim";
import { homeScreen } from "../features/main-menu";
import { createNormalSession } from "../features/match/session";
import { skirmishScreen } from "../features/skirmish";
import { defaultSkirmish, type SkirmishSetup } from "../features/skirmish/setup";
import { text } from "../shared";

/** URL navigation and ownership only: gameplay stays in one disposable normal worker. */
export function startApp(canvas: HTMLCanvasElement) {
  const root = document.createElement("main");
  root.className = "game-shell";
  document.body.append(root);
  const signal = new AbortController();
  let disposed = false,
    loading = false,
    generation = 0,
    config = defaultSkirmish();
  let session: ReturnType<typeof createNormalSession> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function stop() {
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
    stop();
    loading = true;
    config = { ...selected };
    const ticket = generation;
    root.innerHTML = `<section class="loading-screen"><h1>${text("ui.loading.title")}</h1><p role="status" aria-live="polite" data-loading></p><progress aria-label="${text("ui.loading.title")}" max="5" value="0"></progress><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-cancel>${text("ui.common.cancel")}</button><button type="button" data-retry hidden>${text("ui.common.retry")}</button><button type="button" data-back hidden>${text("ui.common.back")}</button></div></section>`;
    const current = () => !disposed && generation === ticket;
    const failure = (error: unknown) => {
      if (!current()) return;
      loading = false;
      clearTimeout(timeout);
      session?.dispose();
      session = undefined;
      canvas.hidden = true;
      root.classList.remove("match-shell");
      root.innerHTML = `<section class="loading-screen"><h1>${text("ui.loading.failed")}</h1><p role="alert" data-error></p><div class="setup-actions"><button type="button" data-retry>${text("ui.common.retry")}</button><button type="button" data-back>${text("ui.common.back")}</button></div></section>`;
      const detail = root.querySelector("[data-error]");
      if (detail)
        detail.textContent = error instanceof Error ? error.message : text("ui.match.failed");
      root.querySelector("[data-retry]")?.addEventListener("click", () => start(config));
      root.querySelector("[data-back]")?.addEventListener("click", () => navigate("/skirmish"));
    };
    root.querySelector("[data-cancel]")?.addEventListener("click", () => navigate("/skirmish"));
    timeout = setTimeout(() => failure(new Error(text("ui.loading.timeout"))), 60_000);
    const stages = [
      "ui.loading.content",
      "ui.loading.map",
      "ui.loading.renderer",
      "ui.loading.worker",
      "ui.loading.models",
    ] as const;
    session = createNormalSession(
      canvas,
      root,
      config,
      (stage) => {
        if (!current()) return;
        const status = root.querySelector("[data-loading]"),
          progress = root.querySelector("progress");
        if (status) status.textContent = text(stages[stage] ?? "ui.loading.content");
        if (progress) progress.value = stage;
      },
      failure,
      () => navigate("/skirmish"),
      () => start(config),
      () => navigate("/"),
    );
    void session.ready
      .then(() => {
        if (current() && session) {
          loading = false;
          clearTimeout(timeout);
          timeout = undefined;
          history.pushState(null, "", "/match");
        }
      })
      .catch(failure);
  }
  function show(notice = "") {
    if (location.pathname === "/skirmish")
      skirmishScreen(root, config, start, () => navigate("/"), notice);
    else if (location.pathname === "/match") {
      history.replaceState(null, "", "/skirmish");
      skirmishScreen(root, config, start, () => navigate("/"), text("ui.skirmish.no-session"));
    } else {
      homeScreen(root, navigate, () => start(defaultSkirmish()));
      const version = root.querySelector("[data-version]");
      if (version)
        version.textContent = text("ui.home.version", { version: "0.1.0", sim: SIM_VERSION });
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
      if (event.code === "Escape" && loading) navigate("/skirmish");
      else if (event.code === "Escape" && !session && location.pathname !== "/") navigate("/");
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
      canvas.hidden = false;
    },
  };
}
