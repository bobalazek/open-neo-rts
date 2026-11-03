import { expect, test } from "bun:test";
import {
  BINDING_ACTIONS,
  BINDINGS_KEY,
  bindingConflicts,
  bindingLabel,
  controlsHelp,
  defaultBindings,
  keyChord,
  matchesBinding,
  readBindings,
  saveBindings,
  validateBindingFile,
  wasdBindings,
} from "./bindings";

const key = (
  code: string,
  modifiers: Partial<{
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    isComposing: boolean;
  }> = {},
) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  isComposing: false,
  ...modifiers,
});

test("both presets are complete conflict-free profiles with resolved labels and no browser F1 defaults", () => {
  expect(new Set(BINDING_ACTIONS.map((action) => action.id)).size).toBe(BINDING_ACTIONS.length);
  for (const bindings of [defaultBindings(), wasdBindings()]) {
    expect(validateBindingFile({ format: 1, bindings }).bindings).toEqual(bindings);
    expect(bindingConflicts(bindings)).toEqual([]);
    expect(
      Object.values(bindings)
        .flat()
        .some((value) => /F1(\D|$)/.test(value)),
    ).toBe(false);
    for (const action of BINDING_ACTIONS) expect(bindingLabel(action.id)).not.toContain("ui.");
    expect(controlsHelp(bindings)).not.toMatch(/\{[^}]+\}/);
  }
  expect(matchesBinding(wasdBindings(), "move", key("Digit1"))).toBe(true);
  expect(matchesBinding(wasdBindings(), "panLeft", key("KeyA", { shiftKey: true }))).toBe(true);
  expect(matchesBinding(wasdBindings(), "group.select.1", key("Digit1", { altKey: true }))).toBe(
    true,
  );
  expect(
    matchesBinding(wasdBindings(), "group.set.1", key("Digit1", { ctrlKey: true, altKey: true })),
  ).toBe(true);
  expect(
    matchesBinding(wasdBindings(), "group.add.1", key("Digit1", { altKey: true, shiftKey: true })),
  ).toBe(true);
});

test("modifiers, physical codes, queue Shift and conflicts agree across actions", () => {
  const bindings = defaultBindings();
  expect(keyChord(key("KeyJ", { shiftKey: true, ctrlKey: true, altKey: true }))).toBe(
    "Ctrl+Alt+Shift+KeyJ",
  );
  expect(matchesBinding(bindings, "move", key("KeyQ", { shiftKey: true }))).toBe(true);
  expect(matchesBinding(bindings, "move", Object.create(key("KeyQ", { shiftKey: true })))).toBe(
    true,
  );
  expect(matchesBinding(bindings, "move", key("KeyQ", { altKey: true }))).toBe(false);
  expect(matchesBinding(bindings, "move", key("KeyQ", { isComposing: true }))).toBe(false);
  expect(matchesBinding(bindings, "move", key("KeyQ", { metaKey: true }))).toBe(false);
  expect(matchesBinding(bindings, "speedUp", key("Equal", { shiftKey: true }))).toBe(true);
  bindings.move = ["KeyJ", "KeyL"];
  expect(matchesBinding(bindings, "move", key("KeyQ"))).toBe(false);
  expect(matchesBinding(bindings, "move", key("KeyL"))).toBe(true);
  bindings.stop = ["Shift+KeyJ"];
  expect(bindingConflicts(bindings)).toContainEqual(["move", "stop"]);
  expect(() => validateBindingFile({ format: 1, bindings })).toThrow();
  expect(validateBindingFile({ format: 1, bindings }, true).bindings.stop).toEqual(["Shift+KeyJ"]);
});

test("import validation rejects hostile, sparse, reserved and unknown data without calling accessors", () => {
  const bindings = defaultBindings();
  for (const keys of [
    ["F1"],
    ["F3"],
    ["F5"],
    ["F11"],
    ["F12"],
    ["Meta+KeyJ"],
    ["Ctrl+KeyW"],
    ["Alt+F4"],
    ["Escape"],
    ["Tab"],
    ["Shift+Ctrl+KeyJ"],
    ["KeyJ", "KeyJ"],
    ["KeyJ", "KeyL", "KeyK"],
    new Array(1),
    [7],
  ])
    expect(() =>
      validateBindingFile({ format: 1, bindings: { ...bindings, move: keys } }),
    ).toThrow();
  for (const value of [
    null,
    [],
    {},
    { format: 2, bindings },
    { format: 1, bindings, extra: true },
    { format: 1, bindings: { ...bindings, unknown: [] } },
  ])
    expect(() => validateBindingFile(value)).toThrow();
  let called = false;
  const getter = ["KeyJ"];
  Object.defineProperty(getter, "0", {
    get() {
      called = true;
      throw new Error("getter");
    },
  });
  expect(() =>
    validateBindingFile({ format: 1, bindings: { ...bindings, move: getter } }),
  ).toThrow();
  expect(called).toBe(false);
  const file = { format: 1, bindings };
  Object.defineProperty(file, "bindings", {
    get() {
      called = true;
      throw new Error("getter");
    },
  });
  expect(() => validateBindingFile(file)).toThrow();
  expect(called).toBe(false);
});

test("binding storage owns copies, keeps saved controls after failed writes, and safely falls back", () => {
  let raw: string | null = null;
  const storage = {
    getItem: (key: string) => {
      expect(key).toBe(BINDINGS_KEY);
      return raw;
    },
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const bindings = wasdBindings();
  saveBindings(bindings, storage);
  const owned = readBindings(storage);
  bindings.move = ["KeyJ"];
  expect(owned.move).toEqual(["Digit1"]);
  expect(() =>
    saveBindings(defaultBindings(), {
      setItem() {
        throw new Error("quota");
      },
    }),
  ).toThrow("quota");
  expect(readBindings(storage)).toEqual(owned);
  for (const broken of [
    "bad json",
    "x".repeat(65537),
    JSON.stringify({ format: 1, bindings: {} }),
  ]) {
    raw = broken;
    expect(readBindings(storage)).toEqual(defaultBindings());
  }
  expect(
    readBindings({
      getItem() {
        throw new Error("blocked");
      },
    }),
  ).toEqual(defaultBindings());
});
