// Cross-engine determinism: run modules in each browser and compare with the goldens Bun is held to.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { GOLDEN } from "../../../packages/deterministic/src/golden";
import scenarioGolden from "../../cli/scenarios/__golden__/eastern-collective-two-forces.json" with {
  type: "json",
};

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

test("the two-Force 10,000-tick scenario matches all goldens twice", async ({ page }, testInfo) => {
  const entry = "../../cli/scenarios/check-eastern-collective-two-forces.ts";
  const actual = await runInBrowser(page, entry, "scenarioGoldens");
  const expected = [scenarioGolden, scenarioGolden];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const traces = await runInBrowser(page, entry, "scenarioTraces");
    if (!Array.isArray(traces)) throw new Error("Browser trace helper must return two traces");
    for (const [i, trace] of traces.entries()) {
      const name = `browser-${i + 1}.trace.json`;
      const path = testInfo.outputPath(name);
      await writeFile(path, JSON.stringify(trace));
      await testInfo.attach(name, { path, contentType: "application/json" });
    }
    const baseline = testInfo.outputPath("bun.trace.json");
    execFileSync("bun", [
      fileURLToPath(new URL("../../cli/src/index.ts", import.meta.url)),
      "run",
      fileURLToPath(
        new URL("../../cli/scenarios/eastern-collective-two-forces.json", import.meta.url),
      ),
      "--ticks",
      "10000",
      "--trace",
      baseline,
    ]);
    await testInfo.attach("bun.trace.json", { path: baseline, contentType: "application/json" });
  }
  expect(actual).toEqual(expected);
});
