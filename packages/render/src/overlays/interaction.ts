import { type AbstractMesh, Color3, type Scene, SelectionOutlineLayer } from "@babylonjs/core";

/** Native per-instance outlines; callers supply only geometry visible to this seat. */
export function createInteractionOutline(scene: Scene) {
  const layer = new SelectionOutlineLayer("world interaction", scene);
  layer.outlineColor = Color3.FromHexString("#ddc382");
  layer.outlineThickness = 2;
  layer.useDepthOcclusion = true;
  layer.occlusionStrength = 1;
  let key = "";
  return {
    update(groups: readonly (readonly AbstractMesh[])[]) {
      const unique = new Map<string, AbstractMesh[]>();
      for (const group of groups) {
        const visible = group.filter(
          (mesh) => !mesh.isDisposed() && mesh.isVisible && mesh.isEnabled(),
        );
        if (visible.length) unique.set(visible.map((mesh) => mesh.uniqueId).join(","), visible);
      }
      const visible = [...unique.values()];
      const next = visible.map((group) => group.map((mesh) => mesh.uniqueId).join(",")).join(";");
      if (next === key) return;
      key = next;
      layer.clearSelection();
      for (const group of visible) layer.addSelection(group);
    },
    dispose() {
      layer.dispose();
    },
  };
}
