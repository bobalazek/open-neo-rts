import { glbWriter } from "../../cli/src/glb-writer";

/** Synthetic geometry makes LOD and health switches independently visible in the browser. */
export function contentToolsFixture(paired = true) {
  const out = glbWriter();
  const high = out.accessor(
    new Float32Array([-1, 0, 0, 1, 0, 0, -1, 2, 0, -1, 2, 0, 1, 0, 0, 1, 2, 0]),
    "VEC3",
    { min: [-1, 0, 0], max: [1, 2, 0] },
  );
  const low = out.accessor(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]), "VEC3", {
    min: [-1, 0, 0],
    max: [1, 1, 0],
  });
  const time = out.accessor(new Float32Array([0, 1]), "SCALAR", { min: [0], max: [1] });
  const movement = out.accessor(new Float32Array([0, 0, 0, 1, 0, 0]), "VEC3");
  return out.encode({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "root", children: [1, 2, 4, 5] },
      { name: paired ? "body_LOD0" : "hull", mesh: 0, children: [3] },
      { name: "body_LOD1", mesh: 1 },
      { name: "state_damaged", mesh: 1, translation: [1.5, 0, 0] },
      { name: "state_critical", mesh: 1, translation: [-1.5, 0, 0] },
      { name: "socket_muzzle" },
    ],
    materials: [{ name: "team", doubleSided: true }],
    meshes: [
      { primitives: [{ attributes: { POSITION: high }, material: 0 }] },
      { primitives: [{ attributes: { POSITION: low }, material: 0 }] },
    ],
    animations: [
      {
        name: "move",
        samplers: [{ input: time, output: movement }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      },
    ],
  });
}
