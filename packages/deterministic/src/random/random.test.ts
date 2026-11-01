import { describe, expect, test } from "bun:test";
import { fnv1a32 } from "../hash";
import { createStream, nextInt, nextU32, splitmix32 } from ".";

// Reference implementations with BigInt arithmetic mod 2^32, written from the algorithm definitions,
// so the 32-bit tricks (`| 0`, `>>> 0`, `Math.imul`) are checked against plain math.
const M = 0xffffffffn;
const u = (x: bigint) => x & M;
const rotl = (x: bigint, k: bigint) => u((x << k) | (x >> (32n - k)));

function refSplitmix32(state: bigint): [bigint, bigint] {
  const next = u(state + 0x9e3779b9n);
  let t = next ^ (next >> 16n);
  t = u(t * 0x21f0aaadn);
  t ^= t >> 15n;
  t = u(t * 0x735a2d97n);
  t ^= t >> 15n;
  return [next, t];
}

function refSfc32(w: bigint[]): () => bigint {
  let [a = 0n, b = 0n, c = 0n, d = 0n] = w;
  return () => {
    const t = u(a + b + d);
    d = u(d + 1n);
    a = b ^ (b >> 9n);
    b = u(c + (c << 3n));
    c = u(rotl(c, 21n) + t);
    return t;
  };
}

describe("splitmix32", () => {
  test("matches the BigInt reference", () => {
    let s = 0xdeadbeef;
    let r = 0xdeadbeefn;
    for (let i = 0; i < 1000; i++) {
      const [next, value] = splitmix32(s);
      const [refNext, refValue] = refSplitmix32(r);
      expect([next, value]).toEqual([Number(refNext), Number(refValue)]);
      s = next;
      r = refNext;
    }
  });
});

describe("sfc32 streams", () => {
  test("match the BigInt reference, including seeding and warm-up", () => {
    for (const [seed, name] of [
      [1, "combat"],
      [0, ""],
      [0xffffffff, "ai:3"],
    ] as const) {
      let state = BigInt((seed ^ fnv1a32(name)) >>> 0);
      const words: bigint[] = [];
      for (let i = 0; i < 4; i++) {
        const [next, value] = refSplitmix32(state);
        state = next;
        words.push(value);
      }
      const ref = refSfc32(words);
      for (let i = 0; i < 12; i++) ref();
      const s = createStream(seed, name);
      for (let i = 0; i < 1000; i++) expect(nextU32(s)).toBe(Number(ref()));
    }
  });
  test("golden values", () => {
    const s = createStream(1, "combat");
    expect(Array.from({ length: 5 }, () => nextU32(s))).toEqual([
      4265047675, 2726983378, 538365688, 573947983, 207214901,
    ]);
    const t = createStream(1, "combat");
    expect(Array.from({ length: 8 }, () => nextInt(t, 6))).toEqual([1, 4, 4, 1, 5, 4, 4, 2]);
  });
  test("streams with different names don't share a sequence", () => {
    const a = createStream(7, "combat");
    const b = createStream(7, "crates");
    expect(nextU32(a)).not.toBe(nextU32(b));
  });
  test("nextInt stays in range and rejects bad bounds", () => {
    const s = createStream(42, "test");
    for (let i = 0; i < 10000; i++) {
      const v = nextInt(s, 7);
      expect(v >= 0 && v < 7).toBe(true);
    }
    expect(nextInt(s, 1)).toBe(0);
    expect(() => nextInt(s, 0)).toThrow(RangeError);
    expect(() => nextInt(s, 2.5)).toThrow(RangeError);
  });
});

describe("fnv1a32", () => {
  test("published test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });
});
