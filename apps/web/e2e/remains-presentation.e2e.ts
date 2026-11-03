import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { start } from "../../../packages/render/src/units/remains-proof";
import type { MatchSetup, SeatSnapshot } from "../../../packages/sim/src";

test("actual original combat remains render, pick and disappear with canonical loss of sight", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const fixture = JSON.parse(
    execFileSync("bun", ["apps/web/e2e/remains-snapshots.ts"], {
      cwd: resolve(import.meta.dirname, "../../.."),
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    }),
  ) as { terrain: MatchSetup["map"]["terrain"]; snapshots: SeatSnapshot[] };
  const directory = mkdtempSync(resolve(tmpdir(), "neo-remains-proof-"));
  const output = resolve(directory, "proof.js");
  execFileSync(
    "bun",
    [
      "build",
      "packages/render/src/units/remains-proof.ts",
      "--target=browser",
      "--outfile",
      output,
    ],
    { cwd: resolve(import.meta.dirname, "../../..") },
  );
  const script = readFileSync(output);
  await page.route("**/remains-proof", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<canvas width="960" height="640" style="width:960px;height:640px"></canvas>',
    }),
  );
  await page.route("**/remains-proof.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: script }),
  );
  for (const [file, folder] of [
    ["industrial-reactor.rubble", "structures/industrial-reactor"],
    ["supply-truck.wreck", "units/supply-truck"],
  ]) {
    const bytes = readFileSync(
      resolve(
        import.meta.dirname,
        `../../../content/core/factions/eastern-collective/${folder}/${file}.glb`,
      ),
    );
    await page.route(`**/${file}.glb`, (route) =>
      route.fulfill({ contentType: "model/gltf-binary", body: bytes }),
    );
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 980, height: 660 });
  await page.goto("/remains-proof");
  try {
    await page.evaluate(async (terrain) => {
      const url = "/remains-proof.js";
      const { start: open } = (await import(url)) as { start: typeof start };
      Object.assign(window, {
        remainsProof: await open(document.querySelector("canvas")!, terrain),
      });
    }, fixture.terrain);
    for (const [index, snapshot] of fixture.snapshots.entries()) {
      await page.evaluate(
        async ({ snapshot, time }) => {
          await Reflect.get(window, "remainsProof").accept(
            {
              ...snapshot,
              fog: snapshot.fog?.map((fog) => ({ ...fog, cells: Uint8Array.from(fog.cells) })),
            },
            time,
          );
        },
        { snapshot, time: index * 50 },
      );
      const state = await page.evaluate(() => Reflect.get(window, "remainsProof").state());
      await info.attach(`state-${index}`, {
        body: JSON.stringify(state),
        contentType: "application/json",
      });
      await page.locator("canvas").screenshot({ path: info.outputPath(`remains-${index}.png`) });
      expect(state.roots).toHaveLength(index === 0 ? 1 : index === 1 ? 2 : 0);
      if (index === 1) {
        const picked = await page.evaluate(() => Reflect.get(window, "remainsProof").pick());
        expect(picked).toHaveLength(2);
        for (const row of picked) {
          expect(row.picked).toBe(row.handle);
          expect(row.selected).toEqual([]);
        }
        await info.attach("renderer-backend", { body: state.backend, contentType: "text/plain" });
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => Reflect.get(window, "remainsProof")?.dispose());
    rmSync(directory, { recursive: true, force: true });
  }
});
