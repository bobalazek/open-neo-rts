import { expect, test } from "bun:test";
import {
  MeshBuilder,
  NullEngine,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createModelPlayback, loadModel } from "./model";
import { createModelActions } from "./preview-actions";

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const root = new TransformNode("root", scene);
  const body = MeshBuilder.CreateBox("authored body", {}, scene);
  body.material = new StandardMaterial("authored palette", scene);
  body.parent = root;
  const muzzle = new TransformNode("socket_side_0", scene);
  muzzle.parent = root;
  muzzle.position.set(1, 2, 3);
  muzzle.rotation.y = Math.PI / 2;
  const rubble = MeshBuilder.CreateBox("authored wreck", {}, scene);
  const model = (nodes: TransformNode[], meshes: (typeof body)[]) => ({
    nodes,
    meshes,
    ...createModelPlayback(nodes, [], [], []),
    setTeamColor() {},
    dispose() {},
  });
  const live = model([root, body, muzzle], [body]);
  const wreck = model([rubble], [rubble]);
  const actions = createModelActions(scene, live, wreck, [{ socket: "socket_side" }]);
  return {
    engine,
    scene,
    root,
    body,
    muzzle,
    rubble,
    live,
    actions,
    dispose() {
      actions.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

test("preview firing uses the assigned transformed muzzle and releases its own effects", () => {
  const f = fixture();
  try {
    expect(f.rubble.isEnabled()).toBe(false);
    expect(f.actions.fire()).toBe(true);
    const flash = f.scene.getMeshByName("preview muzzle flash")!;
    const trace = f.scene.getMeshByName("preview tracer")!;
    expect(flash.position.asArray()).toEqual([1, 2, 3]);
    const vertices = trace.getVerticesData("position")!;
    expect(vertices.slice(0, 3)).toEqual([1, 2, 3]);
    expect(vertices[3]).toBeGreaterThan(1);
    expect(vertices[4]).toBeCloseTo(2);
    expect(vertices[5]).toBeCloseTo(3);
    f.actions.update(180);
    expect(flash.isDisposed()).toBe(true);
    expect(trace.isDisposed()).toBe(true);
    for (let i = 0; i < 5; i++) f.actions.fire();
    expect(f.scene.meshes.filter((mesh) => mesh.name.startsWith("preview"))).toHaveLength(2);
    f.actions.dispose();
    expect(f.scene.materials.map((material) => material.name)).toEqual(["authored palette"]);
  } finally {
    f.dispose();
  }
});

test("preview destruction scatters actual geometry, shows the paired wreck and restores without source mutation", () => {
  const f = fixture();
  try {
    f.actions.destroy();
    expect(f.root.isEnabled()).toBe(false);
    expect(f.rubble.isEnabled()).toBe(false);
    const piece = f.scene.getMeshByName("preview debris 0")!;
    expect(piece.getVerticesData("position")).toEqual(f.body.getVerticesData("position"));
    expect(piece.material).toBe(f.body.material);
    f.actions.update(300);
    expect(piece.position.equals(Vector3.Zero())).toBe(false);
    expect(f.actions.fire()).toBe(false);
    expect(f.actions.canFire).toBe(false);
    expect(f.actions.canDestroy).toBe(false);
    expect(f.body.position.asArray()).toEqual([0, 0, 0]);
    f.actions.update(450);
    expect(piece.isDisposed()).toBe(true);
    expect(f.rubble.isEnabled()).toBe(true);
    f.actions.reset();
    expect(f.root.isEnabled()).toBe(true);
    expect(f.rubble.isEnabled()).toBe(false);
    expect(f.body.material?.isFrozen).toBe(false);
    expect(f.actions.fire()).toBe(true);
  } finally {
    f.dispose();
  }
});

test("missing assigned sockets do not silently use a different muzzle", () => {
  const f = fixture();
  const other = createModelActions(f.scene, f.live, undefined, [{ socket: "socket_missing" }]);
  try {
    expect(other.canFire).toBe(false);
    expect(other.fire()).toBe(false);
    expect(f.scene.getMeshByName("preview muzzle flash")).toBeNull();
  } finally {
    other.dispose();
    f.dispose();
  }
});

test("wrecks retain the matching turret angle and authored death clips finish in full", () => {
  const f = fixture();
  const turret = new TransformNode("turret", f.scene);
  turret.parent = f.root;
  const wreckTurret = new TransformNode("turret", f.scene);
  wreckTurret.parent = f.rubble;
  f.live.nodes.push(turret);
  const wreck = { ...f.live, nodes: [f.rubble, wreckTurret], meshes: [f.rubble] };
  f.live.clips.push("death");
  f.live.duration = () => 5000;
  f.live.play = () => {};
  const actions = createModelActions(f.scene, f.live, wreck, []);
  try {
    turret.rotation.y = 1;
    actions.destroy();
    actions.update(3000);
    expect(f.root.isEnabled()).toBe(true);
    expect(f.rubble.isEnabled()).toBe(false);
    actions.update(2000);
    expect(f.rubble.isEnabled()).toBe(true);
    expect(wreckTurret.rotationQuaternion?.toEulerAngles().y).toBeCloseTo(1);
    actions.reset();
    expect(wreckTurret.rotation.y).toBe(0);
  } finally {
    actions.dispose();
    f.dispose();
  }
});

test("aim transfer preserves authored wreck tilt and unrelated matching geometry", () => {
  const f = fixture();
  f.rubble.name = f.body.name;
  f.rubble.rotation.z = 0.4;
  const turret = new TransformNode("turret", f.scene);
  turret.parent = f.root;
  const wreckTurret = new TransformNode("turret", f.scene);
  wreckTurret.parent = f.rubble;
  wreckTurret.rotation.z = 0.5;
  f.live.nodes.push(turret);
  const wreck = { ...f.live, nodes: [f.rubble, wreckTurret], meshes: [f.rubble] };
  const actions = createModelActions(f.scene, f.live, wreck, []);
  try {
    turret.rotation.y = 1;
    actions.destroy();
    actions.update(750);
    expect(f.rubble.rotation.z).toBe(0.4);
    const expected = Quaternion.FromEulerAngles(0, 1, 0).multiply(
      Quaternion.FromEulerAngles(0, 0, 0.5),
    );
    expect(wreckTurret.rotationQuaternion?.equalsWithEpsilon(expected)).toBe(true);
    actions.reset();
    expect(wreckTurret.rotation.z).toBe(0.5);
    expect(wreckTurret.rotationQuaternion).toBeNull();
  } finally {
    actions.dispose();
    f.dispose();
  }
});

test("original Dragon Tank recoil and wreck work in the same preview without losing live materials", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const base = "../../../../content/core/factions/eastern-collective/units/dragon-tank/";
  const live = await loadModel(
    scene,
    await Bun.file(new URL(`${base}dragon-tank.glb`, import.meta.url)).bytes(),
  );
  const wreck = await loadModel(
    scene,
    await Bun.file(new URL(`${base}dragon-tank.wreck.glb`, import.meta.url)).bytes(),
  );
  const actions = createModelActions(scene, live, wreck, [{}]);
  try {
    expect(live.clips).toContain("fire_recoil");
    expect(actions.fire()).toBe(true);
    expect(scene.animationGroups.find((clip) => clip.name === "fire_recoil")?.isPlaying).toBe(true);
    expect(
      scene.getMeshByName("preview muzzle flash")?.position.asArray().every(Number.isFinite),
    ).toBe(true);
    actions.destroy();
    const fragments = scene.meshes.filter((mesh) => mesh.name.startsWith("preview debris"));
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.length).toBeLessThanOrEqual(32);
    actions.update(750);
    expect(wreck.meshes.some((mesh) => mesh.getTotalVertices() > 0 && mesh.isEnabled())).toBe(true);
    actions.reset();
    expect(live.meshes.some((mesh) => mesh.getTotalVertices() > 0 && mesh.isEnabled())).toBe(true);
    expect(wreck.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  } finally {
    actions.dispose();
    live.dispose();
    wreck.dispose();
    scene.dispose();
    engine.dispose();
  }
});
