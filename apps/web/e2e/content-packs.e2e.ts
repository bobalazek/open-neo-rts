import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { type PackInput, resolvePacks } from "../../../packages/content/src";

const prop = "props/temperate/tree/prop.json";
const bytes = new Map([["core/props/temperate/tree/tree.glb", new Uint8Array([0, 127, 255])]]);
const pack: PackInput = {
  id: "core",
  files: ["manifest.json", prop, "props/temperate/tree/tree.glb"],
  json: new Map<string, unknown>([
    [
      "manifest.json",
      {
        $schema: "../schemas/manifest.schema.json",
        id: "core",
        version: "0.1.0",
        engine: ">=0.1.0 <1.0.0",
        name: "Core",
        description: "Cross-runtime identity fixture",
        dependencies: {},
        files: { props: [prop] },
      },
    ],
    [
      prop,
      {
        $schema: "../../../../schemas/prop.schema.json",
        id: "prop:temperate/tree",
        name: "Tree",
        footprint: [1, 1],
        blocks: "movement",
        presentation: { model: "tree.glb", materials: {} },
      },
    ],
  ]),
};

test("content resolution and mismatch refusal agree in Bun and browser", async ({ page }) => {
  const expected = resolvePacks([pack], "0.1.0", { bytes });
  const code = execFileSync(
    "bun",
    [
      "build",
      fileURLToPath(new URL("../../../packages/content/src/loader/index.ts", import.meta.url)),
      "--target=browser",
      "--format=esm",
    ],
    { encoding: "utf8" },
  );
  const actual = await page.evaluate(
    async ({ code, pack, assetBytes, expectedHash }) => {
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      try {
        const { resolvePacks } = (await import(
          url
        )) as typeof import("../../../packages/content/src/loader");
        const input = { ...pack, json: new Map(pack.json) };
        const bytes = new Map(assetBytes.map(([file, bytes]) => [file, new Uint8Array(bytes)]));
        const catalog = resolvePacks([input], "0.1.0", {
          bytes,
          expectedGameplayHash: expectedHash,
        });
        let rejected = false;
        try {
          resolvePacks([input], "0.1.0", { bytes, expectedGameplayHash: "different" });
        } catch {
          rejected = true;
        }
        return {
          packs: catalog.packs,
          gameplayHash: catalog.gameplayHash,
          cosmeticHash: catalog.cosmeticHash,
          rejected,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    {
      code,
      pack: { ...pack, json: [...pack.json] },
      assetBytes: [...bytes].map(([file, bytes]): [string, number[]] => [file, [...bytes]]),
      expectedHash: expected.gameplayHash,
    },
  );
  expect(actual).toEqual({
    packs: expected.packs,
    gameplayHash: expected.gameplayHash,
    cosmeticHash: expected.cosmeticHash,
    rejected: true,
  });
});
