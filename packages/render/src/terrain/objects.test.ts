import { expect, test } from "bun:test";
import { ok as assert } from "node:assert/strict";
import { InstancedMesh, NullEngine, Scene } from "@babylonjs/core";
import { parseTerrain, RAMP } from "@open-neo-rts/content";
import { createMapPresentation, resourceInstances, type StaticMapInstance } from "./objects";

const bytes = () =>
  Bun.file(
    new URL("../../../../content/core/resources/ore-cell/ore-cell.glb", import.meta.url),
  ).bytes();
const grid = () => parseTerrain(16, 16, {});
const point = (changes: Partial<StaticMapInstance> = {}): StaticMapInstance => ({
  definition: "original",
  position: [4, 6],
  footprint: [2, 1],
  rotation: 90,
  ...changes,
});
function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  return {
    scene,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}

test("resource discs match authored-map preview cell indices, deduplicate overlap, and stay in bounds", () => {
  const field = { kind: "ore", position: [1, 1], radius: 1 };
  const instances = resourceInstances(
    { id: "example", resources: [field, field, { kind: "materials", position: [8.25, 5] }] },
    grid(),
  );
  expect(instances.map(({ position }) => position)).toEqual([
    [1.5, 0.5],
    [0.5, 1.5],
    [1.5, 1.5],
    [2.5, 1.5],
    [1.5, 2.5],
    [8.25, 5],
  ]);
  const edge = resourceInstances(
    { id: "edge", resources: [{ ...field, position: [0, 0], radius: 5 }] },
    grid(),
  );
  expect(edge.length).toBeGreaterThan(0);
  expect(
    resourceInstances({ id: "example", resources: [{ kind: "ore", position: [1, 1] }] }, grid()),
  ).toEqual(resourceInstances({ id: "example", resources: [field] }, grid()));
  expect(
    edge.every(({ position: [x = -1, y = -1] }) => x >= 0.5 && y >= 0.5 && x <= 15.5 && y <= 15.5),
  ).toBe(true);
  expect(
    resourceInstances(
      { id: "point", resources: [{ kind: "ore", position: [3, 4], radius: 0 }] },
      grid(),
    )[0]?.position,
  ).toEqual([3.5, 4.5]);
  expect(() =>
    resourceInstances({ id: "bad", resources: [{ ...field, radius: -1 }] }, grid()),
  ).toThrow("radius");
  expect(() =>
    resourceInstances({ id: "bad", resources: [{ ...field, position: [NaN, 0] }] }, grid()),
  ).toThrow("position");
});

test("ore layouts are reproducible from identity, seed and coordinates, without changing source data", () => {
  const source = { id: "example", resources: [{ kind: "ore", position: [8, 8], radius: 4 }] };
  const before = JSON.stringify(source);
  const first = resourceInstances(source, grid(), 123);
  expect(resourceInstances(source, grid(), 123)).toEqual(first);
  expect(resourceInstances(source, grid(), 124)).not.toEqual(first);
  expect(resourceInstances({ ...source, id: "other" }, grid(), 123)).not.toEqual(first);
  expect(first.every(({ rotation = -1 }) => [0, 90, 180, 270].includes(rotation))).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
});

test("authored transforms retain fractional cell coordinates, terrain/ramp height and quarter-turn rotation", async () => {
  const f = fixture();
  const terrain = grid();
  terrain.level.fill(2);
  terrain.ramp[6 * 16 + 4] = RAMP.east;
  const layer = createMapPresentation(f.scene, terrain, [point({ position: [4.25, 6.5] })], bytes);
  try {
    await layer.ready;
    const root = f.scene.getTransformNodeByName("map object 0: original");
    assert(root);
    expect(root.position.asArray()).toEqual([8.5, 3.6 + 0.25 * 1.8 - 0.1, 13]);
    expect(root.rotation.y).toBe(Math.PI / 2);
    expect(root.getChildMeshes().every((mesh) => !mesh.isPickable)).toBe(true);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("repeated actual resource GLBs share geometry/materials, show only full stage, and release on reload", async () => {
  const f = fixture();
  let calls = 0;
  const placements = Array.from({ length: 100 }, (_, i) =>
    point({ position: [1.5 + (i % 10), 1.5 + Math.floor(i / 10)] }),
  );
  const layer = createMapPresentation(f.scene, grid(), placements, async () => {
    calls++;
    return bytes();
  });
  try {
    await layer.ready;
    expect(calls).toBe(1);
    const roots = f.scene.transformNodes.filter((node) => node.name.startsWith("map object "));
    expect(roots.length).toBe(100);
    const a = roots[0]?.getChildMeshes().filter((mesh) => mesh.getTotalVertices());
    const b = roots[1]?.getChildMeshes().filter((mesh) => mesh.getTotalVertices());
    assert(a && b);
    expect(a.every((mesh) => mesh instanceof InstancedMesh)).toBe(true);
    for (let i = 0; i < a.length; i++) {
      const left = a[i] as InstancedMesh;
      const right = b[i] as InstancedMesh;
      expect(left.sourceMesh).toBe(right.sourceMesh);
      expect(left.material).toBe(right.material);
    }
    const stages = roots[0]?.getDescendants().filter((node) => node.name.startsWith("stage_"));
    assert(stages?.length);
    expect(stages.filter((node) => node.isEnabled()).map((node) => node.name)).toEqual([
      "stage_full",
    ]);
    expect(f.scene.animationGroups.every((group) => !group.isPlaying)).toBe(true);
    layer.dispose();
    layer.dispose();
    expect(f.scene.meshes.length).toBe(0);
    expect(f.scene.transformNodes.length).toBe(0);
    expect(f.scene.geometries.length).toBe(0);
    expect(
      f.scene.materials.filter((material) => material.name !== "default material").length,
    ).toBe(0);
    const next = createMapPresentation(f.scene, grid(), [point()], bytes);
    await next.ready;
    next.dispose();
    expect(f.scene.meshes.length).toBe(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("rotated footprint bounds reject before asset fetch; failed second asset releases first", async () => {
  const f = fixture();
  let calls = 0;
  try {
    const bad = createMapPresentation(
      f.scene,
      grid(),
      [point({ position: [0.5, 0.5] })],
      async () => {
        calls++;
        return bytes();
      },
    );
    await expect(bad.ready).rejects.toThrow("original: invalid transform or footprint outside map");
    expect(calls).toBe(0);
    const layer = createMapPresentation(
      f.scene,
      grid(),
      [point(), point({ definition: "missing" })],
      async (definition) => {
        if (definition === "missing") throw new Error("HTTP 404");
        return bytes();
      },
    );
    await expect(layer.ready).rejects.toThrow("Map model missing: HTTP 404");
    expect(f.scene.meshes.length).toBe(0);
    expect(f.scene.geometries.length).toBe(0);
    const corrupt = createMapPresentation(
      f.scene,
      grid(),
      [point()],
      async () => new Uint8Array([1]),
    );
    await expect(corrupt.ready).rejects.toThrow("Map model original:");
    expect(f.scene.meshes.length).toBe(0);
  } finally {
    f.dispose();
  }
});

test("disposal during an outstanding asset request never imports its late result", async () => {
  const f = fixture();
  let resolve: (bytes: Uint8Array) => void = () => {};
  const pending = new Promise<Uint8Array>((done) => {
    resolve = done;
  });
  const layer = createMapPresentation(f.scene, grid(), [point()], () => pending);
  layer.dispose();
  resolve(await bytes());
  await layer.ready;
  expect(f.scene.meshes.length).toBe(0);
  f.dispose();
});
