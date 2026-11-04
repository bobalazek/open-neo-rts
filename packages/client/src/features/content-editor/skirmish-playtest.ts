import { text } from "../../shared";
import { createClientAudio } from "../../shared/audio";
import { mountNativePanel } from "../../shared/native-panel";
import { createNormalSession, type DraftSkirmishSource } from "../match/session";
import { defaultSkirmish } from "../skirmish/setup";

/** Own a temporary normal skirmish; draft and asset ownership stays with the retained editor. */
export function startDraftSkirmish(
  canvas: HTMLCanvasElement,
  source: DraftSkirmishSource,
  back: () => void,
  fail: (error: unknown) => void,
) {
  const audio = createClientAudio();
  const root = document.createElement("main");
  root.className = "game-shell";
  root.setAttribute("data-draft-skirmish", "");
  document.body.append(root);
  let session: ReturnType<typeof createNormalSession> | undefined;
  let closeLoading: (() => void) | undefined;
  let generation = 0,
    disposed = false;
  const stages = [
    "ui.loading.content",
    "ui.loading.map",
    "ui.loading.renderer",
    "ui.loading.worker",
    "ui.loading.models",
  ] as const;
  function start() {
    const ticket = ++generation;
    session?.dispose();
    canvas.dataset.session = "loading";
    closeLoading?.();
    root.replaceChildren();
    root.style.visibility = canvas.style.visibility = "hidden";
    const current = () => !disposed && ticket === generation;
    const loading = document.createElement("dialog");
    loading.className = "match-menu";
    loading.setAttribute("aria-label", text("ui.editor.skirmish-title"));
    loading.innerHTML = `<canvas class="native-menu-canvas" tabindex="-1" aria-hidden="true" hidden></canvas><section class="loading-screen"><h1>${text("ui.editor.skirmish-title")}</h1><p role="status" aria-live="polite"></p><progress max="5" value="0" aria-label="${text("ui.loading.title")}"></progress><button type="button">${text("ui.common.cancel")}</button></section>`;
    document.body.append(loading);
    loading.showModal();
    const panel = mountNativePanel(
      loading,
      loading.querySelector("section")!,
      loading.querySelector("canvas")!,
      {
        id: () => "draft-loading",
        title: () => text("ui.editor.skirmish-title"),
        modal: true,
      },
    );
    const timeout = setTimeout(() => {
      if (current()) fail(new Error(text("ui.loading.timeout")));
    }, 60_000);
    closeLoading = () => {
      clearTimeout(timeout);
      panel.dispose();
      if (loading.open) loading.close();
      loading.remove();
      closeLoading = undefined;
    };
    loading.querySelector("button")!.addEventListener("click", () => {
      if (current()) back();
    });
    loading.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (current()) back();
    });
    const candidate = createNormalSession(
      canvas,
      root,
      {
        ...defaultSkirmish(),
        seed: source.scenario.seed,
        yourSpawn: source.scenario.yourSpawn,
        otherSpawn: source.scenario.otherSpawn,
      },
      (stage) => {
        if (!current()) return;
        loading.querySelector("[role=status]")!.textContent = text(stages[stage]!);
        loading.querySelector("progress")!.value = stage + 1;
        panel.update();
      },
      (error) => {
        if (current()) fail(error);
      },
      back,
      () => {
        if (current()) start();
      },
      back,
      undefined,
      audio.mixer,
      source,
    );
    session = candidate;
    void candidate.ready
      .then(() => {
        if (!current()) return;
        closeLoading?.();
        root.style.visibility = canvas.style.visibility = "";
        canvas.dataset.session = "ready";
        canvas.focus({ preventScroll: true });
      })
      .catch((error) => {
        if (current()) fail(error);
      });
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    closeLoading?.();
    session?.dispose();
    audio.dispose();
    root.remove();
  };
  try {
    start();
  } catch (error) {
    dispose();
    throw error;
  }
  return { dispose };
}
