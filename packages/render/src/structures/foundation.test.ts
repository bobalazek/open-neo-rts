import { expect, test } from "bun:test";
import { NullEngine, Scene, VertexBuffer } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import { createFoundation } from ".";

test("foundation follows each biome and its own cell height and disposes without changing terrain", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrain = parseTerrain(4, 4, {});
  terrain.biome[5] = 2;
  terrain.level[6] = 3; // The outside cliff must not lift this footprint's east edge.
  const before = JSON.stringify(terrain);
  const mesh = createFoundation(scene, terrain, 1, 1, 1, 2);
  try {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
    expect(mesh.getTotalVertices()).toBe(8);
    for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBeCloseTo(0.015);
    const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
    expect([minimum.x, minimum.z, maximum.x, maximum.z]).toEqual([2, 2, 4, 6]);
    expect(minimum.y).toBeCloseTo(0.015);
    expect(maximum.y).toBeCloseTo(0.015);
    const colors = mesh.getVerticesData(VertexBuffer.ColorKind) ?? [];
    expect(Array.from(colors.slice(0, 3))).not.toEqual(Array.from(colors.slice(16, 19)));
    expect(JSON.stringify(terrain)).toBe(before);
    mesh.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
