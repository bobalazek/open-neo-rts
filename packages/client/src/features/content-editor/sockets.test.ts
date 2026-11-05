import { expect, test } from "bun:test";
import { parseGlb } from "@open-neo-rts/content";
import { validateAssetGlb } from "@open-neo-rts/content/asset-validation";
import type { SocketChange } from "@open-neo-rts/render";
import { exportSocketGlb, socketModel } from "./sockets";

const original = new Uint8Array(
  await Bun.file(
    new URL(
      "../../../../../content/core/factions/eastern-collective/units/dragon-tank/dragon-tank.glb",
      import.meta.url,
    ),
  ).arrayBuffer(),
);
const source = socketModel(original);
const muzzle = source.nodes.find((node) => node.name === "socket_muzzle_0")!;
const change: SocketChange = {
  ...muzzle,
  translation: [0.25, 1.5, 2],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};
const tail = (bytes: Uint8Array) =>
  bytes.subarray(
    20 + new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(12, true),
  );

test("real socket edits preserve all geometry, animation data and unrelated JSON and pass shared conformance", async () => {
  const before = original.slice();
  const result = exportSocketGlb(original, [change]);
  expect(original).toEqual(before);
  expect(tail(result)).toEqual(tail(original));
  const expected = structuredClone(source.doc);
  Object.assign(expected.nodes[muzzle.index]!, {
    translation: [...change.translation],
    rotation: [...change.rotation],
    scale: [...change.scale],
  });
  expect(parseGlb(result)).toEqual(expected);
  expect(
    (await validateAssetGlb(result, "model.glb", { kind: "unit", requires: {} })).filter(
      (issue) => issue.level === "error",
    ),
  ).toEqual([]);
  const offset = new Uint8Array(original.length + 8);
  offset.set(original, 8);
  expect(exportSocketGlb(offset.subarray(8), [change])).toEqual(result);
});

test("new sockets append stable indices under an authored part or active scene, without shifting existing references", async () => {
  const index = source.nodes.length;
  const parent = source.nodes.find((node) => node.name === "turret")!.index;
  const first = { ...change, index, name: "socket_marker", parent };
  const second = { ...change, index: index + 1, name: "socket_probe", parent: null };
  const result = exportSocketGlb(original, [second, first]);
  const gltf = parseGlb(result);
  expect(gltf.nodes!.slice(0, index).map((node) => node.name)).toEqual(
    source.doc.nodes.map((node) => node.name),
  );
  expect(gltf.nodes![parent]!.children).toEqual([
    ...(source.doc.nodes[parent]!.children ?? []),
    index,
  ]);
  expect(gltf.scenes![gltf.scene ?? 0]!.nodes).toEqual([
    ...(source.doc.scenes![source.doc.scene ?? 0]!.nodes ?? []),
    index + 1,
  ]);
  expect(gltf.animations).toEqual(source.doc.animations);
  expect(tail(result)).toEqual(tail(original));
  expect(
    (await validateAssetGlb(result, "model.glb", { kind: "unit", requires: {} })).filter(
      (issue) => issue.level === "error",
    ),
  ).toEqual([]);
});

test("socket export rejects geometry edits, reparenting, unsafe transforms and ambiguous append operations", () => {
  const mesh = source.nodes.find((node) => source.doc.nodes[node.index]!.mesh !== undefined)!;
  for (const changes of [
    [{ ...change, index: mesh.index, name: mesh.name, parent: mesh.parent }],
    [{ ...change, name: "socket_other" }],
    [{ ...change, parent: null }],
    [change, change],
    [{ ...change, translation: [Infinity, 0, 0] }],
    [{ ...change, translation: [1001, 0, 0] }],
    [{ ...change, rotation: [0, 0, 0, 0] }],
    [{ ...change, scale: [1, 0, 1] }],
    [{ ...change, index: source.nodes.length + 1, name: "socket_new" }],
    [{ ...change, index: source.nodes.length, name: muzzle.name }],
    [{ ...change, index: source.nodes.length, name: "bad_name" }],
    [{ ...change, index: source.nodes.length, name: "socket_new", parent: source.nodes.length }],
  ])
    expect(() => exportSocketGlb(original, changes)).toThrow();
  const broken = original.slice();
  new DataView(broken.buffer).setUint32(
    20 + new DataView(broken.buffer).getUint32(12, true),
    0xffffffff,
    true,
  );
  expect(() => exportSocketGlb(broken, [change])).toThrow("chunk length");
});

test("an otherwise valid socket-named skin joint is not an editable attachment", async () => {
  const doc = structuredClone(source.doc);
  doc.skins = [{ joints: [muzzle.index] }];
  const json = new TextEncoder().encode(JSON.stringify(doc)),
    length = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + length + tail(original).length);
  bytes.set(original.subarray(0, 20));
  bytes.fill(0x20, 20, 20 + length);
  bytes.set(json, 20);
  bytes.set(tail(original), 20 + length);
  new DataView(bytes.buffer).setUint32(8, bytes.length, true);
  new DataView(bytes.buffer).setUint32(12, length, true);
  expect(
    (await validateAssetGlb(bytes, "model.glb", { kind: "unit", requires: {} })).filter(
      (issue) => issue.level === "error",
    ),
  ).toEqual([]);
  expect(socketModel(bytes).nodes[muzzle.index]!.editable).toBe(false);
  expect(() => exportSocketGlb(bytes, [change])).toThrow("leaf socket");
});
