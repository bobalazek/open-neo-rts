import { expect, test } from "bun:test";
import {
  ArcRotateCamera,
  type DirectionalLight,
  Matrix,
  MeshBuilder,
  NullEngine,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createScene } from ".";
import { installAffineShadowFit } from "./affine-shadow-fit";

test("affine caster fitting matches all eight reference corners across live transforms and depth modes", () => {
  const engine = new NullEngine();
  const scene = createScene(engine);
  new ArcRotateCamera("test", 1, 1, 60, Vector3.Zero(), scene);
  const light = scene.getLightByName("sun") as DirectionalLight;
  light.autoCalcShadowZBounds = true;
  const parent = new TransformNode("sheared parent", scene);
  parent.setPreTransformMatrix(
    Matrix.FromValues(1, 0.2, 0, 0, 0, 1, 0.3, 0, 0.4, 0, 1, 0, 0, 0, 0, 1),
  );
  const box = MeshBuilder.CreateBox(
    "rotated/sheared/reflected",
    { width: 4, height: 3, depth: 2 },
    scene,
  );
  box.parent = parent;
  const tall = MeshBuilder.CreateBox("new tall caster", { height: 80 }, scene);
  const view = Matrix.LookAtLH(new Vector3(3, 17, -9), new Vector3(0, 0, 0), Vector3.Up());
  const restore = installAffineShadowFit(light);
  const builder = light.customProjectionMatrixBuilder;
  if (typeof builder !== "function") throw new Error("Missing affine fit");
  const reference = (casters: (typeof box)[], matrix = view) => {
    Reflect.set(light, "customProjectionMatrixBuilder", undefined);
    try {
      const expected = Matrix.Identity();
      light.setShadowProjectionMatrix(expected, matrix, casters);
      return expected;
    } finally {
      light.customProjectionMatrixBuilder = builder;
    }
  };
  try {
    for (const halfZ of [false, true])
      for (const reverse of [false, true]) {
        Object.defineProperty(engine, "isNDCHalfZRange", { configurable: true, value: halfZ });
        Object.defineProperty(engine, "useReverseDepthBuffer", {
          configurable: true,
          value: reverse,
        });
        for (let i = 0; i < 6; i++) {
          box.position.set(23 * i - 50, i, 40 - 17 * i);
          box.rotation.set(i * 0.2, i * 0.7, i * 0.3);
          box.scaling.set(i % 2 ? -1.7 : 0.25, i + 0.3, 2);
          tall.position.set(120 - i * 25, 40, -120 + i * 11);
          tall.rotation.z = i * 0.1;
          parent.computeWorldMatrix(true);
          box.computeWorldMatrix(true);
          tall.computeWorldMatrix(true);
          const casters = i < 2 ? [box] : [box, tall];
          light.autoUpdateExtends = true;
          const expected = reference(casters);
          const actual = Matrix.Identity();
          light.setShadowProjectionMatrix(actual, view, casters);
          for (let n = 0; n < 16; n++) expect(actual.m[n]).toBeCloseTo(expected.m[n] as number, 6);
          const transform = view.multiply(actual);
          for (const mesh of casters)
            for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
              const p = Vector3.TransformCoordinates(corner, transform);
              expect(Math.abs(p.x)).toBeLessThanOrEqual(1.00001);
              expect(Math.abs(p.y)).toBeLessThanOrEqual(1.00001);
              expect(p.z).toBeGreaterThanOrEqual(halfZ ? -0.00001 : -1.00001);
              expect(p.z).toBeLessThanOrEqual(1.00001);
            }
          light.autoUpdateExtends = false;
          box.position.x += 200;
          box.computeWorldMatrix(true);
          const receiver = Matrix.Identity();
          light.setShadowProjectionMatrix(receiver, view, casters);
          expect(receiver.equals(actual)).toBe(true);
        }
      }
    light.autoUpdateExtends = true;
    light.shadowFrustumSize = 90;
    const fixed = Matrix.Identity();
    const expectedFixed = reference([box, tall]);
    light.setShadowProjectionMatrix(fixed, view, [box, tall]);
    expect(fixed.equals(expectedFixed)).toBe(true);
    light.shadowFrustumSize = 0;
    const projective = view.clone();
    projective.setRowFromFloats(0, 1, 0, 0, 0.001);
    const expectedProjective = reference([box, tall], projective);
    const actualProjective = Matrix.Identity();
    light.setShadowProjectionMatrix(actualProjective, projective, [box, tall]);
    expect(actualProjective.equals(expectedProjective)).toBe(true);
    restore();
    expect(light.customProjectionMatrixBuilder).toBeUndefined();
    light.autoUpdateExtends = false;
    installAffineShadowFit(light)();
    expect(light.customProjectionMatrixBuilder).toBeUndefined();
    const custom = () => {};
    light.customProjectionMatrixBuilder = custom;
    installAffineShadowFit(light)();
    expect(light.customProjectionMatrixBuilder).toBe(custom);
  } finally {
    restore();
    scene.dispose();
    engine.dispose();
  }
});
