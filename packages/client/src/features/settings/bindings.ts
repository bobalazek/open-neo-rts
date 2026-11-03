import { text } from "../../shared";

export const BINDINGS_KEY = "open-neo-rts.bindings.v1";
export const BINDINGS_CHANGED = "open-neo-rts.bindings-changed";
export const CONTROL_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;
export const COMMAND_ACTIONS = [
  "move",
  "attack",
  "harvest",
  "rally",
  "attackMove",
  "stop",
  "assist",
  "repair",
  "cancelWork",
  "power",
  "sell",
  "rotate",
] as const;
const commandKeys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
const commandLabels = [
  "move",
  "attack",
  "harvest",
  "rally",
  "attack-move",
  "stop",
  "assist",
  "repair",
  "cancel-work",
  "power-off",
  "sell",
  "rotate",
];
export const BINDING_ACTIONS = [
  ...COMMAND_ACTIONS.map((id, i) => ({
    id,
    category: "orders",
    label: `ui.hud.${commandLabels[i]}`,
    keys: [`Key${commandKeys[i]}`],
    allowShift: true,
  })),
  { id: "hold", category: "orders", label: "ui.hud.hold", keys: ["KeyH"], allowShift: true },
  { id: "unload", category: "orders", label: "ui.hud.unload", keys: ["KeyU"], allowShift: true },
  { id: "load", category: "orders", label: "ui.hud.load", keys: [], allowShift: true },
  { id: "deploy", category: "orders", label: "ui.hud.deploy-toggle", keys: [], allowShift: true },
  { id: "salvage", category: "orders", label: "ui.hud.clear-remains", keys: [], allowShift: true },
  { id: "surge", category: "orders", label: "ui.hud.surge", keys: [], allowShift: true },
  {
    id: "panUp",
    category: "camera",
    label: "ui.bindings.pan-up",
    keys: ["ArrowUp"],
    allowShift: true,
  },
  {
    id: "panDown",
    category: "camera",
    label: "ui.bindings.pan-down",
    keys: ["ArrowDown"],
    allowShift: true,
  },
  {
    id: "panLeft",
    category: "camera",
    label: "ui.bindings.pan-left",
    keys: ["ArrowLeft"],
    allowShift: true,
  },
  {
    id: "panRight",
    category: "camera",
    label: "ui.bindings.pan-right",
    keys: ["ArrowRight"],
    allowShift: true,
  },
  {
    id: "resetCamera",
    category: "camera",
    label: "ui.bindings.reset-camera",
    keys: ["Backspace"],
    allowShift: false,
  },
  { id: "home", category: "camera", label: "ui.bindings.home", keys: ["Home"], allowShift: false },
  {
    id: "alert",
    category: "camera",
    label: "ui.bindings.alert",
    keys: ["Space"],
    allowShift: false,
  },
  {
    id: "idleBuilder",
    category: "selection",
    label: "ui.bindings.idle-builder",
    keys: ["Period"],
    allowShift: false,
  },
  {
    id: "idleProducer",
    category: "selection",
    label: "ui.bindings.idle-producer",
    keys: ["Comma"],
    allowShift: false,
  },
  {
    id: "details",
    category: "selection",
    label: "ui.bindings.details",
    keys: ["KeyI"],
    allowShift: false,
  },
  {
    id: "buildMenu",
    category: "selection",
    label: "ui.bindings.build-menu",
    keys: ["KeyB"],
    allowShift: false,
  },
  {
    id: "pause",
    category: "match",
    label: "ui.bindings.pause",
    keys: ["Pause"],
    allowShift: false,
  },
  {
    id: "speedUp",
    category: "match",
    label: "ui.bindings.speed-up",
    keys: ["Equal", "NumpadAdd"],
    allowShift: true,
  },
  {
    id: "speedDown",
    category: "match",
    label: "ui.bindings.speed-down",
    keys: ["Minus", "NumpadSubtract"],
    allowShift: true,
  },
  {
    id: "quicksave",
    category: "match",
    label: "ui.bindings.quicksave",
    keys: [],
    allowShift: false,
  },
  {
    id: "quickload",
    category: "match",
    label: "ui.bindings.quickload",
    keys: [],
    allowShift: false,
  },
  ...CONTROL_GROUPS.flatMap((index) => [
    {
      id: `group.select.${index}` as const,
      category: "groups",
      label: "select",
      keys: [`Digit${index}`],
      allowShift: false,
    },
    {
      id: `group.set.${index}` as const,
      category: "groups",
      label: "set",
      keys: [`Ctrl+Digit${index}`],
      allowShift: false,
    },
    {
      id: `group.add.${index}` as const,
      category: "groups",
      label: "add",
      keys: [`Shift+Digit${index}`],
      allowShift: false,
    },
  ]),
] as const;
export type BindingAction = (typeof BINDING_ACTIONS)[number]["id"];
export type KeyBindings = Record<BindingAction, readonly string[]>;
export interface BindingFile {
  format: 1;
  bindings: KeyBindings;
}
export type KeyStroke = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing"
>;

