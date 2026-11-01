// Golden digests: every export of this package over many inputs, folded with the package's own hasher.
// Checked in Bun (golden.test.ts) and in Chromium, Firefox and WebKit (apps/web/e2e), so engines can't drift apart.

import {
  addInt,
  addString,
  addU32,
  atan2,
  cos,
  createHasher,
  createStream,
  digest,
  divFloor,
  fnv1a32,
  type Hasher,
  isqrt,
  mulDiv,
  nextInt,
  nextU32,
  type Stream,
  sin,
  splitmix32,
} from ".";

/**
 * The expected digests. Changing one changes sim outcomes: update it together with a simulation version bump.
 * One digest per function, so a mismatch names the function that differs.
 */
export const GOLDEN: Record<string, string> = {
  fnv1a32: "37473dc29fbac8b2",
  hasher: "5095cee61ec1a3cf",
  splitmix32: "b9859973bac13a50",
  nextU32: "da6d27583d381fc0",
  nextInt: "768ca3f5a13383be",
  divFloor: "cc63c592674ac09a",
  mulDiv: "2fc1e6955d202e97",
  isqrt: "b385de35484be939",
  sin: "c4d71e13c1f381f8",
  cos: "c0f96ce35c8c1f1c",
  atan2: "72c6d731f341041e",
};

const MAX = Number.MAX_SAFE_INTEGER;
const EDGES = [
  0,
  1,
  -1,
  2,
  -2,
  3,
  -7,
  255,
  2 ** 31 - 1,
  -(2 ** 31),
  2 ** 32,
  -(2 ** 32),
  2 ** 52,
  MAX,
  -MAX,
];
const STREAMS: [seed: number, name: string][] = [
  [0, ""],
  [1, "combat"],
  [7, "crates"],
  [0xffffffff, "ai:3"],
  [123456789, "ünïcødé 🚀"],
];

/** A uniform integer in [0, 2^53), from two draws. */
const next53 = (s: Stream) => nextU32(s) * 0x200000 + (nextU32(s) >>> 11);

function fold(feed: (h: Hasher) => void): string {
  const h = createHasher();
  feed(h);
  return digest(h).hex;
}

/** Every digest, keyed like GOLDEN. */
export function golden(): Record<string, string> {
  const s = createStream(20261101, "golden");
  return {
    fnv1a32: fold((h) => {
      for (let unit = 0; unit < 0x10000; unit++) addU32(h, fnv1a32(String.fromCharCode(unit)));
      for (const text of ["", "a", "foobar", "ünïcødé 🚀", "\ud800", "x".repeat(10000)])
        addU32(h, fnv1a32(text));
    }),
    hasher: fold((h) => {
      for (const v of [0, 1, -1, 0x7fffffff, -0x80000000, 0xffffffff]) addU32(h, v);
      for (const v of EDGES) addInt(h, v);
      for (const text of ["", "combat", "ünïcødé 🚀", "\udfff\ud800"]) addString(h, text);
      for (let i = 0; i < 1000; i++) {
        const inner = createHasher();
        addInt(inner, next53(s) * (i % 2 ? -1 : 1));
        const d = digest(inner);
        addU32(h, d.fnv);
        addU32(h, d.murmur);
        addString(h, d.hex);
      }
    }),
    splitmix32: fold((h) => {
      for (const seed of [0, 1, 0x9e3779b9, 0xffffffff, 0x80000000]) {
        let state = seed;
        for (let i = 0; i < 1000; i++) {
          const [next, value] = splitmix32(state);
          addU32(h, next);
          addU32(h, value);
          state = next;
        }
      }
    }),
    nextU32: fold((h) => {
      for (const [seed, name] of STREAMS) {
        const stream = createStream(seed, name);
        for (let i = 0; i < 2000; i++) addU32(h, nextU32(stream));
      }
    }),
    nextInt: fold((h) => {
      const bounds = [
        1,
        2,
        3,
        6,
        7,
        10,
        1000,
        65536,
        2 ** 31 - 1,
        2 ** 31,
        2 ** 31 + 1,
        3 * 2 ** 30,
        2 ** 32 - 1,
        2 ** 32,
      ];
      for (const [seed, name] of STREAMS) {
        const stream = createStream(seed, name);
        for (const n of bounds) for (let i = 0; i < 200; i++) addU32(h, nextInt(stream, n));
      }
    }),
    divFloor: fold((h) => {
      const divisors = [1, -1, 2, -2, 3, -3, 7, 1000, -65536, 2 ** 31, 2 ** 32 + 1, MAX, -MAX];
      for (const a of EDGES) for (const b of divisors) addInt(h, divFloor(a, b));
      for (let i = 0; i < 5000; i++) {
        const a = next53(s) * (i % 2 ? -1 : 1);
        const b = ((next53(s) >>> 0) % 1000000) + 1;
        addInt(h, divFloor(a, i % 3 ? b : -b));
        addInt(h, divFloor(a, (next53(s) % MAX) + 1));
      }
    }),
    mulDiv: fold((h) => {
      for (let i = 0; i < 5000; i++) {
        const a = nextInt(s, 2 ** 27) - 2 ** 26;
        const b = nextInt(s, 2 ** 27) - 2 ** 26;
        const c = (nextInt(s, 2 ** 21) + 1) * (i % 2 ? -1 : 1);
        addInt(h, mulDiv(a, b, c));
      }
      addInt(h, mulDiv(94906265, 94906265, 1));
      addInt(h, mulDiv(-1, 1, 3));
    }),
    isqrt: fold((h) => {
      for (let n = 0; n <= 65536; n++) addInt(h, isqrt(n));
      for (let i = 0; i < 5000; i++) {
        const k = nextInt(s, 94906265) + 1; // k * k + 1 stays at or below 2^53 - 1
        for (const n of [k * k - 1, k * k, k * k + 1]) addInt(h, isqrt(n));
        addInt(h, isqrt(next53(s)));
      }
      addInt(h, isqrt(MAX));
    }),
    sin: fold((h) => {
      for (let a = 0; a < 0x10000; a++) addU32(h, sin(a));
      for (const a of [-1, -65536, -65537, 65536, 2 ** 31, -(2 ** 31), 2 ** 40 + 5])
        addU32(h, sin(a));
    }),
    cos: fold((h) => {
      for (let a = 0; a < 0x10000; a++) addU32(h, cos(a));
      for (const a of [-1, -65536, -65537, 65536, 2 ** 31, -(2 ** 31), 2 ** 40 + 5])
        addU32(h, cos(a));
    }),
    atan2: fold((h) => {
      for (let y = -32; y <= 32; y++) for (let x = -32; x <= 32; x++) addU32(h, atan2(y, x));
      for (let a = 0; a < 0x10000; a += 7) addU32(h, atan2(sin(a), cos(a)));
      for (let i = 0; i < 20000; i++) {
        const r = (1 << (i % 29)) - (i % 29 === 28 ? 1 : 0); // 1 up to the 2^28 - 1 limit
        addU32(h, atan2(nextInt(s, 2 * r + 1) - r, nextInt(s, 2 * r + 1) - r));
      }
    }),
  };
}
