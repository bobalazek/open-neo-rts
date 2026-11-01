import { expect, spyOn, test } from "bun:test";
import {
  ArcRotateCamera,
  type DirectionalLight,
  InstancedMesh,
  MeshBuilder,
  NullEngine,
  type ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { parseTerrain, WATER } from "@open-neo-rts/content";
import { createTerrain } from "../terrain";
import { createMapPresentation } from "../terrain/objects";
import { createEntityPresentation } from "../units/presentation";
import { createScene } from ".";
import { createQuality } from "./quality";

test("presets replace resources and track async GLB instances without water, rings or stale casters", async () => {
  const engine = new NullEngine();
  const scaling = spyOn(engine, "setHardwareScalingLevel");
  const scene = createScene(engine);
  const camera = new ArcRotateCamera("test", 1, 1, 30, Vector3.Zero(), scene);
  const sun = scene.getLightByName("sun") as DirectionalLight;
  const grid = parseTerrain(8, 8, {});
  grid.water[0] = WATER.deep;
  const terrain = createTerrain(scene, grid);
  const ring = MeshBuilder.CreateTorus("selection ring", {}, scene);
  const quality = createQuality(scene, camera, sun);
  const casters = () =>
    (sun.getShadowGenerator() as ShadowGenerator).getShadowMap()?.renderList ?? [];
  const bytes = await Bun.file(
    new URL(
      "../../../../content/core/factions/eastern-collective/units/dragon-tank/dragon-tank.glb",
      import.meta.url,
    ),
  ).bytes();
  const units = createEntityPresentation(scene, grid, async () => ({
    bytes,
    movementDomain: "tracked",
  }));
  const props = createMapPresentation(
    scene,
    grid,
    [{ definition: "fixture", position: [4, 4], footprint: [1, 1] }],
    async () => bytes,
  );
  try {
    quality.setQuality("medium");
    expect(engine.getHardwareScalingLevel()).toBe(1);
    const first = (sun.getShadowGenerator() as ShadowGenerator).getShadowMap();
    expect(first?.getSize().width).toBe(1024);
    expect((sun.getShadowGenerator() as ShadowGenerator).bias).toBe(0.004);
    expect((sun.getShadowGenerator() as ShadowGenerator).normalBias).toBe(0.08);
    await props.ready;
    await units.accept(
      {
        tick: 0,
        mode: "debug-no-fog",
        entities: [
          {
            handle: "one",
            definition: "tank",
            force: 0,
            x: 1024,
            y: 1024,
            facing: 0,
            health: 100,
            maxHealth: 100,
            order: null,
          },
        ],
      },
      0,
    );
    const instances = casters().filter((mesh) => mesh instanceof InstancedMesh);
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.every((mesh) => mesh.receiveShadows)).toBe(true);
    expect(casters().some((mesh) => !mesh.isVisible)).toBe(false);
    expect(casters().some((mesh) => mesh.name.startsWith("water"))).toBe(false);
    expect(casters()).not.toContain(ring);
    quality.setQuality("low");
    expect(scaling).toHaveBeenLastCalledWith(4 / 3);
    expect(sun.getShadowGenerator()).toBeNull();
    expect(first?.getInternalTexture()).toBeNull();
    expect(scene.meshes.filter((mesh) => mesh.name === "blob shadow")).toHaveLength(2);
    quality.setQuality("high");
    expect(engine.getHardwareScalingLevel()).toBe(1);
    expect((sun.getShadowGenerator() as ShadowGenerator).getShadowMap()?.getSize().width).toBe(
      2048,
    );
    expect(scene.meshes.some((mesh) => mesh.name === "blob shadow")).toBe(false);
    expect((sun.getShadowGenerator() as ShadowGenerator).bias).toBe(0.001);
    expect((sun.getShadowGenerator() as ShadowGenerator).normalBias).toBe(0.04);
    expect(casters().filter((mesh) => mesh instanceof InstancedMesh)).toHaveLength(
      instances.length,
    );
    const high = (sun.getShadowGenerator() as ShadowGenerator).getShadowMap();
    quality.setQuality("ultra", true);
    expect(high?.getInternalTexture()).toBeNull();
    expect((sun.getShadowGenerator() as ShadowGenerator).mapSize).toBe(2048);
    expect(casters().filter((mesh) => mesh instanceof InstancedMesh)).toHaveLength(
      instances.length,
    );
    await units.accept({ tick: 1, mode: "debug-no-fog", entities: [] }, 50);
    props.dispose();
    expect(casters().every((mesh) => mesh.parent === terrain)).toBe(true);
    quality.setQuality("medium");
    quality.setQuality("low");
    expect(camera._postProcesses.filter(Boolean)).toHaveLength(0);
    expect(scene.postProcessRenderPipelineManager.supportedPipelines).toHaveLength(0);
    quality.dispose();
    quality.dispose();
    expect(engine.getHardwareScalingLevel()).toBe(1);
    expect(() => quality.setQuality("medium")).toThrow("disposed");
  } finally {
    props.dispose();
    units.dispose();
    quality.dispose();
    scene.dispose();
    engine.dispose();
  }
});