export function bindingLabel(id: BindingAction): string {
  const action = BINDING_ACTIONS.find((item) => item.id === id)!;
  if (id.startsWith("group.")) {
    const [, operation, index] = id.split(".");
    return text(`ui.bindings.group-${operation}` as "ui.bindings.group-select", { group: index! });
  }
  return text(action.label as "ui.hud.move");
}
export function defaultBindings(): KeyBindings {
  const bindings = {} as KeyBindings;
  for (const action of BINDING_ACTIONS) bindings[action.id] = [...action.keys];
  return bindings;
}
export function wasdBindings(): KeyBindings {
  const bindings = defaultBindings();
  for (const [index, action] of COMMAND_ACTIONS.entries())
    bindings[action] = [index < 10 ? `Digit${(index + 1) % 10}` : index === 10 ? "Minus" : "Equal"];
  bindings.panUp = ["KeyW"];
  bindings.panDown = ["KeyS"];
  bindings.panLeft = ["KeyA"];
  bindings.panRight = ["KeyD"];
  bindings.speedUp = ["BracketRight", "NumpadAdd"];
  bindings.speedDown = ["BracketLeft", "NumpadSubtract"];
  for (const index of CONTROL_GROUPS) {
    bindings[`group.select.${index}`] = [`Alt+Digit${index}`];
    bindings[`group.set.${index}`] = [`Ctrl+Alt+Digit${index}`];
    bindings[`group.add.${index}`] = [`Alt+Shift+Digit${index}`];
  }
  return bindings;
}

