// Cross-engine determinism: run modules in each browser and compare with the goldens Bun is held to.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { GOLDEN } from "../../../packages/deterministic/src/golden";

/** Bundle a TypeScript module with Bun, import it into the page and return what its export `fn()` returns. */
async function runInBrowser(page: Page, entry: string, fn: string): Promise<unknown> {
  const path = fileURLToPath(new URL(entry, import.meta.url));
  const code = execFileSync("bun", ["build", path, "--target=browser", "--format=esm"], {
    encoding: "utf8",
  });
  return page.evaluate(
    async ({ code, fn }) => {
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      const module = await import(url);
      return module[fn]();
    },
    { code, fn },
  );
}

test("packages/deterministic matches its golden digests", async ({ page }) => {
  expect(
    await runInBrowser(page, "../../../packages/deterministic/src/golden.ts", "golden"),
  ).toEqual(GOLDEN);
});
