// Isolated renderer for the real worker/HUD mode journey; never bundled into the app.
import { createMatchPresentation } from "../../../packages/client/src/features/match";
import { parseTerrain } from "../../../packages/content/src";
import { createRenderer } from "../../../packages/render/src";
import type { SeatSnapshot } from "../../../packages/sim/src";

export async function start(canvas: HTMLCanvasElement, snapshot: SeatSnapshot) {
  // Flat presentation ground isolates the original models; the worker retains Training Grounds.
  const terrain = parseTerrain(128, 128, {});
  const renderer = await createRenderer(canvas, { terrain, quality: "low" });
  const presentation = createMatchPresentation(renderer.scene, terrain, async (definition) => {
    const name = definition.split("/").at(-1);
    const response = await fetch(`/${name}.glb`);
    if (!response.ok) throw new Error(`Missing original model ${name}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), movementDomain: "tracked" };
  });
  const vehicles = (snapshot: SeatSnapshot) => ({
    ...snapshot,
    entities: snapshot.entities.filter((row) => row.force === 0 && row.deploy),
  });
  const rows = vehicles(snapshot).entities;
  renderer.camera.setTarget(
    renderer.camera
      .getTarget()
      .clone()
      .set(
        (rows.reduce((sum, row) => sum + row.x, 0) * 2) / (1024 * rows.length),
        0.8,
        (rows.reduce((sum, row) => sum + row.y, 0) * 2) / (1024 * rows.length),
      ),
  );
  renderer.scene.onBeforeRenderObservable.add(() => {
    renderer.camera.radius = 12;
    renderer.camera.beta = 0.9;
  });
  presentation.setForceColor(0, "#d8443a");
  await presentation.accept(vehicles(snapshot), 0);
  const render = (time: number) => {
    presentation.render(time);
    renderer.scene.render();
  };
  render(0);
  await renderer.scene.whenReadyAsync();
  return {
    async accept(snapshot: SeatSnapshot, time: number) {
      await presentation.accept(vehicles(snapshot), time);
      render(time);
    },
    render,
    poses() {
      return rows.map(({ handle, definition }) => {
        const root = renderer.scene.getTransformNodeByName(`entity ${handle}`);
        const chassis = root
          ?.getChildTransformNodes()
          .find((node) => node.name === "deploy_chassis");
        if (!chassis) throw new Error("Original deployment rig missing");
        return { definition, y: chassis.position.y };
      });
    },
    dispose() {
      presentation.dispose();
      renderer.dispose();
    },
  };
}
