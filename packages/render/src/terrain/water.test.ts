import { expect, test } from "bun:test";
import { NullEngine, Scene } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import { createTerrain } from ".";
import { buildTerrainGeometry, CELL_SIZE } from "./mesh";

test("shore mask stays on wet shores across chunks/edges; map disposal releases water animation and textures", async () => {
  const grid = parseTerrain(32, 32, {}, "temperate");
  for (let y = 10; y < 22; y++)
    for (let x = 10; x < 22; x++)
      grid.water[y * 32 + x] = x > 12 && x < 19 && y > 12 && y < 19 ? 2 : 1;
  for (let y = 0; y < 32; y++) for (let x = 30; x < 32; x++) grid.water[y * 32 + x] = 2;
  for (let x = 0; x < 32; x++) grid.water[25 * 32 + x] = x < 10 || x > 18 ? 2 : 1;
  const chunks = buildTerrainGeometry(grid);
  expect(chunks.filter((chunk) => chunk.foam).length).toBeGreaterThan(4);
  const sample = (x: number, y: number) =>
    grid.water[Math.max(0, Math.min(31, y)) * 32 + Math.max(0, Math.min(31, x))];
  for (const chunk of chunks) {
    if (chunk.water) {
      expect(chunk.water.uvs?.length).toBe((chunk.water.positions.length / 3) * 2);
      for (let i = 0; i < chunk.water.positions.length; i += 3)
        if ((chunk.water.normals[i + 1] ?? 0) > 0.5) {
          expect(chunk.water.uvs?.[(i / 3) * 2]).toBe((chunk.water.positions[i] ?? 0) / CELL_SIZE);
          expect(chunk.water.uvs?.[(i / 3) * 2 + 1]).toBe(
            (chunk.water.positions[i + 2] ?? 0) / CELL_SIZE,
          );
        }
    }
    const foam = chunk.foam;
    if (!foam) continue;
    for (let i = 0; i < foam.positions.length; i += 12) {
      const x = Math.floor(
        ((foam.positions[i] ?? 0) + (foam.positions[i + 6] ?? 0)) / 2 / CELL_SIZE,
      );
      const y = Math.floor(
        ((foam.positions[i + 2] ?? 0) + (foam.positions[i + 8] ?? 0)) / 2 / CELL_SIZE,
      );
      expect(sample(x, y)).toBeGreaterThan(0);
      expect(
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx = 0, dy = 0]) => sample(x + dx, y + dy) === 0),
      ).toBe(true);
      expect(foam.colors[(i / 3) * 4 + 3]).toBeCloseTo(0.75);
      expect(foam.colors[(i / 3) * 4 + 11]).toBe(0);
    }
  }
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const observers = scene.onBeforeRenderObservable.observers.length;
  const terrain = createTerrain(scene, grid);
  expect(scene.textures.length).toBe(2);
  expect(scene.onBeforeRenderObservable.observers.length).toBe(observers + 1);
  terrain.dispose();
  expect(scene.textures.length).toBe(0);
  expect(scene.materials.length).toBe(0);
  expect(scene.meshes.length).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(scene.onBeforeRenderObservable.observers.length).toBe(observers);
  const dry = createTerrain(scene, parseTerrain(4, 4, {}, "temperate"));
  expect(scene.textures.length).toBe(0);
  dry.dispose();
  scene.dispose();
  engine.dispose();
});
