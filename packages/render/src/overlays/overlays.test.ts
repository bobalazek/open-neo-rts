import { expect, test } from "bun:test";
import { NullEngine, Scene, VertexBuffer } from "@babylonjs/core";
import type { DebugOverlayData } from "@open-neo-rts/sim";
import { createDebugOverlays } from ".";

test("copied overlays follow ramp heights, toggle independently and release geometry", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const layer = createDebugOverlays(scene);
  const data: DebugOverlayData = {
    tick: 1,
    terrain: {
      width: 2,
      height: 1,
      level: [0, 0],
      ramp: [0, 2],
      surface: [0, 0],
      water: [0, 0],
      biome: [0, 0],
    },
    navigation: {
      revision: 1,
      width: 2,
      height: 1,
      domain: "foot",
      radiusSubcells: 0,
      cost: [2, 0],
      connections: [0, 0],
      speedPercent: [100, 0],
    },
    paths: [
      {
        handle: "e1",
        points: [
          { x: 512, y: 512 },
          { x: 1536, y: 512 },
        ],
        target: { x: 1536, y: 512 },
        searching: false,
      },
    ],
  };
  try {
    layer.configure({ grid: true, heights: true, navigation: "foot", paths: true });
    layer.accept(structuredClone(data));
    expect(scene.getMeshByName("debug grid")).not.toBeNull();
    expect(scene.getMeshByName("debug navigation")).not.toBeNull();
    expect(scene.getMeshByName("debug paths")).not.toBeNull();
    const positions = scene
      .getMeshByName("debug heights")
      ?.getVerticesData(VertexBuffer.PositionKind);
    expect(positions?.[13]).toBeCloseTo(-0.06);
    expect(positions?.[16]).toBeCloseTo(1.74);
    expect(scene.meshes.every((mesh) => !mesh.isPickable)).toBe(true);
    layer.configure({ grid: true, heights: false, navigation: "foot", paths: false });
    expect(scene.getMeshByName("debug grid")).not.toBeNull();
    expect(scene.getMeshByName("debug heights")).toBeNull();
    expect(scene.getMeshByName("debug paths")).toBeNull();
    expect(scene.getMeshByName("debug navigation")).not.toBeNull();
    layer.configure({ grid: false, heights: false, navigation: null, paths: false });
    expect(scene.meshes).toHaveLength(0);
    layer.dispose();
    layer.accept(data);
    expect(scene.meshes).toHaveLength(0);
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});
