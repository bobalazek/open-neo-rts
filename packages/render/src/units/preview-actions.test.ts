import { expect, test } from "bun:test";
import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  Quaternion,
  RotationGizmo,
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

test("part controls rotate local pivots, retain posed muzzles when firing, and restore authored rest", () => {
  const f = fixture();
  const turret = new TransformNode("turret", f.scene);
  const barrel = new TransformNode("barrel", f.scene);
  turret.parent = f.root;
  barrel.parent = turret;
  turret.rotation.z = 0.2;
  barrel.rotation.x = 0.1;
  f.muzzle.parent = barrel;
  f.live.nodes.push(turret, barrel);
  const actions = createModelActions(
    f.scene,
    f.live,
    undefined,
    [{ socket: "socket_side" }],
    ["turret", "barrel"],
  );
  try {
    expect(actions.parts).toEqual(["turret", "barrel"]);
    actions.posePart("turret", 1, 90);
    actions.posePart("barrel", 0, -15);
    const expected = Quaternion.FromEulerAngles(0, 0, 0.2).multiply(
      Quaternion.FromEulerAngles(0, Math.PI / 2, 0),
    );
    expect(turret.rotationQuaternion!.equalsWithEpsilon(expected)).toBe(true);
    const origin = f.muzzle.computeWorldMatrix(true).getTranslation().asArray();
    expect(actions.fire()).toBe(true);
    expect(f.scene.getMeshByName("preview muzzle flash")!.position.asArray()).toEqual(origin);
    f.scene.onAfterAnimationsObservable.notifyObservers(f.scene);
    expect(turret.rotationQuaternion!.equalsWithEpsilon(expected)).toBe(true);
    expect(actions.partAngles("barrel")).toEqual([-15, 0, 0]);
    for (const degrees of [Number.NaN, Infinity, -181, 181])
      expect(() => actions.posePart("turret", 1, degrees)).toThrow();
    expect(() => actions.posePart("missing", 1, 20)).toThrow();
    expect(() => actions.posePart("turret", 1.5, 20)).toThrow();
    actions.posePart("turret", 1, 0);
    expect(turret.rotationQuaternion).toBeNull();
    actions.reset();
    expect(actions.partAngles("barrel")).toEqual([0, 0, 0]);
    expect(barrel.rotationQuaternion).toBeNull();
    expect(barrel.rotation.x).toBe(0.1);
    expect(turret.rotation.z).toBe(0.2);
  } finally {
    actions.dispose();
    f.dispose();
  }
});

test("native part rings retain small drags around authored rest and detach across lifecycle changes", () => {
  const f = fixture();
  new FreeCamera("preview camera", new Vector3(10, 10, 10), f.scene).setTarget(Vector3.Zero());
  f.root.rotation.set(0.2, 0.3, 0.4);
  f.root.scaling.setAll(2);
  const turret = new TransformNode("turret", f.scene),
    barrel = new TransformNode("barrel", f.scene);
  turret.parent = f.root;
  barrel.parent = turret;
  const rest = Quaternion.FromEulerAngles(0.3, 0.2, 0.1);
  turret.rotationQuaternion = rest.clone();
  f.live.nodes.push(turret, barrel);
  const actions = createModelActions(f.scene, f.live);
  const descriptor = Object.getOwnPropertyDescriptor(RotationGizmo.prototype, "attachedNode")!;
  let native: RotationGizmo | undefined;
  // Capture the public native setter without adding a production inspection API.
  Object.defineProperty(RotationGizmo.prototype, "attachedNode", {
    ...descriptor,
    set(node) {
      native = this;
      descriptor.set!.call(this, node);
    },
  });
  try {
    let changed = 0;
    actions.selectPart("turret", () => changed++);
    Object.defineProperty(RotationGizmo.prototype, "attachedNode", descriptor);
    f.scene.render();
    const initial = turret.computeWorldMatrix(true).clone();
    const point = (angle: number) =>
      Vector3.TransformCoordinates(new Vector3(0, Math.cos(angle), Math.sin(angle)), initial);
    const drag = native!.xGizmo.dragBehavior;
    drag.onDragStartObservable.notifyObservers({ dragPlanePoint: point(0) } as never);
    for (let step = 1; step <= 100; step++) {
      turret.computeWorldMatrix(true);
      drag.onDragObservable.notifyObservers({
        dragPlanePoint: point((step * 0.2 * Math.PI) / 180),
      } as never);
    }
    expect(actions.partAngles("turret")[0]).toBeCloseTo(20, 3);
    expect(changed).toBe(100);
    expect(
      turret.rotationQuaternion!.equalsWithEpsilon(
        rest.multiply(Quaternion.FromEulerAngles(Math.PI / 9, 0, 0)),
        0.00001,
      ),
    ).toBe(true);
    actions.selectPart("barrel");
    expect(native!.attachedNode).toBe(barrel);
    actions.selectPart(undefined);
    expect(native!.attachedNode).toBeNull();
    actions.selectPart("turret");
    actions.destroy();
    expect(native!.attachedNode).toBeNull();
    actions.reset();
    expect(actions.partAngles("turret")).toEqual([0, 0, 0]);
    actions.selectPart("turret");
    actions.reset();
    expect(native!.attachedNode).toBeNull();
    actions.dispose();
    expect(native!.onDragObservable.hasObservers()).toBe(false);
    expect(native!.gizmoLayer.utilityLayerScene.isDisposed).toBe(true);
  } finally {
    Object.defineProperty(RotationGizmo.prototype, "attachedNode", descriptor);
    actions.dispose();
    f.dispose();
  }
});

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
