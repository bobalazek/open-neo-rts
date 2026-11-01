import { expect, test } from "bun:test";
import { isPlacementDiagnostic } from "./protocol";

test("placement replies validate ticks, cell fields and refusal consistency", () => {
  const cell = { x: 8, y: 8, rule: "land" };
  expect(isPlacementDiagnostic({ tick: 1, ok: true, cells: [cell] })).toBe(true);
  expect(isPlacementDiagnostic({ tick: 1, ok: true })).toBe(true);
  expect(isPlacementDiagnostic({ tick: 1, ok: false, failure: "outside_map" })).toBe(true);
  expect(
    isPlacementDiagnostic({ tick: 1, ok: false, cells: [{ ...cell, failure: "blocked" }] }),
  ).toBe(true);
  for (const malformed of [
    { ok: true, cells: [] },
    { tick: -1, ok: true },
    { tick: 1.5, ok: true },
    { tick: 1, ok: "true" },
    { tick: 1, ok: false },
    { tick: 1, ok: true, failure: "blocked" },
    { tick: 1, ok: false, failure: "unknown" },
    { tick: 1, ok: true, cells: [{ ...cell, x: Number.NaN }] },
    { tick: 1, ok: true, cells: [{ ...cell, y: -1 }] },
    { tick: 1, ok: true, cells: [{ ...cell, rule: "unknown" }] },
    { tick: 1, ok: false, cells: [{ ...cell, failure: "unknown" }] },
    { tick: 1, ok: true, cells: Array(65).fill(cell) },
    { tick: 1, ok: true, cells: Array(1) },
  ])
    expect(isPlacementDiagnostic(malformed)).toBe(false);
});
