import { expect, test } from "bun:test";
import { NullEngine, Scene, VertexBuffer } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import { createPlacementOverlay } from "./placement";

test("placement colours and positions follow copied cells and clear without retained resources", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const overlay = createPlacementOverlay(scene, parseTerrain(32, 32, {}));
  try {
    overlay.accept({
      ok: false,
      cells: [
        { x: 5, y: 7, rule: "water", failure: "not_deep_water" },
        { x: 7, y: 5, rule: "land" },
      ],
    });
    const mesh = scene.getMeshByName("debug placement");
    const positions = mesh?.getVerticesData(VertexBuffer.PositionKind);
    const colors = mesh?.getVerticesData(VertexBuffer.ColorKind);
    expect(positions?.[0]).toBeCloseTo(10.08);
    expect(positions?.[2]).toBeCloseTo(14.08);
    expect(positions?.[12]).toBeCloseTo(14.08);
    expect(colors?.[0]).toBeCloseTo(240 / 255);
    expect(colors?.[16]).toBeCloseTo(103 / 255);
    expect(mesh?.isPickable).toBe(false);
    overlay.accept(null);
    expect(scene.getMeshByName("debug placement")).toBeNull();
    expect(scene.materials).toHaveLength(0);
    overlay.dispose();
    overlay.accept({ ok: true, cells: [{ x: 1, y: 1 }] });
    expect(scene.meshes).toHaveLength(0);
  } finally {
    overlay.dispose();
    scene.dispose();
    engine.dispose();
  }
});
