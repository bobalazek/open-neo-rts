import { Color3, Mesh, type Scene, StandardMaterial, VertexData } from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import type { SpawnPlacement } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight, waterHeight } from "../terrain";

/** Default refusal colours follow copied worker results; an advisory footprint can supply a neutral colour. */
export function createPlacementOverlay(
  scene: Scene,
  terrain: TerrainGrid,
  footprintColor?: string,
) {
  let mesh: Mesh | undefined;
  let disposed = false;
  function clear() {
    mesh?.dispose(false, true);
    mesh = undefined;
  }
  return {
    accept(result: SpawnPlacement | null) {
      clear();
      if (disposed || !result?.cells?.length) return;
      const positions: number[] = [],
        colors: number[] = [],
        indices: number[] = [];
      for (const cell of result.cells) {
        const color = Color3.FromHexString(
          footprintColor ?? (cell.failure ? "#f05a67" : "#67d68c"),
        );
        const start = positions.length / 3;
        for (const [dx, dy] of [
          [0.04, 0.04],
          [0.96, 0.04],
          [0.96, 0.96],
          [0.04, 0.96],
        ] as const) {
          const x = cell.x + dx,
            y = cell.y + dy;
          positions.push(
            x * CELL_SIZE,
            Math.max(terrainHeight(terrain, x, y), waterHeight(terrain, x, y)) + 0.13,
            y * CELL_SIZE,
          );
          colors.push(color.r, color.g, color.b, 1);
        }
        indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
      }
      mesh = new Mesh("debug placement", scene);
      const vertices = new VertexData();
      Object.assign(vertices, { positions, colors, indices });
      vertices.applyToMesh(mesh);
      const material = new StandardMaterial("debug placement", scene);
      material.disableLighting = true;
      material.emissiveColor = Color3.White();
      material.alpha = 0.65;
      material.backFaceCulling = false;
      mesh.material = material;
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
