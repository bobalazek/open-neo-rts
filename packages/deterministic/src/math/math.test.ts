import { describe, expect, test } from "bun:test";
import { createStream, nextU32 } from "../random";
import { divFloor, isqrt, mulDiv } from ".";

describe("divFloor", () => {
  test("rounds toward negative infinity", () => {
    expect([divFloor(7, 2), divFloor(-7, 2), divFloor(7, -2), divFloor(-7, -2)]).toEqual([
      3, -4, -4, 3,
    ]);
    expect(divFloor(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(divFloor(Number.MAX_SAFE_INTEGER, 2)).toBe(4503599627370495);
  });
  test("matches BigInt division across the safe range", () => {
    const s = createStream(1, "divFloor");
    for (let i = 0; i < 2000; i++) {
      const a = (nextU32(s) * 0x200000 + (nextU32(s) >>> 11)) * (i % 2 ? -1 : 1);
      const b = (nextU32(s) % 100000) + 1;
      const q = BigInt(a) / BigInt(b);
      const floor = BigInt(a) % BigInt(b) !== 0n && a < 0 ? q - 1n : q;
      expect(divFloor(a, b)).toBe(Number(floor));
    }
  });
  test("rejects zero, fractions and unsafe values", () => {
    expect(() => divFloor(1, 0)).toThrow(RangeError);
    expect(() => divFloor(1.5, 1)).toThrow(RangeError);
    expect(() => divFloor(2 ** 53, 1)).toThrow(RangeError);
  });
});

describe("mulDiv", () => {
  test("multiplies first, divides once", () => {
    expect(mulDiv(1000, 1500, 1000)).toBe(1500);
    expect(mulDiv(7, 333, 1000)).toBe(2); // 2.331
    expect(mulDiv(-1, 1, 3)).toBe(-1);
  });
  test("rejects products at or above 2^53", () => {
    expect(() => mulDiv(2 ** 30, 2 ** 30, 1)).toThrow(RangeError);
  });
});

describe("isqrt", () => {
  test("edges and perfect squares", () => {
    expect([0, 1, 2, 3, 4, 8, 9, 15, 16].map(isqrt)).toEqual([0, 1, 1, 1, 2, 2, 3, 3, 4]);
    const k = 94906265; // floor(sqrt(2^53 - 1))
    expect(isqrt(k * k)).toBe(k);
    expect(isqrt(k * k - 1)).toBe(k - 1);
    expect(isqrt(Number.MAX_SAFE_INTEGER)).toBe(k);
  });
  test("r * r <= n < (r + 1)^2 across the safe range", () => {
    const s = createStream(1, "isqrt");
    for (let i = 0; i < 5000; i++) {
      const n = nextU32(s) * 0x200000 + (nextU32(s) >>> 11);
      const r = BigInt(isqrt(n));
      expect(r * r <= BigInt(n) && BigInt(n) < (r + 1n) * (r + 1n)).toBe(true);
    }
  });
  test("rejects negatives and fractions", () => {
    expect(() => isqrt(-1)).toThrow(RangeError);
    expect(() => isqrt(2.5)).toThrow(RangeError);
  });
});
