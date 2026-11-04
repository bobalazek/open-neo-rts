import { expect, test } from "bun:test";
import { parseGlb } from "./glb";
import { validateAssetGlb } from "./validate-glb";
import { validateModel } from "./validate-model";

function glb(value: unknown) {
  const json = JSON.stringify(value);
  const padded = json.padEnd(Math.ceil(json.length / 4) * 4, " ");
  const bytes = new Uint8Array(20 + padded.length + 8 + 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, padded.length, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.set(new TextEncoder().encode(padded), 20);
  header.setUint32(20 + padded.length, 4, true);
  header.setUint32(24 + padded.length, 0x004e4942, true);
  return bytes;
}

test("asset validation checks binary bounds beyond the model JSON rules", async () => {
  const bytes = glb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 4 }],
    bufferViews: [{ buffer: 0, byteOffset: 4, byteLength: 4 }],
  });
  expect(validateModel(parseGlb(bytes), "prop")).toEqual([]);
  expect(await validateAssetGlb(bytes, "props/fixture.glb")).toContainEqual({
    level: "error",
    message: expect.stringMatching(/^glTF: .*buffer.*length/i),
  });
});

test("referenced models retain their authored material mappings", async () => {
  const bytes = glb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 4 }],
    materials: [{ name: "artist_material" }],
  });
  expect(
    await validateAssetGlb(bytes, "fixture.glb", {
      kind: "prop",
      requires: { materials: { artist_material: "metal" } },
    }),
  ).toEqual([]);
  expect(await validateAssetGlb(bytes, "fixture.glb")).toContainEqual({
    level: "error",
    message: expect.stringContaining("unknown slot"),
  });
});
