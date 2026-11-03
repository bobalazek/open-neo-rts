// Real worker snapshots and original reactor; flat visual ground/close camera isolate assembly.
import reactor from "../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json" with {
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
    const response = await fetch("/industrial-reactor.glb");
    if (!response.ok) throw new Error("Original reactor missing");
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      movementDomain: null,
      footprint: reactor.footprint as [number, number],
      foundation: true,
    };
  });
  renderer.camera.setTarget(renderer.camera.getTarget().clone().set(49, 1, 39));
  renderer.scene.onBeforeRenderObservable.add(() => {
    renderer.camera.radius = 18;
    renderer.camera.beta = 0.9;
  });
  presentation.setForceColor(0, "#d8443a");
  return {
    backend: renderer.engine.getClassName(),
    async accept(snapshot: SeatSnapshot) {
      const rows = snapshot.entities.filter(
        (row) => row.force === 0 && row.definition.endsWith("/industrial-reactor"),
      );
      await presentation.accept({ ...snapshot, entities: rows }, snapshot.tick * 50);
      presentation.render(snapshot.tick * 50);
      renderer.scene.render();
      await renderer.scene.whenReadyAsync();
      renderer.scene.render();
      return rows.map((row) => {
        const root = renderer.scene.getTransformNodeByName(`entity ${row.handle}`)!;
        const meshes = root.getChildMeshes();
        const mesh = meshes.find((mesh) => mesh.instancedBuffers?.instanceAssembly);
        return {
          handle: row.handle,
          stage: row.constructionStage,
          plane: mesh?.instancedBuffers.instanceAssembly.asArray() as number[],
          scaffold: meshes.some((mesh) => mesh.name === "construction scaffold"),
        };
      });
    },
    dispose() {
      presentation.dispose();
      renderer.dispose();
    },
  };
}
