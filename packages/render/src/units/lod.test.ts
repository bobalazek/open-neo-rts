import { expect, test } from "bun:test";
import { ok as assert } from "node:assert/strict";
import {
  FreeCamera,
  InstancedMesh,
  MeshBuilder,
  NullEngine,
  Scene,
  type TransformNode,
  Vector3,
} from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import type { PresentedEntity } from "@open-neo-rts/sim";
import { createModelLod } from "./lod";
import { createEntityPresentation } from "./presentation";

// Original test geometry: a two-triangle near quad and one-triangle distant silhouette.
export function lodGlb(nearName = "body_LOD0", paired = true): Uint8Array {
  const data = new Float32Array([
    -1,
    0,
    0,
    1,
    0,
    0,
    -1,
    2,
    0,
    -1,
    2,
    0,
    1,
    0,
    0,
    1,
    2,
    0,
    -1,
    0,
    0,
    1,
    0,
    0,
    0,
    2,
    0,
    0,
    1, // animation times
    0,
    0,
    0,
    0,
    0.5,
    0, // carrier translation
    0,
    0,
    0,
    0,
    0.5,
    0,
    0,
    0,
    0, // distant morph deltas
    0,
    1, // morph weights
  ]);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "carrier", children: paired ? [1, 2, 3] : [1, 3] },
      { name: nearName, mesh: 0 },
      { name: "body_LOD1", mesh: 1 },
      { name: "state_damaged", mesh: 0, extensions: { KHR_node_visibility: { visible: false } } },
    ],
    extensionsUsed: ["KHR_node_visibility"],
    buffers: [{ byteLength: data.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 72 },
      { buffer: 0, byteOffset: 72, byteLength: 36 },
      { buffer: 0, byteOffset: 108, byteLength: 8 },
      { buffer: 0, byteOffset: 116, byteLength: 24 },
      { buffer: 0, byteOffset: 140, byteLength: 36 },
      { buffer: 0, byteOffset: 176, byteLength: 8 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        type: "VEC3",
        count: 6,
        min: [-1, 0, 0],
        max: [1, 2, 0],
      },
      {
        bufferView: 1,
        componentType: 5126,
        type: "VEC3",
        count: 3,
        min: [-1, 0, 0],
        max: [1, 2, 0],
      },
      { bufferView: 2, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, type: "VEC3", count: 2 },
      { bufferView: 4, componentType: 5126, type: "VEC3", count: 3 },
      { bufferView: 5, componentType: 5126, type: "SCALAR", count: 2 },
    ],
    materials: [{ name: "team", doubleSided: true }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
      {
        weights: [0],
        primitives: [{ attributes: { POSITION: 1 }, material: 0, targets: [{ POSITION: 4 }] }],
      },
    ],
    animations: [
      {
        name: "move",
        samplers: [
          { input: 2, output: 3 },
          { input: 2, output: 5 },
        ],
        channels: [
          { sampler: 0, target: { node: 0, path: "translation" } },
          { sampler: 1, target: { node: 2, path: "weights" } },
        ],
      },
    ],
  });
  const body = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const bytes = new Uint8Array(28 + body.length + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(body, 20);
  view.setUint32(20 + body.length, data.byteLength, true);
  view.setUint32(24 + body.length, 0x004e4942, true);
  bytes.set(new Uint8Array(data.buffer), 28 + body.length);
  return bytes;
}

const unit = (handle: string, definition = "paired", x = 1024): PresentedEntity => ({
  handle,
  definition,
  force: 0,
  x,
  y: 1024,
  facing: 0x4000,
  health: 1,
  maxHealth: 1,
  order: null,
});

