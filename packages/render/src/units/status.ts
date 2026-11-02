import {
  Color3,
  type InstancedMesh,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  type Vector3,
} from "@babylonjs/core";

/** Shared cube geometry/materials; every value comes from the latest permitted actor snapshot. */
export function createStatusBars(scene: Scene) {
  const models = new Map<string, Mesh>();
  const bars = new Map<string, { background: InstancedMesh; fill: InstancedMesh; color: string }>();
  function model(color: string) {
    let mesh = models.get(color);
    if (mesh) return mesh;
    mesh = MeshBuilder.CreateBox("status bar template", { size: 1 }, scene);
    const material = new StandardMaterial("status bar", scene);
    material.emissiveColor = Color3.FromHexString(color);
    material.disableLighting = true;
    mesh.material = material;
    mesh.isVisible = mesh.isPickable = false;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    models.set(color, mesh);
    return mesh;
  }
  function instance(color: string) {
    const mesh = model(color).createInstance("projected status");
    mesh.isVisible = true;
    mesh.isPickable = false;
    return mesh;
  }
  const remove = (handle: string) => {
    const bar = bars.get(handle);
    bar?.background.dispose();
    bar?.fill.dispose();
    bars.delete(handle);
    if (!bars.size) {
      for (const mesh of models.values()) {
        mesh.material?.dispose();
        mesh.dispose();
      }
      models.clear();
    }
  };
  return {
    update(handle: string, position: Vector3, fraction: number, construction = false) {
      const amount = Math.max(0, Math.min(1, fraction));
      const color = construction
        ? "#65c9ee"
        : amount > 0.66
          ? "#69ca78"
          : amount > 0.33
            ? "#ebcf61"
            : "#ea6b57";
      let bar = bars.get(handle);
      if (!bar || bar.color !== color) {
        remove(handle);
        bar = { background: instance("#1b2432"), fill: instance(color), color };
        bars.set(handle, bar);
      }
      bar.background.position.copyFrom(position);
      bar.background.scaling.set(1.8, 0.16, 0.05);
      bar.fill.position.copyFrom(position);
      bar.fill.position.y += 0.01;
      bar.fill.scaling.set(1.7 * amount, 0.1, 0.07);
      bar.fill.setEnabled(amount > 0);
    },
    remove,
    dispose() {
      for (const handle of bars.keys()) remove(handle);
      for (const mesh of models.values()) {
        mesh.material?.dispose();
        mesh.dispose();
      }
      models.clear();
    },
  };
}
