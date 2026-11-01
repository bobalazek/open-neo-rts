import { describe, expect, test } from "bun:test";
import { createStream, nextInt } from "../random";
import { atan2, cos, sin } from ".";

const TURN = 65536;
const QUARTER = 16384;
const HALF = 32768;

/** Shortest distance between two angles, in binary angle units. */
function angleDiff(a: number, b: number): number {
  const d = (((a - b) % TURN) + TURN) % TURN;
  return Math.min(d, TURN - d);
}

describe("sin and cos", () => {
  test("golden values", () => {
    const angles = [0, 1, 2731, 4096, 5461, 8192, 10923, 12288, 16383, 16384, 32768, 40000, 49152];
    expect(angles.map(sin)).toEqual([
      0, 2, 4241, 6270, 8192, 11585, 14189, 15137, 16384, 16384, 0, -10471, -16384,
    ]);
    expect(angles.map(cos)).toEqual([
      16384, 16384, 15826, 15137, 14189, 11585, 8192, 6270, 2, 0, -16384, -12601, 0,
    ]);
  });
  test("table endpoints, and the quarter turn rises by 0 to 2 per unit", () => {
    expect([sin(0), sin(QUARTER), sin(HALF), sin(3 * QUARTER)]).toEqual([0, 16384, 0, -16384]);
    const bad: number[] = [];
    for (let a = 1; a <= QUARTER; a++) {
      const d = sin(a) - sin(a - 1);
      if (d < 0 || d > 2) bad.push(a);
    }
    expect(bad).toEqual([]);
  });
  test("symmetries hold for every angle", () => {
    const bad: number[] = [];
    for (let a = 0; a < TURN; a++) {
      const s = sin(a);
      if (
        sin(HALF - a) !== s ||
        sin(a + HALF) !== -s ||
        sin(-a) !== -s ||
        cos(a) !== sin(a + QUARTER) ||
        cos(-a) !== cos(a) ||
        Math.abs(s) > 16384
      )
        bad.push(a);
    }
    expect(bad).toEqual([]);
  });
  test("wraps any integer angle, never returns -0", () => {
    for (const a of [0, 1, 5461, 40000, 65535]) {
      for (const k of [-3, -1, 1, 1000, 2 ** 36]) {
        expect(sin(a + k * TURN)).toBe(sin(a));
        expect(cos(a + k * TURN)).toBe(cos(a));
      }
    }
    expect([sin(HALF), sin(-HALF), cos(QUARTER), cos(-QUARTER)]).toEqual([0, 0, 0, 0]); // Object.is, so -0 fails
  });
});

describe("atan2", () => {
  test("compass directions are exact at every magnitude", () => {
    for (const r of [1, 7, 1024, 2 ** 19, 2 ** 20, 2 ** 28 - 1]) {
      expect([
        atan2(0, r),
        atan2(r, r),
        atan2(r, 0),
        atan2(r, -r),
        atan2(0, -r),
        atan2(-r, -r),
        atan2(-r, 0),
        atan2(-r, r),
      ]).toEqual([0, 8192, 16384, 24576, 32768, 40960, 49152, 57344]);
    }
    expect(atan2(0, 0)).toBe(0);
  });
  test("golden values, each within 1 unit of the true angle", () => {
    // [y, x, atan2(y, x), true angle from Math.atan2 offline]
    const cases: [number, number, number, number][] = [
      [1, 1048576, 0, 0.01],
      [1048576, 1, 16384, 16383.99],
      [-1, 1048576, 0, 65535.99],
      [1, 2, 4836, 4836.02],
      [2, 1, 11548, 11547.98],
      [3, -4, 26056, 26056.04],
      [-5, -12, 36886, 36885.82],
      [7, 24, 2960, 2960.08],
      [-1048576, 1048575, 57344, 57344.0],
      [123456, -654321, 30823, 30822.88],
      [-524288, 3, 49152, 49152.06],
      [1, -1048576, 32768, 32767.99],
    ];
    for (const [y, x, angle, truth] of cases) {
      expect(atan2(y, x)).toBe(angle);
      expect(angleDiff(angle, truth)).toBeLessThanOrEqual(1);
    }
  });
  test("inverts sin and cos within 2 units for every angle, at any scale", () => {
    const bad: number[] = [];
    for (let a = 0; a < TURN; a++) {
      const angle = atan2(sin(a), cos(a));
      if (angleDiff(angle, a) > 2 || atan2(sin(a) * 64, cos(a) * 64) !== angle) bad.push(a);
    }
    expect(bad).toEqual([]);
  });
  test("random vectors across the input range lie within 2 units of the result", () => {
    // Integer-only check: (x, y) must sit between the table directions at angle - 2 and angle + 2.
    const s = createStream(1, "atan2");
    const bad: [number, number][] = [];
    for (let i = 0; i < 100000; i++) {
      const r = [2 ** 10, 2 ** 20, 2 ** 28 - 1][i % 3] ?? 0;
      const y = nextInt(s, 2 * r + 1) - r;
      const x = nextInt(s, 2 * r + 1) - r;
      const angle = atan2(y, x);
      const fromBelow = cos(angle - 2) * y - sin(angle - 2) * x; // cross products stay below 2^43
      const fromAbove = cos(angle + 2) * y - sin(angle + 2) * x;
      if (fromBelow < 0 || fromAbove > 0) bad.push([y, x]);
    }
    expect(bad).toEqual([]);
  });
  test("rejects fractions and values beyond 2^28 - 1", () => {
    expect(() => atan2(1.5, 1)).toThrow(RangeError);
    expect(() => atan2(1, Number.NaN)).toThrow(RangeError);
    expect(() => atan2(2 ** 28, 0)).toThrow(RangeError);
    expect(() => atan2(0, -(2 ** 28))).toThrow(RangeError);
  });
});
