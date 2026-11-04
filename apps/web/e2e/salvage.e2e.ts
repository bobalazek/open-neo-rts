import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { type MatchSetup, parseMatchRecord, verifyMatchRecord } from "../../../packages/sim/src";
import type { start } from "./deploy-fixture";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = execFileSync(
  "bun",
  [
    "-e",
    `
  import plugin from "./apps/web/normal-catalog-plugin.ts";
  const result = await Bun.build({entrypoints:["./apps/web/e2e/deploy-fixture.ts"],target:"browser",plugins:[plugin]});
  if (!result.success) throw new Error(result.logs.join("\\n"));
  process.stdout.write(await result.outputs[0].text());
`,
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
const worker = execFileSync(
  "bun",
  ["build", "packages/client/src/worker/entry.ts", "--target=browser"],
  { cwd: root, encoding: "utf8" },
);
const original: MatchSetup = JSON.parse(
  execFileSync(
    "bun",
    [
      "-e",
      `
  import { aiMatchScenario } from "./apps/cli/src/commands/ai-vs-ai.ts";
  process.stdout.write(JSON.stringify((await aiMatchScenario(12)).setup));
`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ),
);
if (!original.normal) throw new Error("Missing normal setup");
// Test-only shared orders and no fog let one worker drive the enemy truck into real original weapons.
const setup: MatchSetup = {
  ...original,
  normal: { ...original.normal, bots: [], settings: { ...original.normal.settings, fog: "off" } },
  grants: [...original.grants, { seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
};

test("normal worker and HUD clear an original combat wreck, stop/resume, pay once and replay", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://salvage.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Builder salvage</title><canvas tabindex="0" width="400" height="200"></canvas>',
    });
  });
  await page.goto("http://salvage.test/");
  await page.evaluate(async (setup) => {
    const url = "/fixture.js";
    const { start } = (await import(url)) as { start: typeof import("./deploy-fixture").start };
    Object.assign(window, { salvageFixture: await start(setup) });
  }, setup);
  try {
    const death = await page.evaluate(async () => {
      const f = Reflect.get(window, "salvageFixture") as Awaited<ReturnType<typeof start>>;
      const rows = f.state()!.snapshot.entities;
      const base = rows.find(
        (row) => row.force === 0 && row.definition.endsWith("/command-center"),
      )!;
      const truck = rows.find(
        (row) => row.force === 1 && row.definition.endsWith("/supply-truck"),
      )!;
      const moved = await f.command("unit.move", {
        entities: [truck.handle],
        x: base.x + 512,
        y: base.y + 4 * 1024 + 512,
      });
      for (
        let tick = 0;
        tick < 12000 && f.state()!.snapshot.entities.some((row) => row.handle === truck.handle);
        tick++
      )
        await f.step(1);
      f.select(["core.unit:eastern-collective/field-technician"]);
      f.targetRemains("core.unit:eastern-collective/supply-truck");
      return {
        moved,
        remains: f.state()!.snapshot.remains,
        materials: f.state()!.snapshot.banks?.find((row) => row.force === 0)?.resources.materials,
      };
    });
    expect(death.moved).toBe("accepted");
    expect(death.remains?.some((row) => row.definition.endsWith("/supply-truck"))).toBe(true);
    await page.getByRole("button", { name: "Clear / salvage", exact: true }).click();
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    await expect(page.locator("[data-result]")).toHaveText(/accepted/i);
    const working = await page.evaluate(async () => {
      const f = Reflect.get(window, "salvageFixture") as Awaited<ReturnType<typeof start>>;
      for (
        let tick = 0;
        tick < 1500 &&
        !f.state()!.snapshot.entities.some((row) => row.salvageOrder?.state === "working");
        tick++
      )
        await f.step(1);
      return f.state()!.snapshot.entities.some((row) => row.salvageOrder?.state === "working");
    });
    expect(working).toBe(true);
    await page.getByRole("button", { name: "S · Stop", exact: true }).click();
    await expect(page.locator("[data-result]")).toHaveText(/accepted/i);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (Reflect.get(window, "salvageFixture") as Awaited<ReturnType<typeof start>>)
            .state()!
            .snapshot.entities.some((row) => row.salvageOrder),
        ),
      )
      .toBe(false);
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    await expect(page.locator("[data-result]")).toHaveText(/accepted/i);
    const completed = await page.evaluate(async () => {
      const f = Reflect.get(window, "salvageFixture") as Awaited<ReturnType<typeof start>>;
      for (let tick = 0; tick < 1500 && f.state()!.snapshot.remains?.length; tick++)
        await f.step(1);
      const value = f.state()!.snapshot.banks?.find((row) => row.force === 0)?.resources.materials;
      await f.step(20);
      const state = f.state();
      const surrendered = await f.command("match.surrender", { force: 0 });
      return { value, state, surrendered, errors: f.errors(), record: await f.record() };
    });
    expect(completed.value).toBeGreaterThan(death.materials ?? 0);
    expect(
      completed.state?.snapshot.banks?.find((row) => row.force === 0)?.resources.materials,
    ).toBe(completed.value);
    expect(completed.state?.snapshot.remains).toHaveLength(0);
    expect(completed.errors).toEqual([]);
    expect(completed.surrendered).toBe("accepted");
    expect(errors).toEqual([]);
    const record = parseMatchRecord(completed.record);
    expect(verifyMatchRecord(record).hash).toBe(record.hash);
    await info.attach("salvage-record", {
      body: JSON.stringify(record),
      contentType: "application/json",
    });
  } finally {
    await page.evaluate(() =>
      (Reflect.get(window, "salvageFixture") as Awaited<ReturnType<typeof start>>).dispose(),
    );
  }
});
