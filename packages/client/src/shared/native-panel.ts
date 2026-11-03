import { createPanelScene, type PanelContent } from "@open-neo-rts/render";

/** Keeps existing controllers and semantic controls authoritative while Babylon paints the panel. */
export function mountNativePanel(
  shell: HTMLElement,
  semantics: HTMLElement,
  canvas: HTMLCanvasElement,
  options: { id: () => string; title: () => string; modal: boolean },
) {
  const abort = new AbortController();
  const previous = ["tabindex", "aria-label", "aria-hidden"].map(
    (name) => [name, canvas.getAttribute(name)] as const,
  );
  canvas.hidden = false;
  canvas.tabIndex = -1;
  canvas.removeAttribute("aria-label");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.visibility = "hidden";
  semantics.setAttribute("data-native-semantics", "");
  let gui: Awaited<ReturnType<typeof createPanelScene>> | undefined;
  let disposed = false;
  let drawn = "";
  let revision = 0;
  function controls() {
    return [
      ...semantics.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        "input,select,button",
      ),
    ];
  }
  function snapshot(): PanelContent {
    const fields = [
      ...semantics.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select"),
    ];
    const buttons = [...semantics.querySelectorAll<HTMLButtonElement>("button")];
    const label = (control: HTMLInputElement | HTMLSelectElement) =>
      control.getAttribute("aria-label") ??
      [...(control.labels?.[0]?.childNodes ?? [])]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join("")
        .trim();
    fields.forEach((control, i) => {
      control.dataset.nativeField = control.name || `native-field-${i}`;
    });
    buttons.forEach((control, i) => {
      control.dataset.nativeAction = `native-action-${i}`;
    });
    const notices = (role: string) =>
      [...semantics.querySelectorAll(`[role="${role}"]`)]
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .join(" · ");
    return {
      id: options.id(),
      title: options.title(),
      text: [...semantics.querySelectorAll("p:not([role])")]
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .join("\n\n"),
      status: notices("status"),
      error: notices("alert"),
      scale: (Number.parseFloat(document.documentElement.style.fontSize) || 100) / 100,
      fields: fields.map((control) => ({
        id: control.dataset.nativeField!,
        label: label(control),
        help: control.closest("label")?.querySelector("small")?.textContent ?? control.title,
        value:
          control instanceof HTMLInputElement && control.type === "checkbox"
            ? control.checked
            : control.value,
        disabled: control.disabled,
        ...(control instanceof HTMLSelectElement && {
          choices: [...control.options].map((option) => ({
            value: option.value,
            label: option.text,
          })),
        }),
      })),
      actions: buttons.map((control) => ({
        id: control.dataset.nativeAction!,
        label: control.textContent ?? "",
        primary: control.classList.contains("primary") || control.hasAttribute("data-resume"),
        back: control.hasAttribute("data-back"),
        disabled:
          control.disabled ||
          (control.type === "submit" && !!control.form && !control.form.checkValidity()),
        activate: () => {
          control.focus({ preventScroll: true });
          control.click();
        },
      })),
      change: (id, value) => {
        const control = fields.find((control) => control.dataset.nativeField === id);
        if (!control || control.disabled) return;
        if (control instanceof HTMLInputElement && control.type === "checkbox")
          control.checked = value === true;
        else
          control.value =
            control instanceof HTMLInputElement && control.maxLength >= 0
              ? String(value).slice(0, control.maxLength)
              : String(value);
        control.dispatchEvent(
          new Event(
            control instanceof HTMLSelectElement || control.type === "checkbox"
              ? "change"
              : "input",
            { bubbles: true },
          ),
        );
        update();
      },
      submit: () => semantics.querySelector("form")?.requestSubmit(),
    };
  }
  function update() {
    if (disposed || !gui) return;
    const content = snapshot();
    gui.update(content);
    const key = `${content.id}:${content.scale}`;
    if (drawn === key) return;
    drawn = key;
    const ticket = ++revision;
    canvas.dataset.panel = "drawing";
    void gui.drawn().then(() => {
      if (disposed || ticket !== revision) return;
      shell.classList.add("native-panel");
      canvas.style.removeProperty("visibility");
      canvas.dataset.panel = content.id;
      const active = document.activeElement;
      if (active instanceof HTMLElement)
        gui?.focus(active.dataset.nativeField ?? active.dataset.nativeAction);
    });
  }
  semantics.addEventListener(
    "focusin",
    (event) => {
      const control = event.target;
      if (control instanceof HTMLElement)
        gui?.focus(control.dataset.nativeField ?? control.dataset.nativeAction);
    },
    { signal: abort.signal },
  );
  semantics.addEventListener("change", update, { signal: abort.signal });
  semantics.addEventListener("input", update, { signal: abort.signal });
  semantics.addEventListener("click", update, { signal: abort.signal });
  semantics.addEventListener("submit", update, { signal: abort.signal });
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        disposed ||
        !(document.activeElement === canvas || semantics.contains(document.activeElement))
      )
        return;
      if (event.key === "Escape" && gui?.closeChoices()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (event.key !== "Tab" || document.activeElement !== canvas) return;
      const enabled = controls().filter((control) => !control.disabled);
      const index = enabled.findIndex(
        (control) => control.dataset.nativeField === gui?.activeField(),
      );
      const next = enabled[index + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        event.stopImmediatePropagation();
        next.focus({ preventScroll: true });
      }
    },
    { capture: true, signal: abort.signal },
  );
  void createPanelScene(canvas, snapshot(), options.modal, abort.signal)
    .then((scene) => {
      if (disposed) {
        scene.dispose();
        return;
      }
      gui = scene;
      update();
    })
    .catch(() => {
      if (!disposed) {
        canvas.hidden = true;
        canvas.style.removeProperty("visibility");
      }
    });
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      gui?.dispose();
      shell.classList.remove("native-panel");
      semantics.removeAttribute("data-native-semantics");
      delete canvas.dataset.panel;
      canvas.hidden = true;
      canvas.style.removeProperty("visibility");
      for (const [name, value] of previous) {
        if (value === null) canvas.removeAttribute(name);
        else canvas.setAttribute(name, value);
      }
    },
  };
}
