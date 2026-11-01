import type { AbstractMesh, TransformNode } from "@babylonjs/core";

/** Select disjoint authored branches without reparenting nodes or changing animation targets. */
export function createModelLod(nodes: readonly TransformNode[], meshes: readonly AbstractMesh[]) {
  const candidates: AbstractMesh[][][] = [];
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
    candidates.push(branches);
  }
  // Nested or crossed pairs share geometry; reject every participant, independent of node order.
  const owners = new Map<AbstractMesh, number>();
  for (const branches of candidates)
    for (const mesh of branches.flat()) owners.set(mesh, (owners.get(mesh) ?? 0) + 1);
  const masks = new Map<AbstractMesh, { visible: boolean; distant: boolean }>();
  for (const branches of candidates) {
    if (branches.flat().some((mesh) => owners.get(mesh) !== 1)) continue;
    for (const [index, branch] of branches.entries()) {
      for (const mesh of branch) {
        masks.set(mesh, { visible: mesh.isVisible, distant: index === 1 });
      }
    }
  }
  if (!masks.size) return undefined;
  let previous: boolean | undefined;
  return {
    setDistant(distant: boolean) {
      if (distant === previous) return;
      previous = distant;
      for (const [mesh, mask] of masks) mesh.isVisible = mask.visible && mask.distant === distant;
    },
  };
}
