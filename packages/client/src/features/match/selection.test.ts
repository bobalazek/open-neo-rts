import { expect, test } from "bun:test";
import { changeSelection } from "./selection";

test("selection replaces, adds and toggles copied handles", () => {
  const none = { shiftKey: false, ctrlKey: false, metaKey: false };
  expect(changeSelection(["a"], ["b", "b"], none)).toEqual(["b"]);
  expect(changeSelection(["a"], ["a", "b"], { ...none, shiftKey: true })).toEqual(["a", "b"]);
  expect(changeSelection(["a"], ["a", "b"], { ...none, ctrlKey: true })).toEqual(["b"]);
  expect(changeSelection(["a"], [], none)).toEqual([]);
});
