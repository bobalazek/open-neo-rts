import { expect, test } from "bun:test";
import { checkAssetProvenance, listAssetFiles } from "./provenance";

const folder = "pack/units/fixture/";
const file = folder + "fixture.glb";
const manifest = folder + "assets.json";
const credit = { author: "Fixture author", source: "apps/cli/source.ts" };

test("runtime coverage shares source boundaries and preserves project-wide source references", () => {
  const files = [file, manifest, folder + "source/original.ogg", folder + "source/assets.json"];
  expect(listAssetFiles(files)).toEqual({
    manifests: [manifest],
    exported: [manifest, file],
    runtime: [file],
  });
  expect(
    checkAssetProvenance(files, new Map([[manifest, { files: { "fixture.glb": credit } }]])),
  ).toEqual({ runtime: [file], issues: [] });
  expect(listAssetFiles(["source/pack/uncredited.ogg"]).runtime).toEqual([
    "source/pack/uncredited.ogg",
  ]);
});

test("uncredited runtime files and dangling or escaping entries are errors", () => {
  expect(checkAssetProvenance([file], new Map()).issues).toEqual([
    { level: "error", file, message: "no assets.json entry (author and source)" },
  ]);
  const input = new Map([
    [manifest, { files: { "gone.png": credit, "../elsewhere.glb": credit } }],
  ]);
  const result = checkAssetProvenance([manifest], input);
  expect(result.issues.map((issue) => issue.message)).toEqual([
    'invalid asset entry path "../elsewhere.glb"',
    'entry for missing file "gone.png"',
  ]);
});

test("asset metadata requires a files object and nonempty author and source without rewriting credits", () => {
  for (const value of [null, [], {}, { files: [] }])
    expect(checkAssetProvenance([manifest], new Map([[manifest, value]])).issues[0]?.message).toBe(
      "assets.json requires a files object",
    );
  for (const entry of [null, {}, { ...credit, author: " " }, { ...credit, source: "" }]) {
    const input = new Map([[manifest, { files: { "fixture.glb": entry } }]]);
    expect(checkAssetProvenance([manifest, file], input).issues[0]?.message).toBe(
      'entry "fixture.glb" requires nonempty author and source',
    );
    expect(input.get(manifest)?.files["fixture.glb"]).toBe(entry);
  }
});

test("reports are stable across input order, including root manifests and extra provenance fields", () => {
  const files = ["b.png", "a.webp", "assets.json"];
  const metadata = {
    files: {
      "a.webp": { ...credit, license: "fixture license", note: "Retained verbatim" },
      "b.png": credit,
    },
  };
  const json = new Map([["assets.json", metadata]]);
  expect(checkAssetProvenance(files, json)).toEqual(
    checkAssetProvenance([...files].reverse(), json),
  );
  expect(checkAssetProvenance(files, json).issues).toEqual([]);
  expect(files).toEqual(["b.png", "a.webp", "assets.json"]);
  expect(json.get("assets.json")).toBe(metadata);
});