test("optional LODs retain hierarchy, hidden states, independent morph clips, instances and lifecycle", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(2, 0, 2), scene);
  const layer = createEntityPresentation(scene, parseTerrain(8, 8, {}), async (definition) => ({
    bytes: lodGlb(definition === "bare" ? "body" : "body_LOD0", definition !== "missing"),
    movementDomain: "foot",
  }));
  const accept = (tick: number, entities: PresentedEntity[]) =>
    layer.accept({ tick, mode: "debug-no-fog", entities }, tick * 50);
  const root = (handle: string) => {
    const root = scene.getTransformNodeByName(`entity ${handle}`);
    assert(root);
    return root;
  };
  const mesh = (handle: string, name: string) => {
    const mesh = root(handle)
      .getChildMeshes()
      .find((mesh) => mesh.name === name);
    assert(mesh);
    return mesh;
  };
  try {
    layer.setForceColor(0, "#ff0000");
    await accept(0, [unit("a"), unit("b"), unit("bare", "bare"), unit("missing", "missing")]);
    const near = mesh("a", "body_LOD0");
    const far = mesh("a", "body_LOD1");
    const parent = near.parent;
    expect(near instanceof InstancedMesh).toBe(true);
    expect(far instanceof InstancedMesh).toBe(false); // morph manager belongs to this entity
    expect((near as InstancedMesh).sourceMesh).toBe(
      (mesh("b", "body_LOD0") as InstancedMesh).sourceMesh,
    );
    expect(far.material).toBe(near.material);
    expect(far.morphTargetManager).not.toBe(mesh("b", "body_LOD1").morphTargetManager);
    expect(near.isVisible).toBe(true);
    expect(far.isVisible).toBe(false);
    camera.position.z = 200;
    camera.getViewMatrix(true);
    layer.render(0);
    expect(near.isVisible).toBe(false);
    expect(far.isVisible).toBe(true);
    expect(mesh("bare", "body").isVisible).toBe(false);
    expect(mesh("missing", "body_LOD0").isVisible).toBe(true);
    expect(mesh("a", "state_damaged").isVisible).toBe(false);
    expect(near.parent).toBe(parent);
    await accept(1, [
      unit("a", "paired", 2048),
      unit("b"),
      unit("bare", "bare"),
      unit("missing", "missing"),
    ]);
    const target = far.morphTargetManager?.getTarget(0);
    const group = scene.animationGroups.find((group) =>
      group.targetedAnimations.some(({ target: animated }) => animated === target),
    );
    assert(group);
    group.goToFrame(60);
    expect(target?.influence).toBe(1);
    expect(mesh("b", "body_LOD1").morphTargetManager?.getTarget(0).influence).toBe(0);
    expect((parent as TransformNode).position.y).toBe(0.5);
    layer.setLodDistance(Infinity);
    expect(near.isVisible).toBe(true);
    expect(far.isVisible).toBe(false);
    expect(target?.influence).toBe(1); // LOD switching does not reset animation state
    expect(() => layer.setLodDistance(0)).toThrow("Invalid model LOD distance");
    expect(() => layer.setLodDistance(Number.NaN)).toThrow("Invalid model LOD distance");
    await accept(2, []);
    expect(scene.meshes).toHaveLength(0);
    expect(scene.geometries).toHaveLength(0);
    expect(scene.morphTargetManagers).toHaveLength(0);
    expect(scene.animationGroups).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("ambiguous or overlapping LOD branches preserve authored appearance", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const bare = MeshBuilder.CreateBox("part", {}, scene);
    const explicit = MeshBuilder.CreateBox("part_LOD0", {}, scene);
    const low = MeshBuilder.CreateBox("part_LOD1", {}, scene);
    const nested = MeshBuilder.CreateBox("nested", {}, scene);
    const nestedLow = MeshBuilder.CreateBox("nested_LOD1", {}, scene);
    nestedLow.parent = nested;
    explicit.isVisible = false;
    const meshes = [bare, explicit, low, nested, nestedLow];
    const before = meshes.map((mesh) => mesh.isVisible);
    const lod = createModelLod(meshes, meshes);
    expect(lod).toBeUndefined();
    expect(meshes.map((mesh) => mesh.isVisible)).toEqual(before);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
