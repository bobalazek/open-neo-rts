import { expect, test } from "bun:test";
import { FreeCamera, Mesh, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import { createTerrain } from ".";
import { buildTerrainGeometry, CELL_SIZE, CHUNK_SIZE } from "./mesh";

test("distant terrain reduces flat interiors while preserving joins, boundaries and mesh ownership", () => {
  const grid = parseTerrain(32, 32, {}, "temperate");
  for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) grid.level[y * 32 + x] = 1;
  for (const y of [14, 15]) grid.ramp[y * 32 + 15] = 2;
  for (let y = 4; y < 10; y++) for (let x = 4; x < 10; x++) grid.water[y * 32 + x] = 1;
  for (let x = 0; x < 32; x++) grid.surface[22 * 32 + x] = 6;
  const near = buildTerrainGeometry(grid);
  const far = buildTerrainGeometry(grid, true);
  const indices = (chunks: typeof near) =>
    chunks.reduce((sum, chunk) => sum + chunk.terrain.indices.length, 0);
  expect(indices(far)).toBeLessThan(indices(near) * 0.9);
  const sample = (x: number, y: number) =>
    Math.max(0, Math.min(31, y)) * 32 + Math.max(0, Math.min(31, x));
  for (const [index, chunk] of near.entries()) {
    const distant = far[index]?.terrain;
    if (!distant) throw new Error("Missing distant chunk");
    const quads = new Set<string>();
    for (let i = 0; i < distant.positions.length; i += 12)
      quads.add([...distant.positions.slice(i, i + 12)].join(","));
    for (let i = 0; i < chunk.terrain.positions.length; i += 12) {
      let x = 0,
        y = 0;
      for (let vertex = 0; vertex < 4; vertex++) {
        x += (chunk.terrain.positions[i + vertex * 3] ?? 0) / 4 / CELL_SIZE;
        y += (chunk.terrain.positions[i + vertex * 3 + 2] ?? 0) / 4 / CELL_SIZE;
      }
      x = Math.floor(x);
      y = Math.floor(y);
      const cell = sample(x, y);
      const edge =
        x <= chunk.cx * CHUNK_SIZE ||
        y <= chunk.cy * CHUNK_SIZE ||
        x >= (chunk.cx + 1) * CHUNK_SIZE - 1 ||
        y >= (chunk.cy + 1) * CHUNK_SIZE - 1;
      const joins = [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([dx = 0, dy = 0]) => {
        const neighbour = sample(x + dx, y + dy);
        return (
          grid.ramp[neighbour] !== 0 ||
          grid.water[neighbour] !== 0 ||
          grid.level[neighbour] !== grid.level[cell] ||
          grid.surface[neighbour] !== grid.surface[cell]
        );
      });
      if (edge || joins || x < 0 || y < 0 || x >= 32 || y >= 32)
        expect(quads.has([...chunk.terrain.positions.slice(i, i + 12)].join(","))).toBe(true);
    }
  }
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = createTerrain(scene, grid);
  const mesh = root.getChildMeshes().find((mesh) => mesh instanceof Mesh && mesh.hasLODLevels) as
    | Mesh
    | undefined;
  if (!mesh) throw new Error("Missing terrain LOD");
  const camera = new FreeCamera("test", new Vector3(0, 1000, 0), scene);
  camera.getViewMatrix(true);
  const low = mesh.getLOD(camera);
  expect(low !== mesh).toBe(true);
  expect(low?.isPickable).toBe(false);
  root.setQuality("low");
  expect(mesh.getLODLevels()[0]?.distanceOrScreenCoverage).toBe(64);
  root.setQuality("ultra");
  expect(mesh.getLODLevels()[0]?.distanceOrScreenCoverage).toBe(160);
  camera.position
    .copyFrom(mesh.getBoundingInfo().boundingSphere.centerWorld)
    .addInPlaceFromFloats(0, 5, 0);
  camera.getViewMatrix(true);
  expect(mesh.getLOD(camera) === mesh).toBe(true);
  root.dispose();
  expect(scene.meshes.length).toBe(0);
  expect(scene.materials.length).toBe(0);
  expect(scene.textures.length).toBe(0);
  scene.dispose();
  engine.dispose();
});
