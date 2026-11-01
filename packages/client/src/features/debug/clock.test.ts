import { expect, test } from "bun:test";
import { createPresentationClock } from "./clock";

test("presentation time follows acknowledged pause and speed without jumps", () => {
  const clock = createPresentationClock();
  clock.update(1000, true, 1);
  expect(clock.now(2000)).toBe(0);
  clock.update(2000, false, 0.25);
  expect(clock.now(2200)).toBe(50);
  clock.update(2200, false, 8);
  expect(clock.now(2225)).toBe(250);
  clock.update(2225, true, 8);
  expect(clock.now(5000)).toBe(250);
});
