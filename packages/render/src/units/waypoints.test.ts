import { expect, test } from "bun:test";
import { ArcRotateCamera, Matrix, NullEngine, Scene, Vector3, Viewport } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { createOrderWaypoints } from "./waypoints";

test("queued markers pick in CSS pixels, preview copied points and discard hidden targets and reset drafts", () => {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  engine.getRenderingCanvas = () => ({ clientWidth: 640, clientHeight: 360 }) as HTMLCanvasElement;
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera("camera", Math.PI / 2, 0.7, 35, new Vector3(10, 0, 10), scene);
  camera.viewport = new Viewport(0.1, 0.15, 0.8, 0.7);
  camera.getViewMatrix(true);
  camera.getProjectionMatrix(true);
  scene.updateTransformMatrix(true);
  const layer = createOrderWaypoints(scene, parseTerrain(32, 32, {}));
  const actor = {
    handle: "e1",
    definition: "unit:fixture/builder",
    force: 0,
    x: 1024,
    y: 1024,
    facing: 0,
    health: 10,
    maxHealth: 10,
    order: null,
  };
  const snapshot: SeatSnapshot = {
    tick: 0,
    mode: "controlled",
    entities: [
      {
        ...actor,
        queuedOrders: [
          { handle: "e3", type: "unit.move", x: 3072, y: 3072 },
          { handle: "e4", type: "unit.attack", target: "e2" },
          { handle: "e5", type: "economy.build", x: 8192, y: 8192 },
        ],
      },
      { ...actor, handle: "e2", force: 1, x: 6144, y: 6144 },
    ],
  };
  try {
    layer.accept(snapshot, []);
    expect(layer.marker("e3")).toBeUndefined();
    layer.accept(snapshot, ["e1"]);
    expect(layer.marker("e3")).toMatchObject({ editable: true, grid: false, x: 3072, y: 3072 });
    expect(layer.marker("e4")).toMatchObject({ editable: false });
    expect(layer.marker("e5")).toMatchObject({ editable: true, grid: true });
    const viewport = new Viewport(64, 54, 512, 252);
    const at = Vector3.Project(
      new Vector3(6, 0.2, 6),
      Matrix.IdentityReadOnly,
      scene.getTransformMatrix(),
      viewport,
    );
    expect(layer.pick(at.x, at.y)?.handle).toBe("e3");
    expect(layer.pick(at.x + 15, at.y)).toBeUndefined();
    const copy = layer.marker("e3")!;
    copy.x = -1;
    expect(layer.marker("e3")?.x).toBe(3072);
    layer.focus("e3");
    const material = scene.meshes[0]?.material;
    layer.preview({ handle: "e3", x: 4096, y: 4096 });
    expect(layer.marker("e3")?.x).toBe(4096);
    expect(snapshot.entities[0]?.queuedOrders?.[0]?.x).toBe(3072);
    expect(scene.meshes[0]?.material).toBe(material);
    layer.accept(
      {
        ...snapshot,
        entities: [
          {
            ...snapshot.entities[0]!,
            queuedOrders: snapshot.entities[0]!.queuedOrders!.map((row) =>
              row.handle === "e4" ? { handle: row.handle, type: row.type } : row,
            ),
          },
        ],
      },
      ["e1"],
    );
    expect(layer.marker("e4")).toBeUndefined();
    layer.accept(undefined, []);
    layer.accept(snapshot, ["e1"]);
    expect(layer.marker("e3")?.x).toBe(3072);
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("a moving order retains its live line mesh and compiled material", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    layer = createOrderWaypoints(scene, parseTerrain(32, 32, {}));
  const entity: SeatSnapshot["entities"][number] = {
    handle: "e1",
    definition: "unit:fixture/soldier",
    force: 0,
    x: 1024,
    y: 1024,
    facing: 0,
    health: 100,
    maxHealth: 100,
    order: { type: "move", x: 8192, y: 8192 },
  };
  const snapshot: SeatSnapshot = { tick: 0, mode: "controlled", entities: [entity] };
  try {
    layer.accept(snapshot, ["e1"]);
    const mesh = scene.meshes[0],
      material = mesh?.material;
    expect(mesh).toBeDefined();
    layer.accept({ ...snapshot, tick: 1, entities: [{ ...entity, x: 1100 }] }, ["e1"]);
    expect(scene.meshes[0]).toBe(mesh);
    expect(scene.meshes[0]?.material).toBe(material);
    expect(mesh?.isDisposed()).toBe(false);
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("selected copied queues produce one disposable overlay and never retain hidden target positions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const layer = createOrderWaypoints(scene, parseTerrain(32, 32, {}));
  const snapshot: SeatSnapshot = {
    tick: 0,
    mode: "controlled",
    entities: [
      {
        handle: "e1",
        definition: "unit:fixture/soldier",
        force: 0,
        x: 1024,
        y: 1024,
        facing: 0,
        health: 100,
        maxHealth: 100,
        order: { type: "move", x: 2048, y: 2048 },
        queuedOrders: [
          { handle: "e3", type: "unit.move", x: 3072, y: 3072 },
          { handle: "e4", type: "unit.attack", target: "e2" },
        ],
      },
      {
        handle: "e2",
        definition: "unit:fixture/enemy",
        force: 1,
        x: 8192,
        y: 8192,
        facing: 0,
        health: 100,
        maxHealth: 100,
        order: null,
      },
    ],
  };
  try {
    layer.accept(snapshot, []);
    expect(scene.meshes).toHaveLength(0);
    layer.accept(snapshot, ["e1"]);
    expect(scene.meshes).toHaveLength(1);
    const visible = scene.meshes[0]!;
    expect(visible.isPickable).toBe(false);
    const width = visible.getBoundingInfo().boundingBox.maximum.x;
    layer.accept(
      {
        ...snapshot,
        entities: snapshot.entities.slice(0, 1).map((row) => ({
          ...row,
          queuedOrders: row.queuedOrders?.map((order) =>
            order.type === "unit.attack" ? { handle: order.handle, type: order.type } : order,
          ),
        })),
      },
      ["e1"],
    );
    expect(visible.isDisposed()).toBe(true);
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]!.getBoundingInfo().boundingBox.maximum.x).toBeLessThan(width);
    layer.accept(undefined, []);
    expect(scene.meshes).toHaveLength(0);
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});
