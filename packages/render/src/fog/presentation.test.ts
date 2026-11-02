import { expect, test } from "bun:test";
import { NullEngine, PBRMaterial, Scene } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import type { PresentedEntity, PresentedGhost, SeatSnapshot } from "@open-neo-rts/sim";
import { createMatchPresentation } from "../../../client/src/features/match";

const model = () =>
  Bun.file(
    new URL(
      "../../../../content/core/factions/eastern-collective/structures/industrial-reactor/industrial-reactor.glb",
      import.meta.url,
    ),
  ).bytes();
const entity: PresentedEntity = {
  handle: "e1",
  definition: "structure:fixture/reactor",
  force: 1,
  x: 4096,
  y: 4096,
  facing: 0x4000,
  health: 100,
  maxHealth: 200,
  order: null,
};
const ghost: PresentedGhost = { ...entity, handle: "g1", group: 1, seen: 0 };
const snapshot = (
  tick: number,
  entities: PresentedEntity[],
  ghosts: PresentedGhost[] = [],
  group = 1,
): SeatSnapshot => ({
  tick,
  mode: "controlled",
  entities,
  ghosts,
  fog: [{ group, width: 16, height: 16, cells: new Uint8Array(256).fill(1) }],
});

test("projected hidden entities lose meshes, animations and selection immediately; ghosts are gray, frozen and non-pickable", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const changes: string[][] = [];
  const layer = createMatchPresentation(
    scene,
    parseTerrain(16, 16, {}),
    async () => ({
      bytes: await model(),
      movementDomain: null,
      footprint: [2, 2],
      foundation: true,
    }),
    (handles) => changes.push([...handles]),
  );
  layer.setForceColor(1, "#ff0000");
  await layer.accept(snapshot(0, [entity]), 0);
  layer.select([entity.handle]);
  const original = scene.getTransformNodeByName("entity e1");
  expect(original).not.toBeNull();
  const leaving = layer.accept(snapshot(1, [], [ghost]), 50);
  expect(original?.isDisposed()).toBe(true);
  expect(layer.selection()).toEqual([]);
  expect(changes).toEqual([["e1"], []]);
  await leaving;
  const remembered = scene.getTransformNodeByName("entity ghost:g1");
  expect(remembered).not.toBeNull();
  const meshes = remembered?.getChildMeshes() ?? [];
  expect(meshes.every((mesh) => !mesh.isPickable)).toBe(true);
  for (const mesh of meshes)
    if (mesh.material instanceof PBRMaterial) {
      const color = mesh.material.albedoColor;
      expect(color.r).toBe(color.g);
      expect(color.g).toBe(color.b);
    }
  expect(scene.animationGroups.some((group) => group.isPlaying)).toBe(false);
  expect(scene.getMeshByName("selected entity")).toBeNull();
  layer.select(["g1", "ghost:g1", "e1"]);
  expect(layer.selection()).toEqual([]);
  expect(layer.inRectangle(0, 0, 2000, 2000)).toEqual([]);
  const texture = scene.getTextureByName("seat fog");
  await layer.accept(snapshot(2, [], [], 2), 100);
  expect(remembered?.isDisposed()).toBe(true);
  expect(scene.getTextureByName("seat fog")).not.toBe(texture);
  await layer.accept(snapshot(0, [entity]), 150);
  expect(scene.getTransformNodeByName("entity e1")).not.toBeNull();
  layer.dispose();
  expect(() => layer.reset()).toThrow("disposed");
  expect(scene.materials).toHaveLength(0);
  // Babylon's shared BRDF lookup belongs to the Scene, not an entity or fog owner.
  expect(
    scene.textures.every((texture) => texture.name.startsWith("data:EnvironmentBRDFTexture")),
  ).toBe(true);
  expect(scene.animationGroups).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});
