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
import { buildTerrainGeometry, type Geometry } from "./mesh";

export { PALETTES, type Palette } from "./biomes";
export { createDemoGrid } from "./demo";
export { BORDER, CELL_SIZE, CHUNK_SIZE, LEVEL_HEIGHT } from "./mesh";

/**
 * Terrain meshes (one per chunk, plus one water mesh per chunk with water) under one node, each cell in its
 * biome's palette.
 */
export function createTerrain(scene: Scene, grid: TerrainGrid): TransformNode {
  const root = new TransformNode("terrain", scene);
  const ground = new StandardMaterial("terrain", scene);
  ground.specularColor = new Color3(0.06, 0.06, 0.06);
  const water = new StandardMaterial("water", scene);
  water.alpha = 0.8;
  water.specularColor = new Color3(0.5, 0.5, 0.5);
  water.specularPower = 64;

  const mesh = (name: string, geometry: Geometry, material: StandardMaterial) => {
    const m = new Mesh(name, scene, root);
    const data = new VertexData();
    data.positions = geometry.positions;
    data.normals = geometry.normals;
    data.colors = geometry.colors;
    data.indices = geometry.indices;
    data.applyToMesh(m);
    m.material = material;
    m.freezeWorldMatrix();
  };
  for (const chunk of buildTerrainGeometry(grid)) {
    mesh(`terrain ${chunk.cx},${chunk.cy}`, chunk.terrain, ground);
    if (chunk.water) mesh(`water ${chunk.cx},${chunk.cy}`, chunk.water, water);
  }
  ground.freeze();
  water.freeze();
  return root;
}
