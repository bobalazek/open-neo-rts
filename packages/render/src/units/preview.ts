import { AbstractMesh, ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { createEngine, createScene } from "../scene";
import { loadModel } from ".";
import { createModelLod, MODEL_LOD_DISTANCE } from "./lod";
import { createModelActions, type ModelPreviewAssets } from "./preview-actions";
import { createSocketPreview, type SocketNode } from "./preview-sockets";

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
  let wreck: Awaited<ReturnType<typeof loadModel>> | undefined;
  let actions: ReturnType<typeof createModelActions> | undefined;
  let sockets: ReturnType<typeof createSocketPreview> | undefined;
  let wreckLod: ReturnType<typeof createModelLod>;
  let lod: ReturnType<typeof createModelLod>;
  let lodMode: "auto" | "0" | "1" = "auto";
  let health = 100;
  let lastFrame = performance.now();
  const render = () => {
    const now = performance.now();
    actions?.update(now - lastFrame);
    lastFrame = now;
    const distant = lodMode === "1" || (lodMode === "auto" && camera.radius >= MODEL_LOD_DISTANCE);
    lod?.setDistant(distant);
    wreckLod?.setDistant(distant);
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
        lastFrame = performance.now();
        resize();
        engine.runRenderLoop(render);
      }
    },
    cancelLoad: () => {
      request++;
    },
    async load(bytes: Uint8Array, teamColor: string, assets: ModelPreviewAssets = {}) {
      const ticket = ++request;
      const next = await loadModel(scene, bytes, assets.materials);
      if (ticket !== request) {
        next.dispose();
        return undefined;
      }
      let nextWreck: typeof wreck;
      let nextActions: typeof actions;
      try {
        next.setTeamColor(teamColor);
        // Hide staged art while its paired wreck loads; failed pairs retain the previous model.
        for (const node of next.nodes)
          if (!next.nodes.some((parent) => parent === node.parent)) node.setEnabled(false);
        if (assets.wreck) {
          nextWreck = await loadModel(scene, assets.wreck, assets.materials);
          nextWreck.setTeamColor(teamColor);
        }
        if (ticket !== request) {
          next.dispose();
          nextWreck?.dispose();
          return undefined;
        }
        nextActions = createModelActions(scene, next, nextWreck, assets.weapons, assets.parts);
      } catch (error) {
        nextActions?.dispose();
        next.dispose();
        nextWreck?.dispose();
        throw error;
      }
      sockets?.dispose();
      sockets = undefined;
      actions?.dispose();
      current?.dispose();
      wreck?.dispose();
      current = next;
      wreck = nextWreck;
      actions = nextActions;
      actions.reset();
      wreckLod = wreck && createModelLod(wreck.nodes, wreck.meshes);
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
    canFire: () => actions?.canFire ?? false,
    parts: () => actions?.parts ?? [],
    partAngles: (name: string) => actions?.partAngles(name) ?? [0, 0, 0],
    selectPart: (name: string | undefined, changed?: () => void) =>
      actions?.selectPart(name, changed),
    posePart: (name: string, axis: number, degrees: number) =>
      actions?.posePart(name, axis, degrees),
    editSockets(specs: readonly SocketNode[], changed: () => void) {
      if (!current) throw new Error("No model loaded");
      sockets?.dispose();
      actions?.reset();
      current.play("");
      lodMode = "0";
      health = 100;
      lod?.setDistant(false);
      showHealth();
      sockets = createSocketPreview(scene, current.nodes, specs, changed);
      return sockets;
    },
    canDestroy: () => actions?.canDestroy ?? false,
    fire: () => actions?.fire(),
    destroy: () => actions?.destroy(),
    reset() {
      actions?.reset();
      showHealth();
    },
    setTeamColor: (hex: string) => actions?.setTeamColor(hex),
    play(name: string) {
      actions?.reset();
      current?.play(name);
    },
    setLod(mode: "auto" | "0" | "1") {
      if (!["auto", "0", "1"].includes(mode)) throw new RangeError("Invalid LOD");
      lodMode = mode;
      return !!lod;
    },
    setHealth(percent: number) {
      if (!Number.isFinite(percent) || percent < 0 || percent > 100)
        throw new RangeError("Invalid preview health");
      health = percent;
      actions?.reset();
      showHealth();
    },
    dispose() {
      request++;
      sockets?.dispose();
      actions?.dispose();
      current?.dispose();
      wreck?.dispose();
      window.removeEventListener("resize", resize);
      scene.dispose();
      engine.dispose();
    },
  };
}
