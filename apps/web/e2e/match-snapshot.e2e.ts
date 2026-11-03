import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { type MatchSetup, parseMatchSnapshot, verifyMatchRecord } from "../../../packages/sim/src";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const worker = execFileSync(
  "bun",
  ["build", "packages/client/src/worker/entry.ts", "--target=browser"],
  { cwd: root, encoding: "utf8" },
);
const client = execFileSync(
  "bun",
  ["build", "packages/client/src/worker/index.ts", "--target=browser"],
  { cwd: root, encoding: "utf8" },
);
const setup: MatchSetup = JSON.parse(
  execFileSync(
    "bun",
    [
      "-e",
      `
import { aiMatchScenario } from "./apps/cli/src/commands/ai-vs-ai.ts";
const scenario = JSON.parse(JSON.stringify(await aiMatchScenario(12)));
scenario.setup.normal.bots = scenario.setup.normal.bots.filter(bot => bot.seat !== 1);
process.stdout.write(JSON.stringify(scenario.setup));
`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ),
);

test("original skirmish saves and resumes in a fresh worker with fog, bot work and complete replay", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://match-snapshot.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/sim-worker.js"
          ? worker
          : path === "/client.js"
            ? client
            : "<!doctype html><title>Local match save</title>",
    });
  });
  await page.goto("http://match-snapshot.test/");
  const result = await page.evaluate(async (setup) => {
    const url = "/client.js";
    const { createOfflineMatch } = (await import(
      /* @vite-ignore */ url
    )) as typeof import("../../../packages/client/src/worker");
    let originalState: {
      snapshot: { entities: { definition: string; force: number; handle: string }[] };
    };
    const original = createOfflineMatch((state) => {
      originalState = state;
    });
    const resumed = createOfflineMatch(() => {});
    const invalid = createOfflineMatch(() => {});
    try {
      await original.init({ setup, seat: 1, mode: "controlled" });
      const soldiers = originalState!.snapshot.entities
        .filter((entity) => entity.force === 0 && entity.definition.endsWith("/collective-soldier"))
        .map((entity) => entity.handle);
      const order = original.command("unit.move", {
        entities: soldiers,
        x: 20 * 1024 + 512,
        y: 20 * 1024 + 512,
      });
      let pendingRefused = false;
      try {
        await original.exportMatchSnapshot();
      } catch {
        pendingRefused = true;
      }
      await original.step();
      await order;
      for (let i = 0; i < 119; i++) await original.step();
      const saved = await original.exportMatchSnapshot();
      let corruptRefused = false;
      try {
        await invalid.init({
          setup,
          seat: 1,
          mode: "controlled",
          savedMatch: { ...saved, hash: "0000000000000000" },
        });
      } catch {
        corruptRefused = true;
      }
      await resumed.init({
        setup,
        seat: 1,
        mode: "controlled",
        savedMatch: JSON.parse(JSON.stringify(saved)),
      });
      const restored = await resumed.exportMatchSnapshot();
      for (let i = 0; i < 60; i++) {
        await original.step();
        await resumed.step();
      }
      const continued = [
        await original.exportMatchSnapshot(),
        await resumed.exportMatchSnapshot(),
      ] as const;
      const surrender = resumed.command("match.surrender", { force: 0 });
      await resumed.step();
      await surrender;
      return {
        pendingRefused,
        corruptRefused,
        saved,
        restored,
        continued,
        record: await resumed.exportMatchRecord(),
      };
    } finally {
      original.dispose();
      resumed.dispose();
      invalid.dispose();
    }
  }, setup);
  expect(result.pendingRefused).toBe(true);
  expect(result.corruptRefused).toBe(true);
  const saved = parseMatchSnapshot(result.saved);
  expect(saved.tick).toBe(120);
  expect(result.restored.hash).toBe(saved.hash);
  expect(result.continued[0].hash).toBe(result.continued[1].hash);
  expect(result.continued[1].tick).toBe(180);
  expect(verifyMatchRecord(result.record).hash).toBe(result.record.hash);
  expect(errors).toEqual([]);
  writeFileSync(info.outputPath("match-snapshot.json"), JSON.stringify(result.saved));
  writeFileSync(info.outputPath("resumed.record.json"), JSON.stringify(result.record));
});
