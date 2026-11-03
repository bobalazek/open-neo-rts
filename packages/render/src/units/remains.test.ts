import { expect, spyOn, test } from "bun:test";
import { ok as assert } from "node:assert/strict";
import { InstancedMesh, NullEngine, PBRMaterial, PickingInfo, Scene } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import type { PresentedRemains, SeatSnapshot } from "@open-neo-rts/sim";
import { createMatchPresentation } from "../../../client/src/features/match";
import { createEntityPresentation } from "./presentation";

const bytes = (rubble = true) =>
  Bun.file(
    new URL(
      rubble
        ? "../../../../content/core/factions/eastern-collective/structures/industrial-reactor/industrial-reactor.rubble.glb"
        : "../../../../content/core/factions/eastern-collective/units/supply-truck/supply-truck.wreck.glb",
      import.meta.url,
    ),
  ).bytes();
const row = (handle: string, changes: Partial<PresentedRemains> = {}): PresentedRemains => ({
  handle,
  definition: "reactor",
  kind: "rubble",
  force: 0,
  x: 1024,
  y: 1024,
  facing: 0,
  ...changes,
});
const snapshot = (tick: number, remains: PresentedRemains[]): SeatSnapshot => ({
  tick,
  mode: "controlled",
  entities: [],
  remains,
});
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    terrain = parseTerrain(8, 8, {});
  scene.useRightHandedSystem = true;
  terrain.level.fill(2);
  return {
    engine,
    scene,
    terrain,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}

test("original rubble instances share Force art, use rotated ground anchors and stay inert without live UI", async () => {
  const f = fixture(),
    calls: string[] = [];
  const layer = createEntityPresentation(
    f.scene,
    f.terrain,
    async (_id, variant) => {
      calls.push(variant);
      return { bytes: await bytes(), movementDomain: null, footprint: [2, 3], foundation: true };
    },
    { remains: true },
  );
  try {
    layer.setForceColor(0, "#ff0000");
    layer.setForceColor(1, "#0000ff");
    const state = snapshot(0, [
      row("e1"),
      row("e2", { x: 4096 }),
      row("e3", { force: 1, y: 4096, facing: 16384 }),
    ]);
    const before = JSON.stringify(state);
    await layer.accept(state, 0);
    expect(calls).toEqual(["wreck", "wreck"]);
    const a = f.scene.getTransformNodeByName("remains e1"),
      b = f.scene.getTransformNodeByName("remains e2"),
      c = f.scene.getTransformNodeByName("remains e3");
    assert(a && b && c);
    expect(a.position.asArray()).toEqual([5, 3.6, 4]);
    expect(c.position.asArray()).toEqual([4, 3.6, 11]);
    expect(a.rotation.y).toBeCloseTo(Math.PI / 2);
    const mesh = a.getChildMeshes().find((mesh) => mesh instanceof InstancedMesh),
      other = b.getChildMeshes().find((mesh) => mesh instanceof InstancedMesh);
    assert(mesh instanceof InstancedMesh && other instanceof InstancedMesh);
    expect(mesh.sourceMesh).toBe(other.sourceMesh);
    expect(mesh.material).toBe(other.material);
    const palette = () => f.scene.materials.filter((material) => material.name === "palette");
    expect(palette()).toHaveLength(2);
    const originalColors = palette().map((material) =>
      material instanceof PBRMaterial ? material.albedoColor.asArray() : [],
    );
    layer.setForceColor(0, "#00ff00");
    // Authored debris uses a neutral palette, with no team slot to recolour.
    expect(
      palette().map((material) =>
        material instanceof PBRMaterial ? material.albedoColor.asArray() : [],
      ),
    ).toEqual(originalColors);
    expect(f.scene.getMeshByName("structure foundation")).toBeNull();
    expect(f.scene.getMeshByName("construction scaffold")).toBeNull();
    layer.select(["e1"]);
    layer.setPlaybackRate(8);
    layer.render(10000);
    expect(f.scene.getMeshByName("projected status")).toBeNull();
    expect(f.scene.animationGroups.some((group) => group.isPlaying)).toBe(false);
    expect(a.position.asArray()).toEqual([5, 3.6, 4]);
    expect(JSON.stringify(state)).toBe(before);
    await layer.accept(snapshot(1, []), 10050);
    expect(a.isDisposed()).toBe(true);
    layer.dispose();
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("hidden or disposed pending remains never resurrect after original GLB import", async () => {
  const f = fixture();
  let finish!: (value: Awaited<ReturnType<Parameters<typeof createEntityPresentation>[2]>>) => void;
  const waiting = new Promise<Awaited<ReturnType<Parameters<typeof createEntityPresentation>[2]>>>(
    (resolve) => {
      finish = resolve;
    },
  );
  const layer = createEntityPresentation(f.scene, f.terrain, () => waiting, { remains: true });
  try {
    const pending = layer.accept(
      snapshot(0, [row("e1", { definition: "truck", kind: "wreck" })]),
      0,
    );
    await layer.accept(snapshot(1, []), 50);
    finish({ bytes: await bytes(false), movementDomain: "wheeled" });
    await pending;
    expect(f.scene.getTransformNodeByName("remains e1")).toBeNull();
    expect(f.scene.meshes).toHaveLength(0);
    layer.dispose();
    expect(f.scene.materials).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("match picking chooses the closest live or wreck hit, but wrecks stay out of army selection and reset cleanly", async () => {
  const f = fixture();
  const layer = createMatchPresentation(f.scene, f.terrain, async () => ({
    bytes: await bytes(false),
    movementDomain: "wheeled",
  }));
  try {
    const state = snapshot(0, [row("e2", { definition: "truck", kind: "wreck" })]);
    state.entities = [
      {
        handle: "e1",
        definition: "truck",
        force: 0,
        x: 1024,
        y: 1024,
        facing: 0,
        health: 100,
        maxHealth: 100,
        order: null,
      },
    ];
    await layer.accept(state, 0);
    const live = f.scene
        .getTransformNodeByName("entity e1")
        ?.getChildMeshes()
        .find((mesh) => mesh.getTotalVertices() > 0),
      wreck = f.scene
        .getTransformNodeByName("remains e2")
        ?.getChildMeshes()
        .find((mesh) => mesh.getTotalVertices() > 0);
    assert(live && wreck);
    let wreckNear = true;
    const picking = spyOn(f.scene, "multiPick").mockImplementation((_x, _y, predicate) =>
      [live, wreck]
        .filter((mesh) => predicate?.(mesh, -1))
        .map((mesh) => {
          const hit = new PickingInfo();
          hit.hit = true;
          hit.pickedMesh = mesh;
          hit.distance = (mesh === wreck) === wreckNear ? 1 : 2;
          return hit;
        }),
    );
    try {
      expect(layer.pick(1, 1)).toBe("e2");
      wreckNear = false;
      expect(layer.pick(1, 1)).toBe("e1");
      layer.select(["e2", "e1"]);
      expect(layer.selection()).toEqual(["e1"]);
      const before = f.scene.getTransformNodeByName("remains e2");
      layer.reset();
      expect(before?.isDisposed()).toBe(true);
      expect(layer.selection()).toEqual([]);
      await layer.accept(state, 100);
      expect(f.scene.getTransformNodeByName("remains e2")).not.toBeNull();
      await layer.accept(snapshot(1, []), 150);
      expect(layer.pick(1, 1)).toBeNull();
    } finally {
      picking.mockRestore();
    }
    layer.dispose();
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});
