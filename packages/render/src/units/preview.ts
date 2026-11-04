import { AbstractMesh, ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { createEngine, createScene } from "../scene";
import { loadModel } from ".";
import { createModelLod, MODEL_LOD_DISTANCE } from "./lod";

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
  let current: Awaited<ReturnType<typeof loadModel>> | undefined;
  let lod: ReturnType<typeof createModelLod>;
  let lodMode: "auto" | "0" | "1" = "auto";
  let health = 100;
  const render = () => {
    lod?.setDistant(lodMode === "1" || (lodMode === "auto" && camera.radius >= MODEL_LOD_DISTANCE));
    scene.render();
  };
  engine.runRenderLoop(render);
  const showHealth = () => {
    for (const node of current?.nodes ?? []) {
      if (node.name !== "state_damaged" && node.name !== "state_critical") continue;
      const visible = node.name === "state_critical" ? health < 33 : health < 66;
      node.setEnabled(visible);
    }
  };
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
    camera.upperRadiusLimit = Math.max((size * 5) / aspect, MODEL_LOD_DISTANCE * 2);
    camera.wheelPrecision = 25 / size;
  };
  const resize = () => {
    engine.resize();
    frame();
  };
  window.addEventListener("resize", resize);

  return {
    setPaused(paused: boolean) {
      if (paused) engine.stopRenderLoop(render);
      else {
        resize();
        engine.runRenderLoop(render);
      }
    },
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
      // Health uses enablement; establish visible state geometry before LOD owns its visibility mask.
      for (const node of next.nodes)
        if (node instanceof AbstractMesh && ["state_damaged", "state_critical"].includes(node.name))
          node.isVisible = true;
      lod = createModelLod(next.nodes, next.meshes);
      lod?.setDistant(lodMode === "1");
      showHealth();
      frame();
      return next.clips;
    },
    setTeamColor: (hex: string) => current?.setTeamColor(hex),
    play: (name: string) => current?.play(name),
    setLod(mode: "auto" | "0" | "1") {
      if (!["auto", "0", "1"].includes(mode)) throw new RangeError("Invalid LOD");
      lodMode = mode;
      return !!lod;
    },
    setHealth(percent: number) {
      if (!Number.isFinite(percent) || percent < 0 || percent > 100)
        throw new RangeError("Invalid preview health");
      health = percent;
      showHealth();
    },
    dispose() {
      request++;
      current?.dispose();
      window.removeEventListener("resize", resize);
      scene.dispose();
      engine.dispose();
    },
  };
}
