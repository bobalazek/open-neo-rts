import {
  Color3,
  RawTexture,
  type Scene,
  StandardMaterial,
  Texture,
  type TransformNode,
} from "@babylonjs/core";

/** Original tileable detail, shared by every water chunk; no downloaded textures or extra render loop. */
export function createWaterMaterials(scene: Scene, root: TransformNode) {
  const size = 64;
  const ripples = new Uint8Array(size * size * 4);
  const foam = new Uint8Array(ripples.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const wave = Math.sin(2 * u + v + 0.35 * Math.sin(u - v)) * Math.sin(u - 3 * v);
      const glint = Math.max(0, wave - 0.25) / 0.75;
      const i = (y * size + x) * 4;
      ripples.fill(Math.round(205 + glint * 50), i, i + 3);
      ripples[i + 3] = 255;
      foam.fill(255, i, i + 3);
      foam[i + 3] = Math.round(100 + 155 * Math.max(0, wave));
    }
  const texture = (name: string, data: Uint8Array) => {
    const result = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    result.name = name;
    result.wrapU = result.wrapV = Texture.WRAP_ADDRESSMODE;
    result.uScale = result.vScale = 0.25;
    return result;
  };
  const detail = texture("water ripples", ripples);
  const mask = texture("shore foam", foam);
  mask.hasAlpha = true;
  const water = new StandardMaterial("water", scene);
  water.alpha = 0.8;
  water.specularColor = new Color3(0.5, 0.5, 0.5);
  water.specularPower = 64;
  water.diffuseTexture = detail;
  const shore = new StandardMaterial("shore foam", scene);
  shore.disableLighting = true;
  shore.emissiveColor = new Color3(0.86, 0.95, 0.93);
  shore.linkEmissiveWithDiffuse = true;
  shore.diffuseTexture = mask;
  shore.useAlphaFromDiffuseTexture = true;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    detail.uOffset = (detail.uOffset + dt * 0.018) % 1;
    detail.vOffset = (detail.vOffset + dt * 0.009) % 1;
    mask.uOffset = (mask.uOffset - dt * 0.025) % 1;
    mask.vOffset = (mask.vOffset + dt * 0.012) % 1;
  });
  root.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(observer);
    water.dispose();
    shore.dispose();
    detail.dispose();
    mask.dispose();
  });
  return { water, shore };
}
