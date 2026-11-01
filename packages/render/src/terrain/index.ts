// Blocky terrain chunks, height levels, ramps, water. Phase 1b.

import {
  Color3,
  Mesh,
  type Scene,
  StandardMaterial,
  TransformNode,
  VertexData,
} from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import { registerShadowCaster } from "../scene/shadows";
import { buildTerrainGeometry, type Geometry } from "./mesh";
import { createWaterMaterials } from "./water";

export { PALETTES, type Palette } from "./biomes";
export { createDemoGrid } from "./demo";
export { BORDER, CELL_SIZE, CHUNK_SIZE, LEVEL_HEIGHT, terrainHeight, waterHeight } from "./mesh";

/**
 * Terrain meshes with shared animated water and wet-side shoreline foam, owned by one disposable root.
 */
export function createTerrain(scene: Scene, grid: TerrainGrid): TransformNode {
  const root = new TransformNode("terrain", scene);
  const ground = new StandardMaterial("terrain", scene);
  ground.specularColor = new Color3(0.06, 0.06, 0.06);
  let water: ReturnType<typeof createWaterMaterials> | undefined;

  const mesh = (name: string, geometry: Geometry, material: StandardMaterial) => {
    const m = new Mesh(name, scene, root);
    const data = new VertexData();
    data.positions = geometry.positions;
    data.normals = geometry.normals;
    data.colors = geometry.colors;
    data.indices = geometry.indices;
    if (geometry.uvs) data.uvs = geometry.uvs;
    data.applyToMesh(m);
    m.hasVertexAlpha = name.startsWith("shore foam");
    m.alphaIndex = m.hasVertexAlpha ? 1 : 0;
    m.isPickable = !m.hasVertexAlpha;
    m.material = material;
    if (material === ground) registerShadowCaster(m);
    m.freezeWorldMatrix();
  };
  for (const chunk of buildTerrainGeometry(grid)) {
    mesh(`terrain ${chunk.cx},${chunk.cy}`, chunk.terrain, ground);
    if (chunk.water) {
      water ??= createWaterMaterials(scene, root);
      mesh(`water ${chunk.cx},${chunk.cy}`, chunk.water, water.water);
      if (chunk.foam) mesh(`shore foam ${chunk.cx},${chunk.cy}`, chunk.foam, water.shore);
    }
  }
  // Quality changes rebuild shadow, prepass and depth shader variants; keep materials unfrozen.
  root.onDisposeObservable.addOnce(() => ground.dispose());
  return root;
}
