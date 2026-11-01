import { InstancedMesh, Mesh, type Scene, SceneInstrumentation } from "@babylonjs/core";

/** Observations of completed frames; never input to presentation or simulation. */
export function createRenderCounters(scene: Scene) {
  const instrumentation = new SceneInstrumentation(scene);
  let previous = 0;
  let frameMs = 0;
  let drawCalls = 0;
  const observer = scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    if (previous) frameMs = now - previous;
    previous = now;
    drawCalls = instrumentation.drawCallsCounter.current;
  });
  return {
    read() {
      let instances = 0;
      for (const mesh of scene.meshes) {
        if (mesh instanceof InstancedMesh) instances++;
        else if (mesh instanceof Mesh) instances += mesh.thinInstanceCount;
      }
      return { frameMs, fps: frameMs > 0 ? 1000 / frameMs : 0, drawCalls, instances };
    },
    dispose() {
      scene.onAfterRenderObservable.remove(observer);
      instrumentation.dispose();
    },
  };
}
