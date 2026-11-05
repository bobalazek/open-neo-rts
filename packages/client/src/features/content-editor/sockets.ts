import { type Gltf, type GltfNode, parseGlb } from "@open-neo-rts/content";
import type { SocketChange } from "@open-neo-rts/render";
import { MODEL_FILE_LIMIT } from "./model";

type SocketDocument = Omit<Gltf, "nodes"> & {
  nodes: (GltfNode & { rotation?: number[]; matrix?: number[]; camera?: number })[];
};

export function socketModel(bytes: Uint8Array) {
  if (bytes.length > MODEL_FILE_LIMIT) throw new Error("Model exceeds 16 MiB");
  const doc = parseGlb(bytes) as SocketDocument;
  if (!Array.isArray(doc.nodes)) throw new Error("Model has no nodes");
  const names = new Set<string>();
  const parents = new Map<number, number>();
  for (const [index, node] of doc.nodes.entries()) {
    if (!node.name || names.has(node.name)) throw new Error("Model node names must be unique");
    names.add(node.name);
    for (const child of node.children ?? []) {
      if (
        !Number.isSafeInteger(child) ||
        child < 0 ||
        child >= doc.nodes.length ||
        parents.has(child)
      )
        throw new Error("Invalid model hierarchy");
      parents.set(child, index);
    }
  }
  const animated = new Set(
    doc.animations?.flatMap((clip) => clip.channels?.map((channel) => channel.target.node) ?? []),
  );
  const joints = new Set(doc.skins?.flatMap((skin) => skin.joints));
  return {
    doc,
    nodes: doc.nodes.map((node, index) => ({
      index,
      name: node.name!,
      parent: parents.get(index) ?? null,
      editable:
        /^socket_[a-z]+(_\d+)?$/.test(node.name!) &&
        node.mesh === undefined &&
        node.skin === undefined &&
        node.camera === undefined &&
        !node.children?.length &&
        !animated.has(index) &&
        !joints.has(index),
    })),
  };
}

/** Rewrites socket JSON only; every following chunk, including geometry and animation buffers, stays byte-identical. */
export function exportSocketGlb(bytes: Uint8Array, changes: readonly SocketChange[]) {
  const { doc, nodes } = socketModel(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tailOffset = 20 + view.getUint32(12, true);
  if (tailOffset > bytes.length || tailOffset % 4) throw new Error("Invalid GLB JSON chunk");
  for (let offset = tailOffset; offset < bytes.length; ) {
    if (offset + 8 > bytes.length) throw new Error("Truncated GLB chunk");
    const length = view.getUint32(offset, true);
    if (length % 4 || offset + 8 + length > bytes.length)
      throw new Error("Invalid GLB chunk length");
    offset += 8 + length;
  }
  const originalCount = doc.nodes.length;
  const seen = new Set<number>(),
    names = new Set(nodes.map((node) => node.name));
  for (const change of [...changes].sort((a, b) => a.index - b.index)) {
    if (
      !Number.isSafeInteger(change.index) ||
      change.index < 0 ||
      change.index > doc.nodes.length ||
      seen.has(change.index)
    )
      throw new Error("Invalid socket index");
    seen.add(change.index);
    const vector = (values: readonly number[], length: number, limit: number) =>
      values.length === length && values.every((n) => Number.isFinite(n) && Math.abs(n) <= limit);
    if (
      !vector(change.translation, 3, 1000) ||
      !vector(change.rotation, 4, 1) ||
      !vector(change.scale, 3, 1000) ||
      change.scale.some((n) => Math.abs(n) < 0.000001) ||
      Math.abs(change.rotation.reduce((sum, n) => sum + n * n, 0) - 1) > 0.0001
    )
      throw new Error("Invalid socket transform");
    let node = doc.nodes[change.index];
    if (change.index < originalCount) {
      const original = nodes[change.index]!;
      if (!original.editable || original.name !== change.name || original.parent !== change.parent)
        throw new Error("Only unanimated leaf socket transforms can be edited");
    } else {
      if (
        !/^socket_[a-z]+(_\d+)?$/.test(change.name) ||
        names.has(change.name) ||
        !(
          change.parent === null ||
          (Number.isSafeInteger(change.parent) &&
            change.parent >= 0 &&
            change.parent < change.index)
        )
      )
        throw new Error("Invalid new socket name or parent");
      names.add(change.name);
      node = { name: change.name };
      doc.nodes.push(node);
      if (change.parent !== null) {
        const parent = doc.nodes[change.parent]!;
        parent.children ??= [];
        parent.children.push(change.index);
      } else {
        const scene = doc.scenes?.[doc.scene ?? 0];
        if (!scene) throw new Error("Model has no active scene");
        scene.nodes ??= [];
        scene.nodes.push(change.index);
      }
    }
    delete node!.matrix;
    node!.translation = [...change.translation];
    node!.rotation = [...change.rotation];
    node!.scale = [...change.scale];
  }
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const length = Math.ceil(json.length / 4) * 4;
  const result = new Uint8Array(20 + length + bytes.length - tailOffset);
  if (result.length > MODEL_FILE_LIMIT) throw new Error("Edited model exceeds 16 MiB");
  result.set(bytes.subarray(0, 20));
  result.fill(0x20, 20, 20 + length);
  result.set(json, 20);
  result.set(bytes.subarray(tailOffset), 20 + length);
  const header = new DataView(result.buffer);
  header.setUint32(8, result.length, true);
  header.setUint32(12, length, true);
  return result;
}
