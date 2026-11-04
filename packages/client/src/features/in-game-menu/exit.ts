import { text } from "../../shared";
import { mountNativePanel } from "../../shared/native-panel";

export type MatchExit = "leave" | "restart" | "load";

/** A separate modal preserves the underlying menu pane, world and save-thumbnail canvas. */
export function createExitPrompt(
  root: HTMLElement,
  kind: MatchExit,
  options: { pause: () => Promise<unknown>; save?: (name: string) => Promise<void>; name: string },
) {
  const title = text(
    kind === "leave"
      ? "ui.exit.leave-title"
      : kind === "restart"
        ? "ui.exit.restart-title"
        : "ui.exit.load-title",
  );
  const saveLabel = text(
    kind === "leave"
      ? "ui.exit.save-leave"
      : kind === "restart"
        ? "ui.exit.save-restart"
        : "ui.exit.save-load",
  );
  const discardLabel = text(
    kind === "leave"
      ? "ui.exit.discard-leave"
      : kind === "restart"
        ? "ui.exit.discard-restart"
        : "ui.exit.discard-load",
  );
  const dialog = document.createElement("dialog");
  dialog.className = "match-menu";
  dialog.setAttribute("aria-labelledby", "match-exit-title");
  dialog.innerHTML = `<canvas class="native-menu-canvas" tabindex="-1" aria-hidden="true" hidden></canvas><section><h1 id="match-exit-title"></h1><p>${text("ui.exit.explanation")}</p><form><label>${text("ui.saves.name")}<input name="name" required maxlength="96"></label><div class="setup-actions"><button type="submit" class="primary" data-save-exit></button><button type="button" data-discard-exit></button><button type="button" data-back>${text("ui.exit.cancel")}</button></div></form><p role="status" aria-live="polite"></p><p role="alert"></p></section>`;
  const section = dialog.querySelector("section")!,
    form = dialog.querySelector("form")!;
  const input = dialog.querySelector("input")!,
    save = dialog.querySelector<HTMLButtonElement>("[data-save-exit]")!,
    discard = dialog.querySelector<HTMLButtonElement>("[data-discard-exit]")!,
    cancel = dialog.querySelector<HTMLButtonElement>("[data-back]")!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!,
    error = dialog.querySelector<HTMLElement>('[role="alert"]')!;
  dialog.querySelector("h1")!.textContent = title;
  save.textContent = saveLabel;
  discard.textContent = discardLabel;
  input.value = options.name;
  if (!options.save) {
    input.closest("label")!.hidden = true;
    save.hidden = true;
    section.querySelector("p")!.textContent = text("ui.exit.no-save");
  }
  const events = new AbortController();
  let disposed = false,
    pending = true,
    prepared = false;
  let resolve: (accepted: boolean) => void = () => {};
  const result = new Promise<boolean>((done) => {
    resolve = done;
  });
  root.append(dialog);
  dialog.showModal();
  const native = mountNativePanel(dialog, section, dialog.querySelector("canvas")!, {
    id: () => `save-before-${kind}`,
    title: () => title,
    modal: true,
  });
  function update() {
    for (const control of [input, save, discard]) control.disabled = pending || !prepared;
    cancel.disabled = pending;
    native.update();
  }
  function finish(accepted: boolean) {
    if (disposed) return;
    disposed = true;
    events.abort();
    native.dispose();
    if (dialog.open) dialog.close();
    dialog.remove();
    resolve(accepted);
  }
  function cancelExit() {
    if (disposed || pending) return;
    pending = true;
    status.textContent = text("ui.saves.working");
    update();
    // Keep the modal until its owner acknowledges restoration of the previous pause state.
    resolve(false);
  }
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const write = options.save;
      if (disposed || pending || !prepared || !write) return;
      const name = input.value.trim();
      if (!name) {
        error.textContent = text("ui.exit.name-required");
        input.focus();
        native.update();
        return;
      }
      pending = true;
      error.textContent = "";
      status.textContent = text("ui.exit.saving");
      update();
      void Promise.resolve()
        .then(() => write(name))
        .then(() => finish(true))
        .catch((cause) => {
          if (disposed) return;
          pending = false;
          status.textContent = "";
          error.textContent =
            `${text("ui.exit.save-failed")} ${cause instanceof Error ? cause.message : ""}`.trim();
          update();
          requestAnimationFrame(() => {
            if (!disposed) save.focus({ preventScroll: true });
          });
        });
    },
    { signal: events.signal },
  );
  discard.addEventListener(
    "click",
    () => {
      if (!pending && prepared) finish(true);
    },
    { signal: events.signal },
  );
  cancel.addEventListener("click", cancelExit, { signal: events.signal });
  dialog.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      cancelExit();
    },
    { signal: events.signal },
  );
  dialog.addEventListener("keydown", (event) => event.stopPropagation(), { signal: events.signal });
  status.textContent = text("ui.menu.pausing");
  update();
  void Promise.resolve()
    .then(() => options.pause())
    .then(() => {
      if (disposed) return;
      prepared = true;
      pending = false;
      status.textContent = "";
      update();
      cancel.focus({ preventScroll: true });
    })
    .catch((cause) => {
      if (disposed) return;
      pending = false;
      status.textContent = "";
      error.textContent = cause instanceof Error ? cause.message : text("ui.menu.failed");
      update();
      cancel.focus({ preventScroll: true });
    });
  return { result, dispose: () => finish(false) };
}
