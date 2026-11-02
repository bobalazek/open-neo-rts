import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { parseMatchRecord, verifyMatchRecord } from "../../../packages/sim/src";
import type { start } from "./deploy-fixture";

declare global {
  interface Window {
    deployFixture: Awaited<ReturnType<typeof start>>;
  }
}
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
  { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
const setup = JSON.parse(
  execFileSync(
    "bun",
    [
      "-e",
      `
  import { aiMatchScenario } from "./apps/cli/src/commands/ai-vs-ai.ts";
  process.stdout.write(JSON.stringify((await aiMatchScenario(42)).setup));
`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ),
);
setup.normal.bots = [];
for (const grant of setup.grants) grant.scopes.push("unit.abilities");
for (const force of setup.normal.forces)
  force.start.units.push(
    { unit: "core.unit:eastern-collective/dragon-tank", count: 1, pop: 3, role: "combat" },
    { unit: "core.unit:eastern-collective/metamorphic-apc", count: 1, pop: 2, role: "transport" },
  );
const tank = "core.unit:eastern-collective/dragon-tank";
const apc = "core.unit:eastern-collective/metamorphic-apc";

test("authored Siege and Bunker modes work through the actual worker and HUD", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://deploy-modes.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Deploy modes</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://deploy-modes.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
  }, setup);
  try {
    await page.evaluate(([tank, apc]) => window.deployFixture.select([tank!, apc!]), [tank, apc]);
    const deploy = page.locator("[data-deploy]");
    await expect(deploy).toBeEnabled();
    await deploy.click();
    await expect(deploy).toHaveAttribute("aria-pressed", "true");
    await expect(deploy).toBeDisabled();
    await expect(page.locator("[data-details]")).toContainText("Siege Mode");
    await expect(page.locator("[data-details]")).toContainText("Bunker Mode");
    const deployed = await page.evaluate(() =>
      window.deployFixture
        .state()!
        .snapshot.entities.filter((entity) => entity.force === 0 && entity.deploy),
    );
    expect(deployed).toHaveLength(2);
    expect(deployed.every((entity) => entity.deploy?.active && entity.deploy.readyAt === 60)).toBe(
      true,
    );
    const receipts = await page.evaluate(
      async (entities) => {
        const fixture = window.deployFixture;
        return [
          await fixture.command("unit.deploy", { entities }),
          await fixture.command("unit.move", { entities, x: 32 * 1024, y: 32 * 1024 }),
          await fixture.command("unit.attackMove", { entities, x: 32 * 1024, y: 32 * 1024 }),
        ];
      },
      deployed.map((entity) => entity.handle),
    );
    expect(receipts).toEqual(["cooldown", "immobile", "immobile"]);
    await page.evaluate(() => window.deployFixture.step(60));
    const stationary = await page.evaluate(() =>
      window.deployFixture
        .state()!
        .snapshot.entities.filter((entity) => entity.force === 0 && entity.deploy),
    );
    expect(stationary.map(({ x, y }) => [x, y])).toEqual(deployed.map(({ x, y }) => [x, y]));
    await expect(deploy).toBeEnabled();
    await page.locator("canvas").focus();
    await page.keyboard.press("d");
    await expect(deploy).toHaveAttribute("aria-pressed", "false");
    await expect(deploy).toBeDisabled();
    const moved = await page.evaluate(
      async (entities) => {
        const fixture = window.deployFixture;
        const before = fixture
          .state()!
          .snapshot.entities.filter((entity) => entities.includes(entity.handle));
        const target = before[0]!;
        const receipt = await fixture.command("unit.move", {
          entities,
          x: target.x + 3 * 1024,
          y: target.y,
        });
        await fixture.step(30);
        const after = fixture
          .state()!
          .snapshot.entities.filter((entity) => entities.includes(entity.handle));
        return {
          receipt,
          changed: after.some(
            (entity, i) => entity.x !== before[i]!.x || entity.y !== before[i]!.y,
          ),
        };
      },
      deployed.map((entity) => entity.handle),
    );
    expect(moved).toEqual({ receipt: "accepted", changed: true });
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(
      record.scenario.commands.filter((command) => command.type === "unit.deploy"),
    ).toHaveLength(2);
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("the actual APC boards the original infantry through HUD targeting and unloads with U", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded transport HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://transport.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>APC transport</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://transport.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
    window.deployFixture.select([
      "core.unit:eastern-collective/collective-soldier",
      "core.unit:eastern-collective/field-technician",
    ]);
    window.deployFixture.target("core.unit:eastern-collective/metamorphic-apc");
  }, setup);
  try {
    await page.locator("[data-load]").click();
    await expect(page.locator("canvas")).toHaveAttribute("data-command-mode", "unit.load");
    await page.locator("canvas").click();
    await expect(page.locator("[data-result]")).toHaveText(
      "Command accepted. Work and clearance may still be waiting.",
    );
    await page.evaluate(() => window.deployFixture.step(300));
    const cargo = await page.evaluate(
      () =>
        window.deployFixture
          .state()!
          .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)?.cargo,
    );
    expect(cargo?.passengers).toHaveLength(5);
    expect(cargo?.boarding).toBe(0);
    await page.evaluate((apc) => window.deployFixture.select([apc]), apc);
    await expect(page.locator("[data-details]")).toContainText("Cargo 5/5");
    await expect(page.locator("[data-unload]")).toBeEnabled();
    await page.locator("canvas").focus();
    await page.keyboard.press("u");
    await expect(page.locator("[data-unload]")).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.deployFixture
              .state()!
              .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)?.cargo
              ?.passengers.length,
        ),
      )
      .toBe(0);
    expect(
      await page.evaluate(() =>
        window.deployFixture
          .state()!
          .snapshot.entities.filter(
            (entity) =>
              entity.force === 0 &&
              [
                "core.unit:eastern-collective/collective-soldier",
                "core.unit:eastern-collective/field-technician",
              ].includes(entity.definition),
          ),
      ),
    ).toHaveLength(5);
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deployFixture.dispose());
  }
});
