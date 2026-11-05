import { expect, test } from "bun:test";
import { NativeTextInput } from "./text-input";

test("typing into an empty native field clears a pointer position awaiting its first draw", () => {
  const field = new NativeTextInput("search", "");
  try {
    Reflect.set(field, "_clickedCoordinate", 20);
    field.processKey(78, "N");
    expect(Reflect.get(field, "_clickedCoordinate")).toBeNull();
    for (const key of "ative gallery proof") field.processKey(key.toUpperCase().charCodeAt(0), key);
    expect(field.text).toBe("Native gallery proof");
  } finally {
    field.dispose();
  }
});

test("semantic UTF-16 ranges map to Babylon Unicode selection without editing the source", () => {
  const field = new NativeTextInput("name", "A🚀BC");
  try {
    field.mirrorSelection({ start: 1, end: 3, direction: "backward" });
    expect(field.text).toBe("A🚀BC");
    field.processKey(8);
    expect(field.text).toBe("ABC");
    field.text = "A🚀BC";
    field.mirrorSelection({ start: 3, end: 3, direction: "none" });
    field.processKey(8);
    expect(field.text).toBe("ABC");
    field.mirrorSelection();
    expect(field.text).toBe("ABC");
  } finally {
    field.dispose();
  }
});
