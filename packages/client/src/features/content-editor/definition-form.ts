import { text } from "../../shared";

type Shape = Record<string, unknown>;
const object = (value: unknown): value is Shape =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Initial values come from the same schema as validation, never from a second content format. */
export function defaultField(shape: Shape): unknown {
  if (Array.isArray(shape.enum)) return shape.enum[0];
  if (shape.type === "object")
    return Object.fromEntries(
      Object.entries(object(shape.properties) ? shape.properties : {})
        .filter(([key]) => Array.isArray(shape.required) && shape.required.includes(key))
        .map(([key, value]) => [key, defaultField(object(value) ? value : {})]),
    );
  if (shape.type === "array")
    return Array.from({ length: Number(shape.minItems ?? 0) }, () =>
      defaultField(object(shape.items) ? shape.items : {}),
    );
  if (shape.type === "boolean") return false;
  if (shape.type === "number" || shape.type === "integer") return shape.minimum ?? 0;
  return "";
}

/** Keeps input nodes stable while typing; only collection/optional structure changes rebuild a form. */
export function definitionForm(
  host: HTMLElement,
  shape: Shape,
  draft: Shape,
  keys: readonly string[],
  changed: () => void,
  errors = new Map<string, string>(),
  inputs = new Map<string, string>(),
) {
  let changes: { label: string; action(): void }[] = [];
  function change(label: string, action: () => void) {
    changes.push({ label, action });
  }
  function field(
    parent: HTMLElement,
    schema: Shape,
    value: unknown,
    path: string,
    set: (value: unknown) => void,
  ) {
    if (object(schema.properties)) {
      const values = object(value) ? value : {};
      for (const [key, child] of Object.entries(schema.properties)) {
        if (key === "$schema") continue;
        const childShape = object(child) ? child : {};
        const name = path ? `${path}.${key}` : key;
        const required = Array.isArray(schema.required) && schema.required.includes(key);
        if (!required && !Object.hasOwn(values, key)) {
          change(text("ui.editor.add-field", { field: name }), () => {
            values[key] = defaultField(childShape);
            set(values);
            rebuild();
          });
          continue;
        }
        field(parent, childShape, values[key], name, (next) => {
          values[key] = next;
          set(values);
        });
        if (!required)
          change(text("ui.editor.remove-field", { field: name }), () => {
            delete values[key];
            set(values);
            rebuild();
          });
      }
      return;
    }
    if (schema.type === "array") {
      const values = Array.isArray(value) ? value : [];
      const item = object(schema.items) ? schema.items : {};
      values.forEach((entry, index) => {
        field(parent, item, entry, `${path}[${index}]`, (next) => {
          values[index] = next;
          set(values);
        });
        if (values.length > Number(schema.minItems ?? 0))
          change(text("ui.editor.remove-field", { field: `${path}[${index}]` }), () => {
            values.splice(index, 1);
            set(values);
            rebuild();
          });
      });
      if (values.length < Number(schema.maxItems ?? Number.MAX_SAFE_INTEGER))
        change(text("ui.editor.add-field", { field: path }), () => {
          values.push(defaultField(item));
          set(values);
          rebuild();
        });
      return;
    }
    if (schema.type === "object" && object(schema.additionalProperties)) {
      const values = object(value) ? value : {};
      for (const key of Object.keys(values)) {
        field(parent, schema.additionalProperties, values[key], `${path}.${key}`, (next) => {
          values[key] = next;
          set(values);
        });
        change(text("ui.editor.remove-field", { field: `${path}.${key}` }), () => {
          delete values[key];
          set(values);
          rebuild();
        });
      }
      const key = document.createElement("input");
      key.type = "text";
      key.setAttribute("aria-label", text("ui.editor.new-key", { field: path }));
      parent.append(key);
      change(text("ui.editor.add-field", { field: path }), () => {
        if (!key.value || Object.hasOwn(values, key.value)) return;
        Object.defineProperty(values, key.value, {
          value: defaultField(schema.additionalProperties as Shape),
          enumerable: true,
          writable: true,
          configurable: true,
        });
        set(values);
        rebuild();
      });
      return;
    }
    const label = document.createElement("label");
    label.append(path);
    const input = Array.isArray(schema.enum)
      ? document.createElement("select")
      : document.createElement("input");
    input.name = `draft:${path}`;
    input.setAttribute("aria-label", path);
    input.title = String(schema.description ?? "");
    input.setAttribute("data-contextual-help", "");
    if (input instanceof HTMLSelectElement)
      input.append(...(schema.enum as string[]).map((item) => new Option(item, item)));
    else {
      input.type = schema.type === "boolean" ? "checkbox" : "text";
      if (schema.type === "boolean") input.checked = value === true;
      if (schema.type === "number" || schema.type === "integer") input.inputMode = "decimal";
    }
    const opaque = !schema.type && !Array.isArray(schema.enum);
    input.value =
      inputs.get(path) ?? (opaque ? (JSON.stringify(value) ?? "null") : String(value ?? ""));
    input.addEventListener(
      input instanceof HTMLSelectElement || schema.type === "boolean" ? "change" : "input",
      () => {
        errors.delete(path);
        inputs.delete(path);
        let next: unknown = input.value;
        if (input instanceof HTMLInputElement && schema.type === "boolean") next = input.checked;
        else if (schema.type === "number" || schema.type === "integer") {
          next = input.value.trim() ? Number(input.value) : Number.NaN;
          if (!Number.isFinite(next)) errors.set(path, text("ui.editor.number-invalid"));
        } else if (opaque) {
          try {
            next = JSON.parse(input.value);
          } catch {
            errors.set(path, text("ui.editor.json-invalid"));
          }
        }
        if (errors.has(path)) inputs.set(path, input.value);
        if (!errors.has(path)) set(next);
        changed();
      },
    );
    label.append(input);
    parent.append(label);
  }
  function rebuild() {
    host.replaceChildren();
    changes = [];
    const properties = object(shape.properties) ? shape.properties : {};
    field(
      host,
      { ...shape, properties: Object.fromEntries(keys.map((key) => [key, properties[key]])) },
      draft,
      "",
      () => changed(),
    );
    if (changes.length) {
      const picker = document.createElement("select");
      picker.name = "draft-field-change";
      picker.setAttribute("aria-label", text("ui.editor.field-change"));
      picker.append(...changes.map((entry, index) => new Option(entry.label, String(index))));
      const apply = document.createElement("button");
      apply.type = "button";
      apply.textContent = text("ui.editor.apply-change");
      apply.addEventListener("click", () => {
        if (!errors.size) changes[Number(picker.value)]?.action();
      });
      host.append(picker, apply);
    }
    changed();
  }
  rebuild();
  return { errors: () => [...errors].map(([path, message]) => `${path}: ${message}`) };
}
