import { createPanelScene, type PanelContent } from "@open-neo-rts/render";
import { bindNativeTextSelection } from "./native-text-selection";
import { panelBlocks, saveGallery, visiblePanelElement } from "./panel-content";

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
  const identities = new WeakMap<Element, number>();
  let identity = 0;
  const selection = bindNativeTextSelection(
    semantics,
    abort.signal,
    (input) => input.dataset.nativeField,
    (id, range) => gui?.selection(id, range),
  );
  function identify(element: Element) {
    if (!identities.has(element)) identities.set(element, ++identity);
    const key = `panel-node-${identities.get(element)}`;
    if (element instanceof HTMLElement) element.dataset.nativeBlock = key;
    return key;
  }
  function controls() {
    return [
      ...semantics.querySelectorAll<HTMLElement>('input,select,button,summary,[tabindex="0"]'),
    ].filter(visiblePanelElement);
  }
  function snapshot(): PanelContent {
    const allFields = [
      ...semantics.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select"),
    ].filter(visiblePanelElement);
    const fields = allFields.filter(
      (control) => !(control instanceof HTMLInputElement && control.type === "file"),
    );
    const buttons = [...semantics.querySelectorAll<HTMLButtonElement>("button")].filter(
      visiblePanelElement,
    );
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
      control.dataset.nativeAction =
        control.classList.contains("save-row") || control.hasAttribute("data-panel-entry")
          ? identify(control)
          : `native-action-${i}`;
    });
    const gallery = saveGallery(
      semantics,
      (element) => element.dataset.nativeAction ?? identify(element),
    );
    const activePanel = semantics.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
    const result = !!semantics.querySelector("[data-result-summary]");
    const richScope =
      semantics.querySelector("[data-panel-content]") ??
      (result ? (activePanel ?? semantics) : undefined);
    const rich = richScope ? panelBlocks(richScope, identify) : { blocks: [], nodes: [] };
    if (activePanel && rich.blocks[0]) activePanel.dataset.nativeBlock = rich.blocks[0].id;
    const action = (control: HTMLButtonElement) => ({
      id: control.dataset.nativeAction!,
      label: control.textContent ?? "",
      ...(control.hasAttribute("data-contextual-help") && { tooltip: control.title }),
      primary:
        control.classList.contains("primary") ||
        control.hasAttribute("data-resume") ||
        control.getAttribute("aria-selected") === "true",
      back: control.hasAttribute("data-back"),
      resume: control.hasAttribute("data-resume"),
      detail: !!control.closest("[data-save-detail],[data-panel-detail]"),
      footer: control.hasAttribute("data-panel-footer"),
      disabled:
        control.disabled ||
        (control.type === "submit" && !!control.form && !control.form.checkValidity()),
      activate: () => {
        control.focus({ preventScroll: true });
        control.click();
      },
    });
    const notices = (role: string) =>
      [...semantics.querySelectorAll(`[role="${role}"]`)]
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .join(" · ");
    const progress = semantics.querySelector("progress");
    return {
      id: options.id(),
      revision:
        [...fields, ...buttons, ...(gallery?.nodes ?? []), ...rich.nodes].map(identify).join(",") +
        [...semantics.querySelectorAll("details")]
          .filter(visiblePanelElement)
          .map((node) => node.open)
          .join(","),
      fieldRevision: fields.map(identify).join(","),
      title: options.title(),
      text:
        gallery || result
          ? ""
          : [...semantics.querySelectorAll("p:not([role])")]
              .filter(visiblePanelElement)
              .filter((node) => !rich.nodes.includes(node))
              .map((node) => node.textContent?.trim())
              .filter(Boolean)
              .join("\n\n"),
      status: [semantics.querySelector("[data-result-summary]")?.textContent, notices("status")]
        .filter(Boolean)
        .join(" · "),
      error: notices("alert"),
      ...(progress && { progress: { value: progress.value, max: progress.max } }),
      scale: (Number.parseFloat(document.documentElement.style.fontSize) || 100) / 100,
      fields: fields.map((control) => ({
        id: control.dataset.nativeField!,
        label: label(control),
        help: control.hasAttribute("data-contextual-help")
          ? ""
          : (control.closest("label")?.querySelector("small")?.textContent ?? control.title),
        ...(control.hasAttribute("data-contextual-help") && { tooltip: control.title }),
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
      tabs: buttons.filter((control) => control.getAttribute("role") === "tab").map(action),
      blocks: rich.blocks,
      ...(gallery && { gallery: { items: gallery.items, detail: gallery.detail } }),
      actions: [
        ...buttons
          .filter(
            (control) =>
              !control.classList.contains("save-row") &&
              !control.hasAttribute("data-panel-entry") &&
              control.getAttribute("role") !== "tab",
          )
          .map(action),
        ...allFields
          .filter((control) => control instanceof HTMLInputElement && control.type === "file")
          .map((control) => ({
            id: identify(control),
            label: label(control),
            primary: false,
            back: false,
            disabled: control.disabled,
            activate: () => control.click(),
          })),
      ],
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
    selection.sync();
    const key = `${content.id}:${content.revision}:${content.scale}`;
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
      if (active instanceof HTMLElement && semantics.contains(active))
        gui?.focus(
          active.dataset.nativeField ?? active.dataset.nativeAction ?? active.dataset.nativeBlock,
        );
    });
  }
  semantics.addEventListener(
    "focusin",
    (event) => {
      const control = event.target;
      if (control instanceof HTMLElement)
        gui?.focus(
          control.dataset.nativeField ??
            control.dataset.nativeAction ??
            control.dataset.nativeBlock,
        );
    },
    { signal: abort.signal },
  );
  semantics.addEventListener("change", update, { signal: abort.signal });
  semantics.addEventListener("input", update, { signal: abort.signal });
  semantics.addEventListener("click", update, { signal: abort.signal });
  semantics.addEventListener("submit", update, { signal: abort.signal });
  semantics.addEventListener("toggle", update, { capture: true, signal: abort.signal });
  semantics.addEventListener(
    "keydown",
    (event) => {
      const region = event.target;
      if (
        shell.classList.contains("native-panel") &&
        region instanceof HTMLElement &&
        region.matches('[role="region"]') &&
        region.dataset.nativeBlock &&
        gui?.scrollKey(region.dataset.nativeBlock, event.key)
      )
        event.preventDefault();
      // Native tab handlers may stop bubbling; read their result after dispatch completes.
      requestAnimationFrame(update);
    },
    { capture: true, signal: abort.signal },
  );
  semantics.addEventListener(
    "scroll",
    (event) => {
      const region = event.target;
      if (!(region instanceof HTMLElement) || !region.dataset.nativeBlock) return;
      gui?.scrollTo(
        region.dataset.nativeBlock,
        region.scrollLeft / Math.max(1, region.scrollWidth - region.clientWidth),
        region.scrollTop / Math.max(1, region.scrollHeight - region.clientHeight),
      );
    },
    { capture: true, signal: abort.signal },
  );
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
      const enabled = controls().filter(
        (control) => control.tabIndex >= 0 && !("disabled" in control && control.disabled),
      );
      const index = enabled.findIndex(
        (control) =>
          (control.dataset.nativeField ??
            control.dataset.nativeAction ??
            control.dataset.nativeBlock) === gui?.activeField(),
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
