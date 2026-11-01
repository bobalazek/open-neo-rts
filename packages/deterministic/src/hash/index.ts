// Canonical state hashing: two independent 32-bit lanes, FNV-1a and MurmurHash3_x86_32, giving 64 bits.
// The hasher only mixes words; the caller feeds state in canonical order (sorted IDs, fixed component order).

import { divFloor } from "../math";

/** 32-bit FNV-1a over UTF-16 code units, as an unsigned integer. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Incremental state hasher over 32-bit words. Plain fields; feed with `addU32`/`addInt`/`addString`, then `digest`. */
export interface Hasher {
  /** FNV-1a lane. */
  fnv: number;
  /** Murmur3 lane (h1 before finalization). Starts at the seed, 0. */
  murmur: number;
  /** Bytes fed so far, mod 2^32. */
  bytes: number;
}

/** Both lanes, unsigned, and as 16 hex characters (FNV-1a first). */
export interface Digest {
  fnv: number;
  murmur: number;
  hex: string;
}

export function createHasher(): Hasher {
  return { fnv: 0x811c9dc5, murmur: 0, bytes: 0 };
}

/** Feed one 32-bit word, signed or unsigned view (both hash alike), as 4 little-endian bytes. */
export function addU32(h: Hasher, value: number): void {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff)
    throw new RangeError(`addU32 value must be a 32-bit integer, got ${value}`);
  let f = h.fnv;
  for (let shift = 0; shift < 32; shift += 8) {
    f ^= (value >>> shift) & 0xff;
    f = Math.imul(f, 0x01000193);
  }
  h.fnv = f;
  let k = Math.imul(value, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  let m = h.murmur ^ k;
  m = (m << 13) | (m >>> 19);
  h.murmur = (Math.imul(m, 5) + 0xe6546b64) | 0;
  h.bytes = (h.bytes + 4) | 0;
}

/** Feed a safe integer as two words, low then high (64-bit two's complement). */
export function addInt(h: Hasher, value: number): void {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`addInt value must be a safe integer, got ${value}`);
  addU32(h, value >>> 0);
  addU32(h, divFloor(value, 0x100000000));
}

/** Feed a string: its length, then one word per UTF-16 code unit. */
export function addString(h: Hasher, text: string): void {
  addU32(h, text.length);
  for (let i = 0; i < text.length; i++) addU32(h, text.charCodeAt(i));
}

/** Finalize without consuming the hasher: Murmur3 length mix and fmix32. Input is whole words, so no tail. */
export function digest(h: Hasher): Digest {
  let m = h.murmur ^ h.bytes;
  m ^= m >>> 16;
  m = Math.imul(m, 0x85ebca6b);
  m ^= m >>> 13;
  m = Math.imul(m, 0xc2b2ae35);
  m ^= m >>> 16;
  const fnv = h.fnv >>> 0;
  const murmur = m >>> 0;
  return {
    fnv,
    murmur,
    hex: fnv.toString(16).padStart(8, "0") + murmur.toString(16).padStart(8, "0"),
  };
}
