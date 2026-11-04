import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAssets } from "./validate-assets";

test("asset command reports malformed metadata and ignores declared editable-source manifests", async () => {
  const root = mkdtempSync(join(tmpdir(), "neo-provenance-"));
  try {
    mkdirSync(join(root, "source"));
    writeFileSync(join(root, "source/assets.json"), "not runtime JSON");
    writeFileSync(join(root, "assets.json"), '{"files":{}}');
    expect(await validateAssets([root])).toBe(0);
    writeFileSync(join(root, "assets.json"), "not JSON");
    expect(await validateAssets([root])).toBe(1);
    writeFileSync(
      join(root, "assets.json"),
      '{"files":{"missing.png":{"author":" ","source":"fixture"}}}',
    );
    expect(await validateAssets([root])).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
