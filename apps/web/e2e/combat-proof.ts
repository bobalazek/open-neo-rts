// Isolated browser proof entry; bundled only by combat-presentation.e2e.ts, never the app.

import { createMatchPresentation } from "../../../packages/client/src/features/match";
import { parseTerrain } from "../../../packages/content/src";
import { createRenderer } from "../../../packages/render/src";
import type { SeatSnapshot } from "../../../packages/sim/src";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Proof canvas missing");
const grid = parseTerrain(32, 32, {});
const renderer = await createRenderer(canvas, { terrain: grid, quality: "low" });
renderer.camera.setTarget(renderer.camera.getTarget().clone().set(30, 0, 33));
// Close-up proof camera; the ordinary RTS controller keeps its own zoom goal.
renderer.scene.onBeforeRenderObservable.add(() => {
  renderer.camera.radius = 16;
  renderer.camera.beta = 0.9;
});
const presentation = createMatchPresentation(renderer.scene, grid, async () => {
  const response = await fetch("/proof-soldier.glb");
  if (!response.ok) throw new Error("Original proof model missing");
  return { bytes: new Uint8Array(await response.arrayBuffer()), movementDomain: "foot" };
});
presentation.setForceColor(0, "#da4b3e");
presentation.setForceColor(1, "#457bd1");
const proof = {
  async accept(snapshot: SeatSnapshot, time: number) {
    await presentation.accept(snapshot, time);
    presentation.render(time);
    renderer.scene.render();
  },
  render(time: number) {
    presentation.render(time);
    renderer.scene.render();
  },
  pause() {
    presentation.setPlaybackRate(0);
  },
  resume() {
    presentation.setPlaybackRate(1);
  },
  state() {
    return {
      effects: renderer.scene.meshes
        .filter((mesh) => mesh.name.startsWith("combat ") && mesh.isVisible)
        .map((mesh) => mesh.name),
      actors: renderer.scene.transformNodes
        .filter((node) => node.name.startsWith("entity "))
        .map((node) => node.name),
      clips: renderer.scene.animationGroups
        .filter((clip) => clip.isStarted)
        .map((clip) => ({ name: clip.name, frame: clip.getCurrentFrame() })),
      bars: renderer.scene.meshes.filter((mesh) => mesh.name === "projected status").length,
      labels: renderer.scene.meshes.filter((mesh) => mesh.name === "projected damage label").length,
    };
  },
  dispose() {
    presentation.dispose();
    renderer.dispose();
  },
};
Object.assign(window, { combatProof: proof });
