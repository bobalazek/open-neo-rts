// Minimal GLB reader: header + JSON chunk. Enough for structural checks; binary data is never read.

export interface Gltf {
  asset?: { version?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { name?: string; primitives: GltfPrimitive[] }[];
  accessors?: { count: number; min?: number[]; max?: number[] }[];
  materials?: { name?: string }[];
  animations?: { name?: string }[];
  skins?: { joints: number[] }[];
}

export interface GltfNode {
  name?: string;
  mesh?: number;
  skin?: number;
  children?: number[];
  translation?: number[];
  scale?: number[];
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
}

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

export function parseGlb(bytes: Uint8Array): Gltf {
  if (bytes.byteLength < 20) throw new Error("file too small to be a GLB");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("not a GLB (bad magic)");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`unsupported GLB container version ${version}`);
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error("GLB length header does not match the file size");
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK) throw new Error("first GLB chunk is not JSON");
  return JSON.parse(utf8(bytes.subarray(20, 20 + jsonLength))) as Gltf;
}

// content compiles without DOM or Bun types (it's shared with the sim), so no TextDecoder here.
function utf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++] ?? 0;
    let cp = b;
    if (b >= 0xf0)
      cp =
        ((b & 0x07) << 18) | (cont(bytes, i++) << 12) | (cont(bytes, i++) << 6) | cont(bytes, i++);
    else if (b >= 0xe0) cp = ((b & 0x0f) << 12) | (cont(bytes, i++) << 6) | cont(bytes, i++);
    else if (b >= 0xc0) cp = ((b & 0x1f) << 6) | cont(bytes, i++);
    out += String.fromCodePoint(cp);
  }
  return out;
}

function cont(bytes: Uint8Array, i: number): number {
  return (bytes[i] ?? 0) & 0x3f;
}