/** Physical key codes keep saved controls independent of typed text and keyboard language. */
export function keyChord(event: KeyStroke): string | null {
  if (
    event.metaKey ||
    event.isComposing ||
    !/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal)|Arrow(Up|Down|Left|Right)|F([2-9]|10)|Space|Home|End|PageUp|PageDown|Pause|Backspace|Insert|Delete|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/.test(
      event.code,
    )
  )
    return null;
  return `${event.ctrlKey ? "Ctrl+" : ""}${event.altKey ? "Alt+" : ""}${event.shiftKey ? "Shift+" : ""}${event.code}`;
}
function validChord(chord: string): boolean {
  const parts = chord.split("+");
  const code = parts.pop()!;
  const stroke = {
    code,
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
    metaKey: false,
    isComposing: false,
  };
  if (keyChord(stroke) !== chord) return false;
  // Browser/OS accelerators cannot be promised by a web game; keep them available to the host.
  if (
    ["F3", "F5"].includes(code) ||
    (stroke.altKey && ["F4", "ArrowLeft", "ArrowRight", "Home"].includes(code)) ||
    (stroke.ctrlKey &&
      !stroke.altKey &&
      [
        "KeyW",
        "KeyT",
        "KeyN",
        "KeyL",
        "KeyR",
        "KeyQ",
        "KeyP",
        "KeyF",
        "KeyJ",
        "KeyH",
        "KeyS",
        "KeyO",
        "KeyD",
        "KeyU",
        "Equal",
        "Minus",
      ].includes(code))
  )
    return false;
  return true;
}
export function chordText(chord: string): string {
  const punctuation: Record<string, string> = {
    Period: ".",
    Comma: ",",
    Minus: "−",
    Equal: "+",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Slash: "/",
    Backquote: "`",
  };
  return chord
    .split("+")
    .map((part) => punctuation[part] ?? part.replace(/^Key|^Digit/, "").replace(/^Arrow/, ""))
    .join("+");
}
export function bindingText(bindings: KeyBindings, action: BindingAction): string {
  return bindings[action].map(chordText).join(" / ") || text("ui.bindings.unbound");
}
export function controlsHelp(bindings: KeyBindings): string {
  return text("ui.menu.keys-help", {
    ...Object.fromEntries(
      BINDING_ACTIONS.filter((action) => !action.id.startsWith("group.")).map((action) => [
        action.id,
        bindingText(bindings, action.id),
      ]),
    ),
    groupSelect: bindingText(bindings, "group.select.1"),
    groupSet: bindingText(bindings, "group.set.1"),
    groupAdd: bindingText(bindings, "group.add.1"),
  });
}
export function matchesBinding(
  bindings: KeyBindings,
  action: BindingAction,
  event: KeyStroke,
): boolean {
  const chord = keyChord(event);
  if (!chord) return false;
  return bindings[action].some(
    (key) =>
      key === chord ||
      (event.shiftKey &&
        BINDING_ACTIONS.find((item) => item.id === action)?.allowShift &&
        key === chord.replace("Shift+", "")),
  );
}
export function bindingConflicts(bindings: KeyBindings): [BindingAction, BindingAction][] {
  const seen = new Map<string, BindingAction>();
  const conflicts: [BindingAction, BindingAction][] = [];
  for (const action of BINDING_ACTIONS)
    for (const chord of bindings[action.id]) {
      const variants = [chord];
      if (action.allowShift && !chord.includes("Shift+")) {
        const parts = chord.split("+");
        const code = parts.pop()!;
        variants.push([...parts, "Shift", code].join("+"));
      }
      for (const key of variants) {
        const previous = seen.get(key);
        if (
          previous &&
          previous !== action.id &&
          !conflicts.some(([a, b]) => a === previous && b === action.id)
        )
          conflicts.push([previous, action.id]);
        else seen.set(key, action.id);
      }
    }
  return conflicts;
}
function ownData(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(text("ui.bindings.invalid"));
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== Object.keys(fields).length ||
    Object.values(fields).some((field) => !("value" in field))
  )
    throw new Error(text("ui.bindings.invalid"));
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value]));
}
export function validateBindingFile(value: unknown, allowConflicts = false): BindingFile {
  const file = ownData(value);
  if (Object.keys(file).sort().join(",") !== "bindings,format" || file.format !== 1)
    throw new Error(text("ui.bindings.invalid"));
  const input = ownData(file.bindings),
    bindings = defaultBindings();
  if (
    Object.keys(input).length !== BINDING_ACTIONS.length ||
    Object.keys(input).some((id) => !BINDING_ACTIONS.some((action) => action.id === id))
  )
    throw new Error(text("ui.bindings.invalid"));
  for (const action of BINDING_ACTIONS) {
    const keys = input[action.id];
    if (!Array.isArray(keys) || Object.getPrototypeOf(keys) !== Array.prototype || keys.length > 2)
      throw new Error(text("ui.bindings.invalid"));
    const fields = Object.getOwnPropertyDescriptors(keys);
    if (
      Reflect.ownKeys(keys).length !== keys.length + 1 ||
      Object.values(fields).some((field) => !("value" in field)) ||
      Object.keys(keys).length !== keys.length ||
      keys.some((key) => typeof key !== "string" || key.length > 64 || !validChord(key)) ||
      new Set(keys).size !== keys.length
    )
      throw new Error(text("ui.bindings.invalid"));
    bindings[action.id] = [...keys];
  }
  if (!allowConflicts && bindingConflicts(bindings).length)
    throw new Error(text("ui.bindings.conflicts"));
  return { format: 1, bindings };
}
export function readBindings(storage?: Pick<Storage, "getItem">): KeyBindings {
  try {
    const raw = (storage ?? localStorage).getItem(BINDINGS_KEY);
    if (raw === null || raw.length > 64 * 1024) return defaultBindings();
    return validateBindingFile(JSON.parse(raw)).bindings;
  } catch {
    return defaultBindings();
  }
}
export function saveBindings(bindings: KeyBindings, storage?: Pick<Storage, "setItem">) {
  (storage ?? localStorage).setItem(
    BINDINGS_KEY,
    JSON.stringify(validateBindingFile({ format: 1, bindings })),
  );
}
