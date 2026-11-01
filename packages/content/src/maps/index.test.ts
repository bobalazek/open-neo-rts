import { describe, expect, test } from "bun:test";
import { checkTerrain, parseTerrain, type TerrainLayers } from ".";

/** A layer from rows of digits, one per cell. */
const layer = (...rows: string[]) => new Uint8Array([...rows.join("")].map(Number));
const check = (width: number, height: number, layers: TerrainLayers) =>
  checkTerrain(parseTerrain(width, height, layers));

describe("parseTerrain", () => {
  test("a missing layer is all zeros", () => {
    const t = parseTerrain(3, 2, { height: layer("012", "345") });
    expect([...t.level]).toEqual([0, 1, 2, 3, 4, 5]);
    for (const l of [t.ramp, t.surface, t.water]) expect([...l]).toEqual([0, 0, 0, 0, 0, 0]);
  });
  test("rejects a layer of the wrong size", () => {
    expect(() => parseTerrain(3, 2, { water: layer("012") })).toThrow(
      "layers.water is 3 bytes, expected 3 × 2 = 6",
    );
  });
});

describe("checkTerrain", () => {
  test("flat default terrain is valid", () => {
    expect(check(4, 4, {})).toEqual([]);
  });
  test("levels go up to MAX_LEVEL", () => {
    expect(check(2, 1, { height: layer("77") })).toEqual([]);
    expect(check(3, 1, { height: layer("788") })).toEqual(["level above 7 at (1, 0) and 1 more"]);
  });
  test("rejects unknown ramp, surface and water values", () => {
    expect(check(1, 1, { ramps: layer("5") })).toEqual(["unknown ramp value at (0, 0)"]);
    expect(check(1, 1, { surface: layer("8") })).toEqual(["unknown surface at (0, 0)"]);
    expect(check(1, 1, { water: layer("3") })).toEqual(["unknown water value at (0, 0)"]);
  });
  test("a ramp rises exactly one level toward its direction", () => {
    const ramps = layer("0200", "0200");
    expect(check(4, 2, { height: layer("0011", "0011"), ramps })).toEqual([]);
    expect(check(4, 2, { height: layer("0022", "0022"), ramps })).toEqual([
      "ramp doesn't rise exactly one level toward its direction at (1, 0) and 1 more",
    ]);
    expect(check(2, 2, { ramps: layer("11", "00") })).toEqual([
      "ramp doesn't rise exactly one level toward its direction at (0, 0) and 1 more",
    ]);
  });
  test("a ramp run is at least 2 cells wide", () => {
    const height = layer("111", "000");
    expect(check(3, 2, { height, ramps: layer("000", "110") })).toEqual([]);
    expect(check(3, 2, { height, ramps: layer("000", "100") })).toEqual([
      "ramp is narrower than 2 cells at (0, 1)",
    ]);
    // Neighbours rising another way don't widen it.
    expect(check(3, 2, { height, ramps: layer("000", "130") })).toEqual([
      "ramp is narrower than 2 cells at (0, 1) and 1 more",
      "ramp doesn't rise exactly one level toward its direction at (1, 1)",
    ]);
  });
  test("deep water is ringed by shallow water, diagonals included", () => {
    expect(check(3, 3, { water: layer("111", "121", "111") })).toEqual([]);
    expect(check(2, 2, { water: layer("21", "11") })).toEqual([]);
    expect(check(3, 3, { water: layer("011", "121", "111") })).toEqual([
      "deep water touches land without a shallow cell between at (1, 1)",
    ]);
  });
});
