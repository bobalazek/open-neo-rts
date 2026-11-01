// Static map art is separate from selectable, authoritative simulation entities.
import { type AssetContainer, type Scene, TransformNode } from "@babylonjs/core";
import type { TerrainGrid } from "@open-neo-rts/content";
import { loadModelContainer } from "../units/model";
import { CELL_SIZE, hash2, terrainHeight } from "./mesh";

export interface MapDecoration {
  definition: string;
  position: readonly number[];
  rotation?: number;
}
export interface StaticMapInstance extends MapDecoration {
  footprint: readonly number[];
}
export interface MapResource {
  kind: string;
  position: readonly number[];
  radius?: number;
}

/** Visual-only ore discs; one full-stage marker per cell, with no inferred resource amounts or caps. */
export function resourceInstances(
  map: { id: string; resources: readonly MapResource[] },
  terrain: TerrainGrid,
  seed = 0,
): StaticMapInstance[] {
  let identity = seed;
  for (const char of map.id) identity = hash2(identity, char.charCodeAt(0));
  const result: StaticMapInstance[] = [];
  const cells = new Set<string>();
  for (const field of map.resources) {
    const [cx = NaN, cy = NaN] = field.position;
    if (
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      cx < 0 ||
      cy < 0 ||
      cx >= terrain.width ||
      cy >= terrain.height
    )
      throw new Error("Invalid resource position");
    if (field.kind === "materials") {
      result.push({ definition: "material-node", position: [cx, cy], footprint: [2, 2] });
      continue;
    }
    if (field.kind !== "ore") throw new Error(`Unknown resource kind: ${field.kind}`);
    const radius = field.radius ?? 1;
    if (!Number.isFinite(radius) || radius < 0) throw new Error("Invalid ore radius");
    // Match the authored-map preview's integer-cell disc; models sit at each cell centre.
    for (
      let y = Math.max(0, radius === 0 ? Math.floor(cy) : Math.ceil(cy - radius));
      y <= Math.min(terrain.height - 1, radius === 0 ? Math.floor(cy) : Math.floor(cy + radius));
      y++
    ) {
      for (
        let x = Math.max(0, radius === 0 ? Math.floor(cx) : Math.ceil(cx - radius));
        x <= Math.min(terrain.width - 1, radius === 0 ? Math.floor(cx) : Math.floor(cx + radius));
        x++
      ) {
        if (radius > 0 && (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
        const key = `${x},${y}`;
        if (cells.has(key)) continue;
        cells.add(key);
        result.push({
          definition: "ore-cell",
          position: [x + 0.5, y + 0.5],
          footprint: [1, 1],
          rotation: (hash2(identity, hash2(x, y)) % 4) * 90,
        });
      }
    }
  }
  return result;
}

/** Each original asset is loaded once; rigid instances share its geometry and materials. */
export function createMapPresentation(
  scene: Scene,
  terrain: TerrainGrid,
  placements: readonly StaticMapInstance[],
  resolveModel: (definition: string) => Promise<Uint8Array>,
) {
  const models: AssetContainer[] = [];
  const instances: ReturnType<AssetContainer["instantiateModelsToScene"]>[] = [];
  const roots: TransformNode[] = [];
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const instance of instances) instance.dispose();
    for (const root of roots) root.dispose();
    for (const model of models) model.dispose();
  }
  const ready = (async () => {
    try {
      const groups = new Map<string, StaticMapInstance[]>();
      for (const placement of placements) {
        const [x = NaN, y = NaN] = placement.position;
        const [w = NaN, h = NaN] = placement.footprint;
        const rotation = placement.rotation ?? 0;
        const width = rotation % 180 === 0 ? w : h;
        const height = rotation % 180 === 0 ? h : w;
        if (
          ![x, y, w, h, rotation].every(Number.isFinite) ||
          w <= 0 ||
          h <= 0 ||
          rotation % 90 !== 0 ||
          x - width / 2 < 0 ||
          y - height / 2 < 0 ||
          x + width / 2 > terrain.width ||
          y + height / 2 > terrain.height
        ) {
          throw new Error(
            `Map model ${placement.definition}: invalid transform or footprint outside map`,
          );
        }
        const group = groups.get(placement.definition) ?? [];
        group.push(placement);
        groups.set(placement.definition, group);
      }
      for (const [definition, group] of groups) {
        try {
          const bytes = await resolveModel(definition);
          if (disposed) return;
          const model = await loadModelContainer(scene, bytes);
          if (disposed) {
            model.dispose();
            return;
          }
          models.push(model);
          model.addAllToScene();
          const visibility = new Map(model.meshes.map((mesh) => [mesh.name, mesh.isVisible]));
          for (const mesh of model.meshes) {
            mesh.isVisible = false;
            mesh.isPickable = false;
          }
          for (const placement of group) {
            const instance = model.instantiateModelsToScene((name) => name, false, {
              doNotInstantiate: false,
            });
            instances.push(instance);
            const root = new TransformNode(`map object ${roots.length}: ${definition}`, scene);
            roots.push(root);
            for (const node of instance.rootNodes) node.parent = root;
            for (const node of root.getDescendants()) {
              if (node.name.startsWith("stage_") && node.name !== "stage_full")
                node.setEnabled(false);
            }
            for (const mesh of root.getChildMeshes()) {
              mesh.isVisible = visibility.get(mesh.name) ?? true;
              mesh.isPickable = false;
            }
            const [x = 0, y = 0] = placement.position;
            root.position.set(x * CELL_SIZE, terrainHeight(terrain, x, y), y * CELL_SIZE);
            root.rotation.y = ((placement.rotation ?? 0) * Math.PI) / 180;
          }
        } catch (error) {
          throw new Error(
            `Map model ${definition}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
    } catch (error) {
      dispose();
      throw error;
    }
  })();
  return { ready, dispose };
}
