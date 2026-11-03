// Projected foundations and construction assembly. Destruction remains phase 2.
import { Color3, Mesh, type Scene, StandardMaterial, VertexData } from "@babylonjs/core";
import { BIOMES, type TerrainGrid } from "@open-neo-rts/content";
import { CELL_SIZE, PALETTES, terrainHeight } from "../terrain";

/** A removable surface overlay; the authored terrain and simulation remain untouched. */
export function createFoundation(
  scene: Scene,
  grid: TerrainGrid,
  x: number,
  y: number,
  width: number,
  depth: number,
): Mesh {
  const mesh = new Mesh("structure foundation", scene);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  for (let cy = 0; cy < depth; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const px = x + cx;
      const py = y + cy;
      const cell =
        Math.min(grid.height - 1, Math.floor(py)) * grid.width +
        Math.min(grid.width - 1, Math.floor(px));
      const biome = BIOMES[grid.biome[cell] ?? 0] ?? "temperate";
      const color = Color3.FromHexString(
        `#${PALETTES[biome].foundation.toString(16).padStart(6, "0")}`,
      );
      const start = positions.length / 3;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const) {
        // Sample inside this cell so a neighbouring cliff cannot lift its corner.
        const height = terrainHeight(
          grid,
          px + (dx ? 1 - 1e-6 : 1e-6),
          py + (dy ? 1 - 1e-6 : 1e-6),
        );
        positions.push((px + dx) * CELL_SIZE, height + 0.015, (py + dy) * CELL_SIZE);
        normals.push(0, 1, 0);
        colors.push(color.r, color.g, color.b, 1);
      }
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
    }
  }
  const data = new VertexData();
  Object.assign(data, { positions, colors, indices, normals });
  data.applyToMesh(mesh);
  const material = new StandardMaterial("structure foundation", scene);
  material.specularColor = new Color3(0.04, 0.04, 0.04);
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();
  mesh.onDisposeObservable.addOnce(() => material.dispose());
  return mesh;
}
