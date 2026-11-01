// Writers for generated assets, shared by make-placeholders and build-models: GLB (glTF binary) and PNG.

import { deflateSync } from "node:zlib";

type Data = Float32Array | Uint16Array | Uint32Array;
const COMPONENT = new Map<unknown, number>([
  [Float32Array, 5126],
  [Uint16Array, 5123],
  [Uint32Array, 5125],
]);
const WIDTH = { SCALAR: 1, VEC3: 3, VEC4: 4 } as const;
export const ARRAY_BUFFER = 34962;
export const ELEMENT_ARRAY_BUFFER = 34963;

/** Packs typed arrays into one binary buffer. `accessor` returns the new accessor's index; `encode` writes the file. */
export function glbWriter() {
  const accessors: Record<string, unknown>[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
  const bin: Uint8Array[] = [];
  let offset = 0;
  return {
    accessor(
      data: Data,
      type: keyof typeof WIDTH,
      extra: { target?: number; min?: number[]; max?: number[] } = {},
    ): number {
      const bytes = new Uint8Array(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      );
      const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
      padded.set(bytes);
      views.push({
        buffer: 0,
        byteOffset: offset,
        byteLength: bytes.length,
        ...(extra.target && { target: extra.target }),
      });
      bin.push(padded);
      offset += padded.length;
      accessors.push({
        bufferView: views.length - 1,
        componentType: COMPONENT.get(data.constructor),
        count: data.length / WIDTH[type],
        type,
        ...(extra.min && { min: extra.min }),
        ...(extra.max && { max: extra.max }),
      });
      return accessors.length - 1;
    },
    /** The GLB file: `json` plus the accessors, buffer views and buffer collected so far. */
    encode(json: Record<string, unknown>): Uint8Array {
      const full = { ...json, accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
      const jsonBytes = new TextEncoder().encode(JSON.stringify(full));
      const jsonChunk = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4).fill(0x20);
      jsonChunk.set(jsonBytes);
      const out = new Uint8Array(12 + 8 + jsonChunk.length + 8 + offset);
      const view = new DataView(out.buffer);
      view.setUint32(0, 0x46546c67, true); // "glTF"
      view.setUint32(4, 2, true);
      view.setUint32(8, out.length, true);
      view.setUint32(12, jsonChunk.length, true);
      view.setUint32(16, 0x4e4f534a, true); // "JSON"
      out.set(jsonChunk, 20);
      let at = 20 + jsonChunk.length;
      view.setUint32(at, offset, true);
      view.setUint32(at + 4, 0x004e4942, true); // "BIN"
      at += 8;
      for (const b of bin) {
        out.set(b, at);
        at += b.length;
      }
      return out;
    },
  };
}

/** Dark outline `radius` pixels wide around the opaque silhouette, so icons read on any background. */
export function outline(rgba: Uint8Array, size: number, radius: number): Uint8Array {
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && rgba[(y * size + x) * 4 + 3] === 255;
  const near: [number, number][] = [];
  for (let r = 1; r <= radius; r++) near.push([r, 0], [-r, 0], [0, r], [0, -r]);
  const out = rgba.slice();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!solid(x, y) && near.some(([dx, dy]) => solid(x + dx, y + dy))) {
        out.set([20, 22, 26, 255], (y * size + x) * 4);
      }
    }
  }
  return out;
}

/** RGBA8 square image as PNG. */
export function png(rgba: Uint8Array, size: number): Uint8Array {
  const rows = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    rows.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, size);
  hv.setUint32(4, size);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
