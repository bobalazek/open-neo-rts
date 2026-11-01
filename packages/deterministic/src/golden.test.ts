import { expect, test } from "bun:test";
import { GOLDEN, golden } from "./golden";

// The same check runs in Chromium, Firefox and WebKit: apps/web/e2e/determinism.e2e.ts.
test("every function matches its golden digest", () => {
  expect(golden()).toEqual(GOLDEN);
});
