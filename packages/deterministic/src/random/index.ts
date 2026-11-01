// Seeded PRNG streams: sfc32, seeded via splitmix32 from the match seed and a stream name. One stream per subsystem.

import { fnv1a32 } from "../hash";

/** sfc32 state: four 32-bit words. Plain fields, so snapshots and the state hash can read them. */
export interface Stream {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** One splitmix32 step: returns the advanced state and its output, both unsigned 32-bit. */
export function splitmix32(state: number): [next: number, value: number] {
  const next = (state + 0x9e3779b9) | 0;
  let t = next ^ (next >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return [next >>> 0, t >>> 0];
}

/** The stream `name` (`combat`, `ai:<seat>`, `crates`…) for a match seed. Different names never share a sequence. */
export function createStream(seed: number, name: string): Stream {
  let s = (seed ^ fnv1a32(name)) >>> 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [next, value] = splitmix32(s);
    s = next;
    words.push(value);
  }
  const [a = 0, b = 0, c = 0, d = 0] = words;
  const stream = { a, b, c, d };
  for (let i = 0; i < 12; i++) nextU32(stream); // warm-up, as in PractRand's sfc32 seeding
  return stream;
}

/** Next unsigned 32-bit value; advances the stream. */
export function nextU32(s: Stream): number {
  const t = (((s.a + s.b) | 0) + s.d) | 0;
  s.d = (s.d + 1) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (((s.c << 21) | (s.c >>> 11)) + t) | 0;
  return t >>> 0;
}

/** Uniform integer in [0, n) for 1 <= n <= 2^32, without modulo bias (rejection sampling). */
export function nextInt(s: Stream, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000)
    throw new RangeError(`nextInt bound must be an integer in [1, 2^32], got ${n}`);
  const limit = 0x100000000 - (0x100000000 % n);
  for (;;) {
    const r = nextU32(s);
    if (r < limit) return r % n;
  }
}
