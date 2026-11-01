import type { AbstractMesh, TransformNode } from "@babylonjs/core";

/** Select disjoint authored branches without reparenting nodes or changing animation targets. */
export function createModelLod(nodes: readonly TransformNode[], meshes: readonly AbstractMesh[]) {
  const masks = new Map<AbstractMesh, { visible: boolean; levels: boolean[] }>();
  for (const low of nodes) {
    if (!low.name.endsWith("_LOD1")) continue;
    const base = low.name.slice(0, -5);
    const near = nodes.filter((node) => node.name === base || node.name === `${base}_LOD0`);
    if (near.length !== 1 || nodes.filter((node) => node.name === low.name).length !== 1) continue;
    const high = near[0];
    if (!high || high.isDescendantOf(low) || low.isDescendantOf(high)) continue;
    const branches = [high, low].map((root) =>
      meshes.filter((mesh) => mesh === root || mesh.isDescendantOf(root)),
    );
    if (branches.some((branch) => !branch.some((mesh) => mesh.getTotalVertices() > 0))) continue;
    for (const [index, branch] of branches.entries()) {
      for (const mesh of branch) {
        const mask = masks.get(mesh) ?? { visible: mesh.isVisible, levels: [] };
        mask.levels.push(index === 1);
        masks.set(mesh, mask);
      }
    }
  }
  if (!masks.size) return undefined;
  let previous: boolean | undefined;
  return {
    setDistant(distant: boolean) {
      if (distant === previous) return;
      previous = distant;
      for (const [mesh, mask] of masks)
        mesh.isVisible = mask.visible && mask.levels.every((level) => level === distant);
    },
  };
}
