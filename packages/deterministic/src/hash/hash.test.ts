import { describe, expect, test } from "bun:test";
import { addInt, addString, addU32, createHasher, digest, fnv1a32, type Hasher } from ".";

/** Hash raw bytes (length a multiple of 4) as little-endian words, with the Murmur3 lane seeded directly. */
function hashBytes(bytes: number[], seed = 0) {
  const h = createHasher();
  h.murmur = seed | 0;
  const view = new DataView(Uint8Array.from(bytes).buffer);
  for (let i = 0; i < bytes.length; i += 4) addU32(h, view.getUint32(i, true));
  return digest(h);
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const nist = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"; // 56 bytes

function hexOf(feed: (h: Hasher) => void): string {
  const h = createHasher();
  feed(h);
  return digest(h).hex;
}

const wordsHex = (...words: number[]) =>
  hexOf((h) => {
    for (const w of words) addU32(h, w);
  });

describe("Murmur3 lane", () => {
  // Published MurmurHash3_x86_32 vectors, as collected at https://stackoverflow.com/questions/14747343
  // and used by Boost.Hash2 (test/legacy/murmur3_32.cpp). Only word-aligned inputs apply here.
  test.each([
    [[], 0, 0],
    [[], 1, 0x514e28b7],
    [[], 0xffffffff, 0x81f16f39],
    [[0xff, 0xff, 0xff, 0xff], 0, 0x76293b50],
    [[0x21, 0x43, 0x65, 0x87], 0, 0xf55b516b],
    [[0x21, 0x43, 0x65, 0x87], 0x5082edee, 0x2362f9de],
    [[0, 0, 0, 0], 0, 0x2362f9de],
    [ascii(nist), 0, 0xee925b90],
  ])("bytes %p, seed %p", (bytes, seed, expected) => {
    expect(hashBytes(bytes, seed).murmur).toBe(expected);
  });
});

describe("FNV-1a lane", () => {
  // Published FNV-1a 32 vectors: fnv1a_32_vector in test_fnv.c, https://github.com/lcn2/fnv
  test("matches the reference vectors", () => {
    expect(hashBytes([]).fnv).toBe(0x811c9dc5);
    expect(hashBytes(ascii("foob")).fnv).toBe(0x3f5076ef);
  });

  test("equals byte-wise FNV-1a of the same bytes", () => {
    expect(hashBytes(ascii(nist)).fnv).toBe(fnv1a32(nist));
  });
});

describe("hasher", () => {
  test("order matters", () => {
    const a = wordsHex(1, 2);
    const b = wordsHex(2, 1);
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
    expect(a.slice(8)).not.toBe(b.slice(8));
  });

  test("addU32 hashes the signed and unsigned views alike", () => {
    expect(hexOf((h) => addU32(h, -1))).toBe(hexOf((h) => addU32(h, 0xffffffff)));
  });

  test("addInt distinguishes nearby and wide values", () => {
    const values = [-1, 0, 1, 2 ** 32 - 1, 2 ** 32, -(2 ** 32), 2 ** 52, Number.MAX_SAFE_INTEGER];
    const hexes = new Set(values.map((v) => hexOf((h) => addInt(h, v))));
    expect(hexes.size).toBe(values.length);
  });

  test("addInt is low word then high word, two's complement", () => {
    expect(hexOf((h) => addInt(h, -1))).toBe(wordsHex(-1, -1));
    expect(hexOf((h) => addInt(h, 2 ** 32))).toBe(wordsHex(0, 1));
    expect(hexOf((h) => addInt(h, -(2 ** 52)))).toBe(wordsHex(0, -0x100000));
  });

  test("addString is length-prefixed", () => {
    const a = hexOf((h) => {
      addString(h, "ab");
      addString(h, "c");
    });
    const b = hexOf((h) => {
      addString(h, "a");
      addString(h, "bc");
    });
    expect(a).not.toBe(b);
  });

  test("rejects values that aren't integers in range", () => {
    const h = createHasher();
    for (const v of [0.5, 2 ** 32, -(2 ** 31) - 1, Number.NaN])
      expect(() => addU32(h, v)).toThrow(RangeError);
    for (const v of [0.5, 2 ** 53, -(2 ** 53), Number.POSITIVE_INFINITY])
      expect(() => addInt(h, v)).toThrow(RangeError);
  });

  test("digest doesn't consume the hasher", () => {
    const h = createHasher();
    addU32(h, 7);
    expect(digest(h)).toEqual(digest(h));
    addU32(h, 8);
    expect(digest(h).hex).toBe(wordsHex(7, 8));
  });

  test("golden digest", () => {
    const hex = hexOf((h) => {
      addInt(h, 100); // tick
      addU32(h, 0xdeadbeef);
      addU32(h, -2);
      addInt(h, -123456789012);
      addString(h, "combat");
    });
    expect(hex).toBe("d05ca518fceab184");
  });
});
