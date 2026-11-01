import { expect, test } from "bun:test";
import { Color3, NullEngine, PBRMaterial, Scene } from "@babylonjs/core";
import { loadModel, setTeamColor } from ".";

function morphGlb(external = false): Uint8Array {
  const data = new Float32Array([
    -1, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 1,
  ]);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "hull", mesh: 0 }],
    buffers: [
      {
        byteLength: data.byteLength,
        ...(external && { uri: "http://127.0.0.1:9/private-model-resource" }),
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 8 },
      { buffer: 0, byteOffset: 80, byteLength: 8 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        type: "VEC3",
        count: 3,
        min: [-1, 0, 0],
        max: [1, 2, 0],
      },
      { bufferView: 1, componentType: 5126, type: "VEC3", count: 3 },
      { bufferView: 2, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, type: "SCALAR", count: 2 },
    ],
    materials: [{ name: "team" }],
    meshes: [
      {
        weights: [0],
        primitives: [{ attributes: { POSITION: 0 }, material: 0, targets: [{ POSITION: 1 }] }],
      },
    ],
    animations: [
      {
        name: "move",
        samplers: [{ input: 2, output: 3 }],
        channels: [{ sampler: 0, target: { node: 0, path: "weights" } }],
      },
    ],
  });
  const body = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const bytes = new Uint8Array(28 + body.length + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(body, 20);
  view.setUint32(20 + body.length, data.byteLength, true);
  view.setUint32(24 + body.length, 0x004e4942, true);
  bytes.set(new Uint8Array(data.buffer), 28 + body.length);
  return bytes;
}

test("returning to rest restores morph weights as well as node transforms", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const model = await loadModel(scene, morphGlb());
    const target = model.meshes
      .find((mesh) => mesh.morphTargetManager)
      ?.morphTargetManager?.getTarget(0);
    expect(target?.influence).toBe(0);
    model.play("move");
    scene.animationGroups[0]?.goToFrame(60);
    expect(target?.influence).toBe(1);
    model.play("");
    expect(target?.influence).toBe(0);
    model.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("local GLBs cannot fetch resources from external URLs", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    await expect(loadModel(scene, morphGlb(true))).rejects.toThrow("self-contained GLB");
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("team recolouring preserves fixed materials and another model's colour", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const materials = [
      "team",
      "team_dark",
      "team_light",
      "team_emissive",
      "metal",
      "glass",
      "palette",
    ].map((name) => new PBRMaterial(name, scene));
    const other = new PBRMaterial("team", scene);
    const fixed = materials.slice(4).map((m) => m.albedoColor.clone());
    setTeamColor([other], "#ff0000");
    setTeamColor(materials, "#0080ff");
    expect(materials[0]?.albedoColor.equals(Color3.FromHexString("#0080ff").toLinearSpace())).toBe(
      true,
    );
    expect(
      materials[1]?.albedoColor.equals(Color3.FromHexString("#0080ff").scale(0.55).toLinearSpace()),
    ).toBe(true);
    expect(materials[2]?.albedoColor.b).toBe(1);
    expect(materials[3]?.emissiveColor.equals(materials[0]?.albedoColor ?? Color3.Black())).toBe(
      true,
    );
    expect(materials.slice(4).map((m) => m.albedoColor)).toEqual(fixed);
    expect(other.albedoColor.equals(new Color3(1, 0, 0))).toBe(true);
    const before = materials.map((m) => m.albedoColor.clone());
    expect(() => setTeamColor(materials, "blue")).toThrow("#RRGGBB");
    expect(materials.map((m) => m.albedoColor)).toEqual(before);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
