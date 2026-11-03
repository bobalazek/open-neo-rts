import { text } from "../../shared";
import {
  BINDING_ACTIONS,
  BINDINGS_CHANGED,
  type BindingAction,
  bindingConflicts,
  bindingLabel,
  bindingText,
  defaultBindings,
  keyChord,
  readBindings,
  saveBindings,
  validateBindingFile,
  wasdBindings,
} from "./bindings";

/** The shared native panel paints these controls; their keyboard capture never reaches gameplay. */
export function bindingsScreen(root: HTMLElement, back: () => void) {
  root.innerHTML = `<section class="settings-screen"><header><button type="button" data-back>${text("ui.common.back")}</button><h1>${text("ui.bindings.title")}</h1></header><p>${text("ui.bindings.help")}</p><form><label>${text("ui.bindings.category")}<select name="category"></select></label><label>${text("ui.bindings.action")}<select name="action"></select></label><label>${text("ui.bindings.slot")}<select name="slot"><option value="0">${text("ui.bindings.primary")}</option><option value="1">${text("ui.bindings.alternate")}</option></select></label><p data-assignment></p><div class="setup-actions"><button type="button" data-capture></button><button type="button" data-clear>${text("ui.bindings.clear")}</button><button type="button" data-default>${text("ui.bindings.default-action")}</button></div><label>${text("ui.bindings.layout")}<select name="layout"><option value="grid">${text("ui.bindings.grid")}</option><option value="wasd">${text("ui.bindings.wasd")}</option></select></label><div class="setup-actions"><button type="button" data-preset>${text("ui.bindings.use-layout")}</button><button type="button" data-export>${text("ui.bindings.export")}</button></div><label>${text("ui.bindings.import")}<input name="import" type="file" accept="application/json,.json"></label><p role="status" aria-live="polite"></p><p role="alert"></p><button type="submit" class="primary">${text("ui.bindings.apply")}</button></form></section>`;
  const form = root.querySelector("form")!;
  const category = form.elements.namedItem("category") as HTMLSelectElement,
    action = form.elements.namedItem("action") as HTMLSelectElement,
    slot = form.elements.namedItem("slot") as HTMLSelectElement,
    layout = form.elements.namedItem("layout") as HTMLSelectElement,
    file = form.elements.namedItem("import") as HTMLInputElement;
  const capture = root.querySelector<HTMLButtonElement>("[data-capture]")!,
    clear = root.querySelector<HTMLButtonElement>("[data-clear]")!,
    apply = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const assignment = root.querySelector("[data-assignment]")!,
    status = root.querySelector('[role="status"]')!,
    error = root.querySelector('[role="alert"]')!;
  let bindings = readBindings(),
    listening = false,
    disposed = false,
    importing = false;
  const events = new AbortController();
  const selected = () => action.value as BindingAction;
  for (const group of [...new Set(BINDING_ACTIONS.map((item) => item.category))])
    category.add(new Option(text(`ui.bindings.${group}` as "ui.bindings.orders"), group));
  for (const [control, label] of [
    [category, "category"],
    [action, "action"],
    [slot, "slot"],
    [layout, "layout"],
    [file, "import"],
  ] as const)
    control.setAttribute("aria-label", text(`ui.bindings.${label}` as "ui.bindings.action"));
  function update() {
    capture.textContent = text(listening ? "ui.bindings.listening" : "ui.bindings.change");
    capture.disabled = importing;
    capture.setAttribute("aria-pressed", String(listening));
    assignment.textContent = `${bindingLabel(selected())}: ${bindingText(bindings, selected())}`;
    const conflicts = bindingConflicts(bindings);
    error.textContent = conflicts.length
      ? `${text("ui.bindings.conflicts")} ${conflicts
          .slice(0, 3)
          .map(([a, b]) => `${bindingLabel(a)} / ${bindingLabel(b)}`)
          .join(
            "; ",
          )}${conflicts.length > 3 ? text("ui.bindings.more-conflicts", { count: conflicts.length - 3 }) : ""}`
      : "";
    apply.disabled = conflicts.length > 0 || listening || importing;
    for (const control of [category, action, slot, layout, clear, file])
      control.disabled = listening || importing;
    for (const control of root.querySelectorAll<HTMLButtonElement>(
      "[data-default],[data-preset],[data-export]",
    ))
      control.disabled = listening || importing;
    // Native panel updates on semantic input/change; asynchronous imports use the same seam.
    assignment.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function choices() {
    action.replaceChildren();
    for (const item of BINDING_ACTIONS.filter((item) => item.category === category.value))
      action.add(new Option(bindingLabel(item.id), item.id));
    update();
  }
  category.addEventListener("change", choices, { signal: events.signal });
  action.addEventListener(
    "change",
    () => {
      status.textContent = "";
      update();
    },
    { signal: events.signal },
  );
  slot.addEventListener(
    "change",
    () => {
      status.textContent = "";
      update();
    },
    { signal: events.signal },
  );
  capture.addEventListener(
    "click",
    () => {
      listening = !listening;
      status.textContent = text(
        listening ? "ui.bindings.press-key" : "ui.bindings.capture-canceled",
      );
      update();
      capture.focus({ preventScroll: true });
    },
    { signal: events.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (!listening || disposed) return;
      event.stopImmediatePropagation();
      if (event.code === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        listening = false;
        status.textContent = text("ui.bindings.capture-canceled");
        update();
        return;
      }
      if (
        event.isComposing ||
        event.repeat ||
        ["Control", "Shift", "Alt", "Meta"].includes(event.key)
      )
        return;
      const chord = keyChord(event);
      try {
        if (!chord) throw new Error(text("ui.bindings.reserved"));
        const next = [...bindings[selected()]];
        if (Number(slot.value) === 0) next[0] = chord;
        else if (!next.length) next.push(chord);
        else next[1] = chord;
        bindings = validateBindingFile(
          { format: 1, bindings: { ...bindings, [selected()]: [...new Set(next)] } },
          true,
        ).bindings;
        event.preventDefault();
        listening = false;
        status.textContent = text("ui.bindings.changed");
        update();
      } catch {
        status.textContent = text("ui.bindings.reserved");
        status.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    { capture: true, signal: events.signal },
  );
  window.addEventListener(
    "blur",
    () => {
      if (listening) {
        listening = false;
        status.textContent = text("ui.bindings.capture-canceled");
        update();
      }
    },
    { signal: events.signal },
  );
  clear.addEventListener(
    "click",
    () => {
      bindings[selected()] = bindings[selected()].filter(
        (_, index) => index !== Number(slot.value),
      );
      status.textContent = text("ui.bindings.changed");
      update();
    },
    { signal: events.signal },
  );
  root.querySelector("[data-default]")!.addEventListener(
    "click",
    () => {
      bindings[selected()] = defaultBindings()[selected()];
      status.textContent = text("ui.bindings.changed");
      update();
    },
    { signal: events.signal },
  );
  root.querySelector("[data-preset]")!.addEventListener(
    "click",
    () => {
      bindings = layout.value === "wasd" ? wasdBindings() : defaultBindings();
      status.textContent = text("ui.bindings.changed");
      update();
    },
    { signal: events.signal },
  );
  file.addEventListener(
    "change",
    () => {
      const chosen = file.files?.[0];
      if (!chosen || importing) return;
      importing = true;
      listening = false;
      status.textContent = text("ui.bindings.importing");
      update();
      void (async () => {
        try {
          if (chosen.size > 64 * 1024) throw new Error(text("ui.bindings.invalid"));
          const imported = validateBindingFile(JSON.parse(await chosen.text()), true);
          if (disposed) return;
          bindings = imported.bindings;
          status.textContent = text("ui.bindings.imported");
        } catch {
          if (!disposed) status.textContent = text("ui.bindings.import-failed");
        } finally {
          if (!disposed) {
            importing = false;
            file.value = "";
            update();
          }
        }
      })();
    },
    { signal: events.signal },
  );
  root.querySelector("[data-export]")!.addEventListener(
    "click",
    () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ format: 1, bindings }, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "open-neo-rts-bindings.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    { signal: events.signal },
  );
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (listening || importing || apply.disabled) return;
      try {
        saveBindings(bindings);
        window.dispatchEvent(new Event(BINDINGS_CHANGED));
        status.textContent = text("ui.bindings.saved");
      } catch {
        status.textContent = text("ui.bindings.save-failed");
      }
      update();
    },
    { signal: events.signal },
  );
  root.querySelector("[data-back]")!.addEventListener("click", back, { signal: events.signal });
  choices();
  return {
    dispose() {
      disposed = true;
      events.abort();
    },
  };
}
