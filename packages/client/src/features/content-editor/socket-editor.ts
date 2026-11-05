import { type ModelKind, modelRequirements } from "@open-neo-rts/content";
import { validateAssetGlb } from "@open-neo-rts/content/asset-validation";
import type { createModelPreview } from "@open-neo-rts/render";
import { text } from "../../shared";
import { exportSocketGlb, socketModel } from "./sockets";

export async function mountSocketEditor(
  host: HTMLElement,
  preview: Awaited<ReturnType<typeof createModelPreview>>,
  source: { bytes: Uint8Array; kind: ModelKind; raw?: Record<string, unknown> },
  options: {
    signal: AbortSignal;
    update(): void;
    apply(bytes: Uint8Array): Promise<void>;
    cancel(): void;
  },
) {
  const requirements = modelRequirements(
    source.raw ?? {},
    (source.raw?.presentation ?? {}) as Record<string, unknown>,
    source.kind,
  );
  const validate = async (bytes: Uint8Array) => {
    const errors = (
      await validateAssetGlb(bytes, "edited.glb", { kind: source.kind, requires: requirements })
    ).filter((issue) => issue.level === "error");
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join("; "));
  };
  await validate(source.bytes);
  options.signal.throwIfAborted();
  const model = socketModel(source.bytes);
  const root = document.createElement("section");
  root.dataset.socketEditor = "";
  root.innerHTML = `<h2>${text("ui.sockets.title")}</h2><label>${text("ui.sockets.selected")}<select name="socket-node"></select></label><label>${text("ui.sockets.mode")}<select name="socket-mode"><option value="move">${text("ui.sockets.move")}</option><option value="rotate">${text("ui.sockets.rotate")}</option></select></label>`;
  const abort = new AbortController();
  let disposed = false,
    busy = false,
    dirty = false;
  let nextIndex = model.nodes.length;
  let selectedValue = "";
  const invalid = new Set<string>();
  const inputs: HTMLInputElement[] = [];
  const select = root.querySelector<HTMLSelectElement>('[name="socket-node"]')!;
  const mode = root.querySelector<HTMLSelectElement>('[name="socket-mode"]')!;
  select.setAttribute("aria-label", text("ui.sockets.selected"));
  mode.setAttribute("aria-label", text("ui.sockets.mode"));
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  function sync() {
    if (disposed) return;
    const values = tool.values();
    for (const [index, input] of inputs.entries()) {
      input.disabled = busy || !values;
      if (values && document.activeElement !== input && !invalid.has(input.name))
        input.value = String(
          Number((index < 3 ? values.position[index]! : values.angles[index - 3]!).toFixed(4)),
        );
    }
    mode.disabled = busy || !values;
    select.disabled = busy || !select.options.length;
    name.disabled = parent.disabled = busy;
    add.disabled =
      busy ||
      !/^socket_[a-z]+(_\d+)?$/.test(name.value) ||
      tool.entries.some((entry) => entry.name === name.value);
    apply.disabled = busy || !dirty || !!invalid.size;
    cancel.disabled = busy;
    status.textContent = busy
      ? text("ui.sockets.validating")
      : dirty
        ? text("ui.sockets.unsaved")
        : text("ui.sockets.ready");
    options.update();
  }
  const tool = preview.editSockets(model.nodes, () => {
    dirty = true;
    sync();
  });
  for (const [index, label] of (["x", "y", "z", "rx", "ry", "rz"] as const).entries()) {
    const field = document.createElement("label"),
      input = document.createElement("input");
    field.textContent = text(`ui.sockets.${label}`);
    input.type = "text";
    input.setAttribute("aria-label", text(`ui.sockets.${label}`));
    input.inputMode = "decimal";
    input.name = `socket-${label}`;
    input.title = text("ui.sockets.help");
    input.setAttribute("data-contextual-help", "");
    input.addEventListener(
      "input",
      () => {
        dirty = true;
        try {
          if (!input.value.trim()) throw new Error(text("ui.sockets.invalid"));
          tool.set(index % 3, index >= 3, Number(input.value));
          invalid.delete(input.name);
          error.textContent = invalid.size ? text("ui.sockets.invalid") : "";
        } catch {
          invalid.add(input.name);
          error.textContent = text("ui.sockets.invalid");
        }
        sync();
      },
      { signal: abort.signal },
    );
    field.append(input);
    root.append(field);
    inputs.push(input);
  }
  const parent = document.createElement("select"),
    name = document.createElement("input");
  parent.name = "socket-parent";
  name.name = "socket-name";
  name.maxLength = 64;
  for (const [label, control] of [
    ["ui.sockets.parent", parent],
    ["ui.sockets.name", name],
  ] as const) {
    const field = document.createElement("label");
    field.textContent = text(label);
    control.setAttribute("aria-label", text(label));
    field.append(control);
    root.append(field);
  }
  parent.append(
    new Option(text("ui.sockets.root"), "root"),
    ...tool.entries.map((entry) => new Option(entry.name, String(entry.index))),
  );
  const button = (key: "add" | "apply" | "cancel", activate: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text(`ui.sockets.${key}`);
    if (key !== "add") button.setAttribute("data-panel-footer", "");
    button.addEventListener("click", activate, { signal: abort.signal });
    root.append(button);
    return button;
  };
  function choices(index?: number) {
    select.replaceChildren(
      ...tool.entries
        .filter((entry) => entry.editable)
        .map((entry) => new Option(entry.name, String(entry.index))),
    );
    if (index !== undefined) select.value = String(index);
    selectedValue = select.value;
    tool.select(Number(select.value), mode.value as "move" | "rotate");
  }
  const add = button("add", () => {
    try {
      const index = nextIndex;
      tool.add(index, name.value, parent.value === "root" ? null : Number(parent.value));
      nextIndex++;
      choices(index);
      parent.append(new Option(name.value, String(index)));
      name.value = "";
      error.textContent = "";
      sync();
    } catch (failure) {
      error.textContent = failure instanceof Error ? failure.message : text("ui.sockets.invalid");
      options.update();
    }
  });
  const apply = button(
    "apply",
    () =>
      void (async () => {
        if (busy || !dirty || invalid.size) return;
        busy = true;
        error.textContent = "";
        sync();
        try {
          const bytes = exportSocketGlb(source.bytes, tool.changes());
          await validate(bytes);
          if (!disposed) await options.apply(bytes);
        } catch (failure) {
          if (!disposed)
            error.textContent =
              failure instanceof Error ? failure.message : text("ui.sockets.invalid");
        } finally {
          busy = false;
          sync();
        }
      })(),
  );
  const canReplace = () =>
    !busy && (!(dirty || name.value) || window.confirm(text("ui.sockets.discard")));
  const cancel = button("cancel", () => {
    if (canReplace()) options.cancel();
  });
  root.append(status, error);
  host.append(root);
  name.addEventListener("input", sync, { signal: abort.signal });
  select.addEventListener(
    "change",
    () => {
      if (invalid.size) {
        select.value = selectedValue;
        error.textContent = text("ui.sockets.invalid");
        options.update();
        return;
      }
      selectedValue = select.value;
      invalid.clear();
      error.textContent = "";
      tool.select(Number(select.value), mode.value as "move" | "rotate");
      sync();
    },
    { signal: abort.signal },
  );
  mode.addEventListener("change", () => tool.mode(mode.value as "move" | "rotate"), {
    signal: abort.signal,
  });
  choices();
  sync();
  return {
    canReplace,
    dirty: () => dirty || !!name.value,
    busy: () => busy,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      tool.dispose();
      root.remove();
    },
  };
}
