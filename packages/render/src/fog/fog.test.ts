import { expect, test } from "bun:test";
import { NullEngine, PBRMaterial, Scene, StandardMaterial } from "@babylonjs/core";
import type { VisionGrid } from "@open-neo-rts/sim";
import { createFogPresentation } from ".";

const grid = (group = 1): VisionGrid => ({
  group,
  width: 2,
  height: 2,
  cells: new Uint8Array([0, 1, 2, 0]),
});

test("fog owns a copied union mask, replaces GPU textures on group switches, and leaves explicit debug unmasked", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const ground = new StandardMaterial("ground", scene);
  const owner = createFogPresentation(scene, 2, 2);
  // Babylon's material plugin manager keeps its own material-lifetime disposal hook.
  const disposalHooks = ground.onDisposeObservable.observers.length - 1;
  scene.removeMaterial(ground);
  scene.addMaterial(ground);
  owner.accept({ mode: "debug-no-fog" });
  expect(scene.textures.filter((texture) => texture.name === "seat fog")).toHaveLength(0);
  const first = grid(),
    second = grid(2);
  second.cells.set([1, 0, 0, 2]);
  owner.accept({ mode: "controlled", fog: [first, second] });
  const texture = scene.textures[0];
  expect(texture?.name).toBe("seat fog");
  const plugin = ground.pluginManager?.getPlugin("SeatFog");
  expect(plugin).toBeDefined();
  // RawTexture retains the upload buffer on the null engine; never the input grid storage.
  const buffer = texture?.getInternalTexture()?._bufferView as Uint8Array;
  expect([...buffer]).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 255, 255, 255, 0, 255]);
  first.cells.fill(2);
  expect(buffer[1]).toBe(0);
  owner.accept({ mode: "controlled", fog: [grid()] });
  expect(scene.textures).toHaveLength(1);
  expect(scene.textures[0]).not.toBe(texture);
  const pbr = new PBRMaterial("new model", scene);
  expect(pbr.pluginManager?.getPlugin("SeatFog")).toBeDefined();
  owner.accept({ mode: "debug-no-fog" });
  expect(scene.textures.filter((texture) => texture.name === "seat fog")).toHaveLength(0);
  owner.dispose();
  expect(ground.onDisposeObservable.observers).toHaveLength(disposalHooks);
  const replacement = createFogPresentation(scene, 2, 2);
  replacement.accept({ mode: "controlled", fog: [] });
  expect(scene.textures.filter((texture) => texture.name === "seat fog")).toHaveLength(1);
  replacement.dispose();
  expect(scene.textures.filter((texture) => texture.name === "seat fog")).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});

test("fog rejects mismatched layouts and never relies on a smoothed shroud classification", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const ground = new StandardMaterial("ground", scene);
  const owner = createFogPresentation(scene, 2, 2);
  for (const grids of [
    [{ ...grid(), width: 3 }],
    [grid(), grid()],
    [{ ...grid(), cells: new Uint8Array([0, 1, 3, 0]) }],
  ])
    expect(() => owner.accept({ mode: "controlled", fog: grids })).toThrow("Invalid projected fog");
  const plugin = ground.pluginManager?.getPlugin("SeatFog");
  const glsl = plugin?.getCustomCode("fragment", 0)?.CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR;
  const wgsl = plugin?.getCustomCode("fragment", 1)?.CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR;
  expect(glsl).toContain("floor(fogCell)");
  expect(glsl).toContain("fogKnown < 0.5");
  expect(wgsl).toContain("floor(fogCell)");
  expect(wgsl).toContain("fogKnown < 0.5");
  owner.dispose();
  scene.dispose();
  engine.dispose();
});
