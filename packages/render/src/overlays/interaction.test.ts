import { expect, test } from "bun:test";
import { MeshBuilder, NullEngine, Scene } from "@babylonjs/core";
import { createInteractionOutline } from "./interaction";

test("native interaction selection isolates one instance, clears and releases its layer", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const source = MeshBuilder.CreateBox("source", {}, scene);
  source.isVisible = false;
  const first = source.createInstance("first"),
    peer = source.createInstance("peer");
  const feedback = createInteractionOutline(scene);
  try {
    feedback.update([[first], [first]]);
    const native = scene.getSelectionOutlineLayerByName("world interaction");
    expect(native?.hasMesh(first)).toBe(true);
    expect(native?.hasMesh(peer)).toBe(false);
    feedback.update([]);
    expect(native?.hasMesh(first)).toBe(false);
    feedback.dispose();
    expect(scene.getSelectionOutlineLayerByName("world interaction")).toBeNull();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
