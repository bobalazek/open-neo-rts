import { type DirectionalLight, Matrix, Vector3 } from "@babylonjs/core";

/** Same dynamic oriented-box bounds as Babylon, projected by centre and three half-axes. */
export function installAffineShadowFit(light: DirectionalLight): () => void {
  const previous = light.customProjectionMatrixBuilder;
  if (typeof previous === "function" || !light.autoUpdateExtends) return () => {};
  let fitted = false;
  const low: [number, number, number] = [0, 0, 0];
  const high: [number, number, number] = [0, 0, 0];
  const point = Vector3.Zero();
  const builder: NonNullable<DirectionalLight["customProjectionMatrixBuilder"]> = (
    view,
    casters,
    result,
  ) => {
    const scene = light.getScene();
    const camera = scene.activeCamera;
    const engine = scene.getEngine();
    const m = view.m;
    if (light.shadowFrustumSize > 0) {
      Matrix.OrthoLHToRef(
        light.shadowFrustumSize,
        light.shadowFrustumSize,
        light.shadowMinZ ?? (camera?.minZ || 0),
        light.shadowMaxZ ?? (camera?.maxZ || 10000),
        result,
        engine.isNDCHalfZRange,
      );
      return;
    }
    if (light.autoUpdateExtends || !fitted) {
      low.fill(Number.MAX_VALUE);
      high.fill(-Number.MAX_VALUE);
      for (const mesh of casters) {
        if (!mesh) continue;
        const box = mesh.getBoundingInfo().boundingBox;
        const world = box.getWorldMatrix().m;
        if (
          m[3] !== 0 ||
          m[7] !== 0 ||
          m[11] !== 0 ||
          m[15] !== 1 ||
          world[3] !== 0 ||
          world[7] !== 0 ||
          world[11] !== 0 ||
          world[15] !== 1
        ) {
          for (const corner of box.vectorsWorld) {
            Vector3.TransformCoordinatesToRef(corner, view, point);
            if (point.x < low[0]) low[0] = point.x;
            if (point.y < low[1]) low[1] = point.y;
            if (point.z < low[2]) low[2] = point.z;
            if (point.x > high[0]) high[0] = point.x;
            if (point.y > high[1]) high[1] = point.y;
            if (point.z > high[2]) high[2] = point.z;
          }
          continue;
        }
        const c = box.centerWorld;
        const e = box.extendSize;
        const [x, y, z] = box.directions as [Vector3, Vector3, Vector3];
        for (let axis = 0; axis < 3; axis++) {
          const a = m[axis] as number;
          const b = m[axis + 4] as number;
          const d = m[axis + 8] as number;
          const centre = c.x * a + c.y * b + c.z * d + (m[axis + 12] as number);
          const extent =
            Math.abs(x.x * a + x.y * b + x.z * d) * e.x +
            Math.abs(y.x * a + y.y * b + y.z * d) * e.y +
            Math.abs(z.x * a + z.y * b + z.z * d) * e.z;
          low[axis] = Math.min(low[axis] as number, centre - extent);
          high[axis] = Math.max(high[axis] as number, centre + extent);
        }
      }
      if (light.autoCalcShadowZBounds) {
        light.shadowMinZ = low[2];
        light.shadowMaxZ = high[2];
      }
      fitted = low[0] !== Number.MAX_VALUE;
    }
    const minZ = light.shadowMinZ ?? (camera?.minZ || 0);
    const maxZ = light.shadowMaxZ ?? (camera?.maxZ || 10000);
    const left = low[0] as number;
    const right = high[0] as number;
    const bottom = low[1] as number;
    const top = high[1] as number;
    const dx = (right - left) * light.shadowOrthoScale;
    const dy = (top - bottom) * light.shadowOrthoScale;
    Matrix.OrthoOffCenterLHToRef(
      left - dx,
      right + dx,
      bottom - dy,
      top + dy,
      engine.useReverseDepthBuffer ? maxZ : minZ,
      engine.useReverseDepthBuffer ? minZ : maxZ,
      result,
      engine.isNDCHalfZRange,
    );
  };
  light.customProjectionMatrixBuilder = builder;
  return () => {
    if (light.customProjectionMatrixBuilder === builder)
      light.customProjectionMatrixBuilder = previous;
  };
}
