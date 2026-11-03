import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight } from "../terrain";
import { eventVisible } from ".";

/** Original voxel flames use one instanced draw source and only copied, currently visible cells. */
export function createGroundFirePresentation(scene: Scene, terrain: TerrainGrid) {
  let mesh: Mesh | undefined, material: StandardMaterial | undefined;
  let cells: { index: number; x: number; y: number; ground: number; matrix: Matrix }[] = [];
  let elapsed = 0,
    disposed = false;
  const position = Vector3.Zero(),
    scale = Vector3.One(),
    rotation = Quaternion.Identity();
  function render(delta: number) {
    if (disposed || !mesh || !cells.length) return;
    elapsed += delta;
    for (const [i, cell] of cells.entries()) {
      const phase = ((elapsed + cell.index * 37) % 480) / 480;
      const height = 0.35 + (1 - Math.abs(phase * 2 - 1)) * 0.7;
      scale.set(CELL_SIZE * 0.3, height, CELL_SIZE * 0.3);
      position.set(cell.x, cell.ground + height / 2, cell.y);
      Matrix.ComposeToRef(scale, rotation, position, cell.matrix);
      mesh.thinInstanceSetMatrixAt(i, cell.matrix, false);
    }
    mesh.thinInstanceBufferUpdated("matrix");
  }
  return {
    accept(snapshot: SeatSnapshot) {
      if (disposed) return;
      const grid = snapshot.groundFire;
      cells = [];
      if (grid?.width === terrain.width && grid.height === terrain.height)
        for (let index = 0; index < grid.cells.length; index++) {
          if (!grid.cells[index]) continue;
          const x = index % terrain.width,
            y = Math.floor(index / terrain.width);
          if (eventVisible(snapshot, x * 1024 + 512, y * 1024 + 512))
            cells.push({
              index,
              x: (x + 0.5) * CELL_SIZE,
              y: (y + 0.5) * CELL_SIZE,
              ground: terrainHeight(terrain, x + 0.5, y + 0.5) + 0.04,
              matrix: Matrix.Identity(),
            });
        }
      if (!cells.length) {
        if (mesh) {
          mesh.isVisible = false;
          mesh.thinInstanceCount = 0;
        }
        return;
      }
      if (!mesh) {
        const voxels = [
          { width: 1, height: 0.3, depth: 0.8, x: 0, y: -0.35, color: "#d94720" },
          { width: 0.65, height: 0.5, depth: 0.65, x: -0.1, y: -0.03, color: "#ff8c29" },
          { width: 0.3, height: 0.35, depth: 0.35, x: 0.12, y: 0.28, color: "#ffe392" },
        ].map((voxel) => {
          const part = MeshBuilder.CreateBox("flame voxel", voxel, scene);
          part.position.set(voxel.x, voxel.y, 0);
          const color = Color3.FromHexString(voxel.color);
          const colors = new Float32Array(part.getTotalVertices() * 4);
          for (let i = 0; i < colors.length; i += 4) colors.set([color.r, color.g, color.b, 1], i);
          part.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
          return part;
        });
        mesh = Mesh.MergeMeshes(voxels, true) ?? undefined;
        if (!mesh) throw new Error("Ground flame geometry could not be merged");
        mesh.name = "burning ground";
        material = new StandardMaterial("ground fire glow", scene);
        material.diffuseColor = material.emissiveColor = Color3.White();
        material.disableLighting = true;
        mesh.material = material;
        mesh.isPickable = false;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alwaysSelectAsActiveMesh = true;
      }
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(cells.length * 16), 16, false);
      mesh.isVisible = true;
      render(0);
    },
    render,
    dispose() {
      disposed = true;
      cells = [];
      mesh?.dispose();
      material?.dispose();
    },
  };
}
