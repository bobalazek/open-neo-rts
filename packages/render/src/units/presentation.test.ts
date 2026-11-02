import { expect, test } from "bun:test";
import { ok as assert } from "node:assert/strict";
import {
  ArcRotateCamera,
  Color3,
  InstancedMesh,
  Mesh,
  NullEngine,
  type PBRMaterial,
  Scene,
  Vector3,
  Viewport,
} from "@babylonjs/core";
import { parseTerrain, RAMP, WATER } from "@open-neo-rts/content";
import type { PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { createEntityPresentation } from ".";

const bytes = (name = "collective-soldier", folder = "units") =>
  Bun.file(
    new URL(
      `../../../../content/core/factions/eastern-collective/${folder}/${name}/${name}.glb`,
      import.meta.url,
    ),
  ).bytes();
const entity = (handle: string, changes: Partial<PresentedEntity> = {}): PresentedEntity => ({
  handle,
  definition: "soldier",
  force: 0,
  x: 1024,
  y: 1024,
  facing: 0,
  health: 100,
  maxHealth: 100,
  order: null,
  ...changes,
});
const snapshot = (tick: number, entities: PresentedEntity[]): SeatSnapshot => ({
  tick,
  mode: "debug-no-fog",
  entities,
});
const root = (scene: Scene, handle: string) => {
  const node = scene.getTransformNodeByName(`entity ${handle}`);
  assert(node);
  return node;
};
function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const terrain = parseTerrain(8, 8, {});
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

test("box selection projects rendered centres into the top-origin canvas under asymmetric HUD insets", async () => {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  engine.getRenderingCanvas = () => ({ clientWidth: 1280, clientHeight: 720 }) as HTMLCanvasElement;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new ArcRotateCamera(
    "selection",
    Math.PI / 2,
    0.7,
    20,
    new Vector3(2, 0, 2),
    scene,
  );
  camera.viewport = new Viewport(0, 300 / 720, 1, 370 / 720);
  scene.activeCamera = camera;
  const layer = createEntityPresentation(scene, parseTerrain(8, 8, {}), async () => ({
    bytes: await bytes(),
    movementDomain: "foot",
  }));
  try {
    await layer.accept(snapshot(0, [entity("visible")]), 0);
    scene.updateTransformMatrix(true);
    expect(
      root(scene, "visible")
        .getChildMeshes()
        .some((mesh) => mesh.getTotalVertices() > 0),
    ).toBe(true);
    expect(layer.inRectangle(630, 225, 650, 245)).toEqual(["visible"]);
    expect(layer.inRectangle(630, 475, 650, 495)).toEqual([]);
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("static model origins follow the rotated authoritative footprint anchor", async () => {
  const f = fixture();
  const layer = createEntityPresentation(f.scene, f.terrain, async () => ({
    bytes: await bytes(),
    movementDomain: null,
    footprint: [2, 4],
    foundation: true,
  }));
  await layer.accept(snapshot(0, [entity("building", { facing: 0x4000 })]), 0);
  expect(root(f.scene, "building").position.asArray()).toEqual([4, 0, 6]);
  const foundation = () => f.scene.getMeshByName("structure foundation");
  expect(foundation()?.getBoundingInfo().boundingBox.maximum.x).toBe(6);
  expect(foundation()?.getBoundingInfo().boundingBox.maximum.z).toBe(10);
  const originalFoundation = foundation();
  await layer.accept(snapshot(1, [entity("building", { facing: 0x8000 })]), 50);
  layer.render(100);
  expect(root(f.scene, "building").position.asArray()).toEqual([6, 0, 4]);
  expect(originalFoundation?.isDisposed()).toBe(true);
  expect(foundation()?.getBoundingInfo().boundingBox.maximum.x).toBe(10);
  expect(foundation()?.getBoundingInfo().boundingBox.maximum.z).toBe(6);
  await layer.accept(snapshot(2, []), 100);
  expect(foundation()).toBeNull();
  expect(f.scene.materials).toHaveLength(0);
  layer.dispose();
  f.dispose();
});

test("static props keep their footprint origins without receiving structure foundations", async () => {
  const f = fixture();
  const layer = createEntityPresentation(f.scene, f.terrain, async () => ({
    bytes: await bytes(),
    movementDomain: null,
    footprint: [2, 4],
    foundation: false,
  }));
  try {
    await layer.accept(snapshot(0, [entity("boulder")]), 0);
    expect(root(f.scene, "boulder").position.asArray()).toEqual([6, 0, 4]);
    expect(f.scene.getMeshByName("structure foundation")).toBeNull();
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("200 actual rigid GLBs share geometry and Force materials, with independent clips", async () => {
  const f = fixture();
  let loads = 0;
  const layer = createEntityPresentation(f.scene, f.terrain, async () => {
    loads++;
    return { bytes: await bytes(), movementDomain: "foot" };
  });
  try {
    layer.setForceColor(0, "#ff0000");
    layer.setForceColor(1, "#0000ff");
    const units = Array.from({ length: 200 }, (_, i) => entity(`u${i}`));
    await layer.accept(snapshot(0, [...units, entity("other", { force: 1 })]), 0);
    expect(loads).toBe(2);
    const first = root(f.scene, "u0");
    const second = root(f.scene, "u1");
    const firstMeshes = first.getChildMeshes().filter((mesh) => mesh.getTotalVertices());
    expect(firstMeshes.length).toBeGreaterThan(0);
    expect(firstMeshes.every((mesh) => mesh instanceof InstancedMesh)).toBe(true);
    for (let i = 0; i < firstMeshes.length; i++) {
      const a = firstMeshes[i] as InstancedMesh;
      const b = second.getChildMeshes().filter((mesh) => mesh.getTotalVertices())[
        i
      ] as InstancedMesh;
      expect(a.sourceMesh).toBe(b.sourceMesh);
      expect(a.material).toBe(b.material);
      expect(a.sourceMesh.instances.length).toBe(200);
    }
    const geometryCount = f.scene.geometries.length;
    expect(
      f.scene.meshes.filter((mesh) => mesh instanceof Mesh && mesh.getTotalVertices()).length,
    ).toBe(firstMeshes.length * 2);
    expect(geometryCount).toBe(firstMeshes.length * 2);
    const team = firstMeshes.find((mesh) => mesh.material?.name === "team")
      ?.material as PBRMaterial;
    const otherTeam = root(f.scene, "other")
      .getChildMeshes()
      .find((mesh) => mesh.material?.name === "team")?.material as PBRMaterial;
    const palette = firstMeshes.find((mesh) => mesh.material?.name === "palette")
      ?.material as PBRMaterial;
    const fixed = palette.albedoColor.clone();
    layer.setForceColor(0, "#00ff00");
    expect(team.albedoColor.equals(Color3.Green().toLinearSpace(true))).toBe(true);
    expect(otherTeam.albedoColor.equals(Color3.Blue().toLinearSpace(true))).toBe(true);
    expect(palette.albedoColor.equals(fixed)).toBe(true);
    expect(() => layer.setForceColor(0, "bad")).toThrow("#RRGGBB");
    await layer.accept(
      snapshot(
        1,
        units.map((unit, index) => ({ ...unit, x: unit.x + (index === 0 ? 1024 : 0) })),
      ),
      50,
    );
    const groupFor = (handle: string, name: string) => {
      const group = f.scene.animationGroups.find(
        (group) =>
          group.name === name &&
          group.targetedAnimations.some(({ target }) =>
            target.isDescendantOf(root(f.scene, handle)),
          ),
      );
      assert(group);
      return group;
    };
    const move = groupFor("u0", "move");
    const idle = groupFor("u1", "idle");
    expect(move.isPlaying).toBe(true);
    expect(groupFor("u1", "move").isPlaying).toBeFalsy();
    expect(idle.isPlaying).toBe(true);
    const untouched = idle.targetedAnimations.map(({ target }) =>
      target.rotationQuaternion?.clone(),
    );
    const walkingBefore = move.targetedAnimations.map(({ target }) =>
      target.rotationQuaternion?.clone(),
    );
    move.goToFrame(move.to / 4);
    expect(move.targetedAnimations.map(({ target }) => target.rotationQuaternion)).not.toEqual(
      walkingBefore,
    );
    expect(idle.targetedAnimations.map(({ target }) => target.rotationQuaternion)).toEqual(
      untouched,
    );
    expect(f.scene.geometries.length).toBe(geometryCount / 2); // Force 1 left visibility.
    await layer.accept(
      snapshot(
        2,
        units.map((unit, index) => ({ ...unit, x: unit.x + (index === 0 ? 1024 : 0) })),
      ),
      100,
    );
    expect(move.isPlaying).toBeFalsy();
    expect(groupFor("u0", "idle").isPlaying).toBe(true);
    await layer.accept(snapshot(3, []), 150);
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.geometries).toHaveLength(0);
    expect(f.scene.animationGroups).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("poses convert subcells to metres, follow ramps, and interpolate wrapped facing without extrapolation", async () => {
  const f = fixture();
  f.terrain.level.fill(2);
  f.terrain.ramp[9] = RAMP.east;
  const layer = createEntityPresentation(f.scene, f.terrain, async () => ({
    bytes: await bytes("dragon-tank"),
    movementDomain: "tracked",
    radiusSubcells: 870,
  }));
  try {
    const initial = snapshot(0, [entity("tank", { x: 1024, y: 1536, facing: 65500 })]);
    Object.freeze(initial.entities[0]?.order);
    Object.freeze(initial.entities[0]);
    Object.freeze(initial.entities);
    Object.freeze(initial);
    const before = JSON.stringify(initial);
    await layer.accept(initial, 0);
    const tank = root(f.scene, "tank");
    expect(tank.position.asArray()).toEqual([2, 3.5, 3]);
    await layer.accept(snapshot(1, [entity("tank", { x: 2048, y: 1536, facing: 36 })]), 50);
    layer.render(75);
    expect(tank.position.x).toBe(3);
    expect(tank.position.y).toBeCloseTo(4.4);
    expect(tank.rotation.y).toBeCloseTo(Math.PI / 2 - 2 * Math.PI);
    const forward = Vector3.TransformNormal(Vector3.Forward(), tank.computeWorldMatrix(true));
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
    layer.render(1000);
    expect(tank.position.x).toBe(4);
    layer.render(-100);
    expect(tank.position.x).toBe(2);
    expect(JSON.stringify(initial)).toBe(before);
    await layer.accept(snapshot(0, []), 200);
    expect(root(f.scene, "tank")).toBe(tank);
    await layer.accept(snapshot(2, [entity("tank", { x: 3072, y: 1024, facing: 16384 })]), 200);
    layer.render(250);
    const south = Vector3.TransformNormal(Vector3.Forward(), tank.computeWorldMatrix(true));
    expect(south.x).toBeCloseTo(0);
    expect(south.z).toBeCloseTo(1);
    layer.setPlaybackRate(0);
    layer.render(200);
    expect(tank.position.x).toBe(6);
    const tankClips = f.scene.animationGroups.filter((group) =>
      group.targetedAnimations.some(({ target }) => target.isDescendantOf(tank)),
    );
    expect(tankClips.length).toBeGreaterThan(0);
    expect(tankClips.every((group) => group.speedRatio === 0)).toBe(true);
    layer.setPlaybackRate(8);
    expect(tankClips.every((group) => group.speedRatio === 8)).toBe(true);
    expect(() => layer.setPlaybackRate(-1)).toThrow("Invalid playback rate");
    layer.select(["tank"]);
    const ring = f.scene.getMeshByName("selected entity");
    expect(ring?.scaling.x).toBeCloseTo((870 * 2) / 1024 + 0.2);
    expect(ring?.isPickable).toBe(false);
    layer.select([]);
    expect(f.scene.getMeshByName("selected entity")).toBeNull();
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("naval metadata uses the rendered water plane; structures remain idle", async () => {
  const f = fixture();
  f.terrain.water.fill(WATER.deep);
  f.terrain.level.fill(1);
  const layer = createEntityPresentation(f.scene, f.terrain, async (definition) => ({
    bytes: await bytes(
      definition === "ship" ? "gunboat" : "radar-tower",
      definition === "ship" ? "units" : "structures",
    ),
    movementDomain: definition === "ship" ? "naval" : null,
  }));
  try {
    await layer.accept(
      snapshot(0, [
        entity("ship", { definition: "ship" }),
        entity("plant", { definition: "plant" }),
      ]),
      0,
    );
    expect(root(f.scene, "ship").position.y).toBe(1.6);
    expect(
      f.scene.animationGroups
        .filter((group) => group.name === "active")
        .every((group) => !group.isPlaying),
    ).toBe(true);
    layer.dispose();
    layer.dispose();
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.animationGroups).toHaveLength(0);
    await expect(layer.accept(snapshot(1, []), 50)).rejects.toThrow("disposed");
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("hover and amphibious models float over both water depths and follow dry land", async () => {
  const f = fixture();
  f.terrain.level.fill(1);
  f.terrain.water[9] = WATER.shallow;
  f.terrain.water[10] = WATER.deep;
  const layer = createEntityPresentation(f.scene, f.terrain, async (definition) => ({
    bytes: await bytes("dragon-tank"),
    movementDomain: definition === "hover" ? "hover" : "amphibious",
  }));
  try {
    await layer.accept(
      snapshot(0, [
        ...["hover", "amphibious"].flatMap((definition) =>
          [1, 2, 3].map((x) =>
            entity(`${definition}-${x}`, { definition, x: x * 1024 + 512, y: 1536 }),
          ),
        ),
      ]),
      0,
    );
    for (const definition of ["hover", "amphibious"]) {
      expect(root(f.scene, `${definition}-1`).position.y).toBeCloseTo(1.6);
      expect(root(f.scene, `${definition}-2`).position.y).toBeCloseTo(1.6);
      expect(root(f.scene, `${definition}-3`).position.y).toBeCloseTo(1.8);
    }
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("removed, replaced and disposed async loads never resurrect stale entities", async () => {
  const f = fixture();
  const data = await bytes();
  const requests = new Map<
    string,
    (value: { bytes: Uint8Array; movementDomain: "foot" }) => void
  >();
  const layer = createEntityPresentation(
    f.scene,
    f.terrain,
    (definition) =>
      new Promise((resolve) => {
        requests.set(definition, resolve);
      }),
  );
  try {
    const old = layer.accept(snapshot(0, [entity("same", { definition: "old" })]), 0);
    await Promise.resolve();
    const replacement = layer.accept(
      snapshot(1, [entity("same", { definition: "replacement" })]),
      50,
    );
    await Promise.resolve();
    requests.get("old")?.({ bytes: data, movementDomain: "foot" });
    await old;
    expect(f.scene.meshes).toHaveLength(0);
    requests.get("replacement")?.({ bytes: data, movementDomain: "foot" });
    await replacement;
    expect(root(f.scene, "same")).toBeDefined();
    const late = layer.accept(snapshot(2, [entity("late", { definition: "late" })]), 100);
    await Promise.resolve();
    await layer.accept(snapshot(3, []), 150);
    requests.get("late")?.({ bytes: data, movementDomain: "foot" });
    await late;
    expect(f.scene.meshes).toHaveLength(0);
    const disposed = layer.accept(
      snapshot(4, [entity("disposed", { definition: "disposed" })]),
      200,
    );
    await Promise.resolve();
    layer.dispose();
    requests.get("disposed")?.({ bytes: data, movementDomain: "foot" });
    await disposed;
    expect(f.scene.meshes).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("duplicate snapshots retain the pending model load and its failure", async () => {
  const f = fixture();
  let rejectModel: ((error: Error) => void) | undefined;
  const model = new Promise<never>((_resolve, reject) => {
    rejectModel = reject;
  });
  let loads = 0;
  const layer = createEntityPresentation(f.scene, f.terrain, async () => {
    loads++;
    return model;
  });
  try {
    const first = layer.accept(snapshot(0, [entity("held")]), 0);
    const duplicate = layer.accept(snapshot(0, [entity("held")]), 0);
    const settled = Promise.allSettled([first, duplicate]);
    if (!rejectModel) throw new Error("Missing model rejection control");
    rejectModel(new Error("held missing model"));
    expect((await settled).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    await expect(layer.accept(snapshot(0, [entity("held")]), 0)).rejects.toThrow(
      "held missing model",
    );
    expect(loads).toBe(1);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("a resolver failure is reported and the next snapshot can retry", async () => {
  const f = fixture();
  let attempt = 0;
  const layer = createEntityPresentation(f.scene, f.terrain, async () => {
    attempt++;
    if (attempt === 1) throw new Error("missing model");
    return {
      bytes: attempt === 2 ? new Uint8Array([1, 2, 3]) : await bytes(),
      movementDomain: "foot",
    };
  });
  try {
    await expect(layer.accept(snapshot(0, [entity("retry")]), 0)).rejects.toThrow("missing model");
    await expect(layer.accept(snapshot(1, [entity("retry")]), 50)).rejects.toThrow();
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
    await layer.accept(snapshot(2, [entity("retry")]), 100);
    expect(root(f.scene, "retry")).toBeDefined();
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("disposing after the actual GLB importer starts releases its late result", async () => {
  const f = fixture();
  const data = await bytes();
  let resolving!: () => void;
  const started = new Promise<void>((resolve) => {
    resolving = resolve;
  });
  const layer = createEntityPresentation(f.scene, f.terrain, async () => {
    resolving();
    return { bytes: data, movementDomain: "foot" };
  });
  try {
    const loading = layer.accept(snapshot(0, [entity("late")]), 0);
    await started;
    await Promise.resolve();
    layer.dispose();
    await loading;
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.geometries).toHaveLength(0);
    expect(f.scene.materials).toHaveLength(0);
    expect(f.scene.animationGroups).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("permitted event actors play independent authored attack/recoil/death clips once; removal alone never invents death", async () => {
  const f = fixture();
  const layer = createEntityPresentation(f.scene, f.terrain, async (definition) => ({
    bytes: await bytes(definition === "tank" ? "dragon-tank" : "collective-soldier"),
    movementDomain: "foot",
  }));
  const group = (handle: string, name: string) =>
    f.scene.animationGroups.find(
      (clip) =>
        clip.name === name &&
        clip.targetedAnimations.some(({ target }) => target.isDescendantOf(root(f.scene, handle))),
    );
  try {
    layer.setForceColor(0, "#dd4433");
    layer.setForceColor(1, "#4477dd");
    await layer.accept(
      snapshot(0, [entity("e1"), entity("e2", { force: 1 }), entity("e3", { definition: "tank" })]),
      0,
    );
    const shot = {
      ...snapshot(1, [
        entity("e1"),
        entity("e2", { force: 1 }),
        entity("e3", { definition: "tank" }),
      ]),
      combatEvents: [
        { type: "launch" as const, handle: "p1", entity: "e1", x: 1024, y: 1024 },
        { type: "launch" as const, handle: "p2", entity: "e3", x: 1024, y: 1024 },
      ],
    };
    await layer.accept(shot, 50);
    expect(group("e1", "attack")?.isStarted).toBe(true);
    expect(group("e2", "attack")?.isStarted).toBeFalsy();
    expect(group("e3", "fire_recoil")?.isStarted).toBe(true);
    layer.render(150);
    const attack = group("e1", "attack");
    assert(attack);
    const frame = attack.getCurrentFrame();
    expect(frame).toBeGreaterThan(attack.from);
    await layer.accept(shot, 150);
    expect(attack.getCurrentFrame()).toBe(frame);
    layer.setPlaybackRate(0);
    layer.render(1000);
    expect(attack.getCurrentFrame()).toBe(frame);
    layer.setPlaybackRate(1);
    const victim = root(f.scene, "e2");
    await layer.accept(
      {
        ...snapshot(2, [entity("e1")]),
        combatEvents: [{ type: "death", entity: "e2", x: 1024, y: 1024 }],
      },
      1000,
    );
    expect(victim.isDisposed()).toBe(false);
    expect(victim.getChildMeshes().every((mesh) => !mesh.isPickable)).toBe(true);
    expect(group("e2", "death")?.isStarted).toBe(true);
    expect(f.scene.getTransformNodeByName("entity e3")).toBeNull();
    layer.render(1200);
    const deathFrame = group("e2", "death")?.getCurrentFrame();
    layer.setPlaybackRate(0);
    layer.render(5000);
    expect(group("e2", "death")?.getCurrentFrame()).toBe(deathFrame);
    layer.setPlaybackRate(1);
    layer.render(9000);
    expect(victim.isDisposed()).toBe(true);
    await layer.accept(snapshot(3, []), 9000);
    expect(f.scene.meshes).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("private work/progress and actual health drive presentation; fog revokes retained death models", async () => {
  const f = fixture();
  const layer = createEntityPresentation(f.scene, f.terrain, async () => ({
    bytes: await bytes("field-technician"),
    movementDomain: "foot",
  }));
  try {
    const worker = entity("e1", {
      health: 25,
      constructionOrder: { site: "e2", state: "working" },
      construction: { completedTicks: 2, quarter: 0, totalTicks: 8, buildersWorking: 1 },
    });
    await layer.accept(snapshot(0, [worker]), 0);
    layer.render(100);
    const attack = f.scene.animationGroups.find(
      (clip) =>
        clip.name === "attack" &&
        clip.targetedAnimations.some(({ target }) => target.isDescendantOf(root(f.scene, "e1"))),
    );
    assert(attack);
    expect(attack.getCurrentFrame()).toBeGreaterThan(attack.from);
    expect(f.scene.meshes.filter((mesh) => mesh.name === "projected status")).toHaveLength(4);
    const fills = f.scene.meshes.filter(
      (mesh) => mesh.name === "projected status" && mesh.scaling.y === 0.1,
    );
    expect(fills.map((mesh) => mesh.scaling.x)).toEqual([1.7 / 4, 1.7 / 4]);
    const frame = attack.getCurrentFrame();
    layer.setPlaybackRate(0);
    layer.render(1000);
    expect(attack.getCurrentFrame()).toBe(frame);
    layer.setPlaybackRate(1);
    const dead = root(f.scene, "e1");
    await layer.accept(
      { ...snapshot(1, []), combatEvents: [{ type: "death", entity: "e1", x: 1024, y: 1024 }] },
      1000,
    );
    expect(dead.isDisposed()).toBe(false);
    await layer.accept(
      {
        ...snapshot(2, []),
        mode: "controlled",
        fog: [{ group: 0, width: 8, height: 8, cells: new Uint8Array(64) }],
      },
      1050,
    );
    expect(dead.isDisposed()).toBe(true);
    expect(f.scene.materials).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});

test("late original model loads catch up an attack without replaying it, and death never resurrects an unloaded or removed actor", async () => {
  const f = fixture();
  let resolve: ((bytes: Uint8Array) => void) | undefined;
  const pending = new Promise<Uint8Array>((done) => {
    resolve = done;
  });
  const layer = createEntityPresentation(f.scene, f.terrain, async () => ({
    bytes: await pending,
    movementDomain: "foot",
  }));
  try {
    const loading = layer.accept(
      {
        ...snapshot(0, [entity("e1")]),
        combatEvents: [{ type: "launch", entity: "e1", x: 1024, y: 1024 }],
      },
      0,
    );
    layer.render(5000);
    resolve?.(await bytes());
    await loading;
    const actor = root(f.scene, "e1");
    expect(
      f.scene.animationGroups.some(
        (group) =>
          group.name === "attack" &&
          group.isStarted &&
          group.targetedAnimations.some(({ target }) => target.isDescendantOf(actor)),
      ),
    ).toBe(false);
    await layer.accept(snapshot(1, []), 5000);
    expect(actor.isDisposed()).toBe(true);
    await layer.accept(
      { ...snapshot(2, []), combatEvents: [{ type: "death", entity: "e1", x: 1024, y: 1024 }] },
      5050,
    );
    expect(f.scene.meshes).toHaveLength(0);
  } finally {
    layer.dispose();
    f.dispose();
  }
});
