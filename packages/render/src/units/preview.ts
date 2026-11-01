import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { createEngine, createScene } from "../scene";
import { loadModel } from ".";

/** An isolated asset scene for checking colours and clips before the match client exists. */
export async function createModelPreview(canvas: HTMLCanvasElement) {
  const engine = await createEngine(canvas);
  const scene = createScene(engine);
  const camera = new ArcRotateCamera(
    "model preview",
    Math.PI / 3,
    Math.PI / 3,
    10,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.minZ = 0.01;
  engine.runRenderLoop(() => scene.render());
  let current: Awaited<ReturnType<typeof loadModel>> | undefined;
  let request = 0;
  const frame = () => {
    if (!current) return;
    const meshes = current.meshes;
    const bounds = scene.getWorldExtends(
      (mesh) => meshes.includes(mesh) && mesh.getTotalVertices() > 0,
    );
    camera.setTarget(Vector3.Center(bounds.min, bounds.max));
    const size = Math.max(0.1, bounds.max.subtract(bounds.min).length());
    const aspect = Math.min(1, engine.getRenderWidth() / engine.getRenderHeight());
    camera.radius = (size * 1.3) / aspect;
    camera.lowerRadiusLimit = size * 0.4;
    camera.upperRadiusLimit = (size * 5) / aspect;
    camera.wheelPrecision = 25 / size;
  };
  const resize = () => {
    engine.resize();
    frame();
  };
  window.addEventListener("resize", resize);

  return {
    cancelLoad: () => {
      request++;
    },
    async load(bytes: Uint8Array, teamColor: string) {
      const ticket = ++request;
      const next = await loadModel(scene, bytes);
      if (ticket !== request) {
        next.dispose();
        return undefined;
      }
      try {
        next.setTeamColor(teamColor);
      } catch (error) {
        next.dispose();
        throw error;
      }
      current?.dispose();
      current = next;
      frame();
      return next.clips;
    },
    setTeamColor: (hex: string) => current?.setTeamColor(hex),
    play: (name: string) => current?.play(name),
    dispose() {
      request++;
      current?.dispose();
      window.removeEventListener("resize", resize);
      scene.dispose();
      engine.dispose();
    },
  };
}
