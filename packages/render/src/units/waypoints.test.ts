import { expect, test } from "bun:test";
import { NullEngine, Scene } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { createOrderWaypoints } from "./waypoints";

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
