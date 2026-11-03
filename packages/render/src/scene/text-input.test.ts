import { expect, test } from "bun:test";
import { NativeTextInput } from "./text-input";

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
