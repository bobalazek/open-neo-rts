// Original Barracks and actual worker snapshots; flat ground and close camera isolate door playback.
import barracks from "../../../content/core/factions/eastern-collective/structures/barracks-complex/structure.json" with {
  type: "json",
};
import { createMatchPresentation } from "../../../packages/client/src/features/match";
import { parseTerrain } from "../../../packages/content/src";
import { createRenderer } from "../../../packages/render/src";
import type { SeatSnapshot } from "../../../packages/sim/src";

export async function start(canvas: HTMLCanvasElement) {
  const terrain = parseTerrain(128, 128, {});
  const renderer = await createRenderer(canvas, { terrain, quality: "low" });
  const presentation = createMatchPresentation(renderer.scene, terrain, async () => {
    const response = await fetch("/barracks-complex.glb");
    if (!response.ok) throw new Error("Original Barracks missing");
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      movementDomain: null,
      footprint: barracks.footprint as [number, number],
      foundation: true,
    };
  });
  renderer.camera.setTarget(renderer.camera.getTarget().clone().set(47, 1, 38));
  renderer.scene.onBeforeRenderObservable.add(() => {
    renderer.camera.radius = 12;
    renderer.camera.beta = 0.9;
  });
  presentation.setForceColor(0, "#d8443a");
  const poses = () =>
    renderer.scene.transformNodes
      .filter((root) => root.name.startsWith("entity "))
      .map((root) => ({
        handle: root.name.slice(7),
        left: root.getChildTransformNodes().find((node) => node.name === "door_l")!.position.y,
        right: root.getChildTransformNodes().find((node) => node.name === "door_r")!.position.y,
      }));
  const render = (time: number) => {
    presentation.render(time);
    renderer.scene.render();
    return poses();
  };
  return {
    backend: renderer.engine.isWebGPU ? "webgpu" : "webgl",
    async accept(snapshot: SeatSnapshot, time: number) {
      const entities = snapshot.entities.filter(
        (row) => row.force === 0 && row.definition.endsWith("/barracks-complex"),
      );
      await presentation.accept(
        {
          ...snapshot,
          entities,
          productionExits: snapshot.productionExits?.filter((handle) =>
            entities.some((row) => row.handle === handle),
          ),
        },
        time,
      );
      render(time);
      await renderer.scene.whenReadyAsync();
      return render(time);
    },
    render,
    dispose() {
      presentation.dispose();
      renderer.dispose();
    },
  };
}
