import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { type MatchSetup, parseMatchRecord, verifyMatchRecord } from "../../../packages/sim/src";
import { flatMap } from "../../../packages/sim/src/testing/maps";
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
// Original kits/stats on a compact flat test map; one worker explicitly controls both Forces.
const setup: MatchSetup = {
  ...original,
  map: {
    ...flatMap(48),
    spawns: [
      { id: "near", position: [10 * 1024, 10 * 1024], facing: 16384 },
      { id: "far", position: [36 * 1024, 36 * 1024], facing: 16384 },
    ],
    resources: [
      { kind: "ore", position: [8 * 1024, 15 * 1024], amount: 10000, radius: 1024 },
      { kind: "ore", position: [40 * 1024, 41 * 1024], amount: 10000, radius: 1024 },
    ],
  },
  normal: {
    ...original.normal,
    bots: [],
    settings: { ...original.normal.settings, fog: "off" },
    forces: original.normal.forces.map((force) => ({
      ...force,
      spawn: force.index ? "far" : "near",
    })),
  },
  grants: [
    ...original.grants,
    { seat: 1, force: 1, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
  ],
};
type Fixture = Awaited<ReturnType<typeof start>>;

test("original soldiers pursue, hold and attack-move through normal HUD/worker orders and replay", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://combat-orders.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Combat orders</title><canvas tabindex="0" width="400" height="200"></canvas>',
    });
  });
  await page.goto("http://combat-orders.test/");
  await page.evaluate(async (setup) => {
    const url = "/fixture.js";
    const { start } = (await import(url)) as { start: typeof import("./deploy-fixture").start };
    Object.assign(window, { combatOrderFixture: await start(setup) });
  }, setup);
  try {
    const built = await page.evaluate(async () => {
      const f = Reflect.get(window, "combatOrderFixture") as Fixture;
      const rows = f.state()!.snapshot.entities;
      const base = rows.find(
        (row) => row.force === 1 && row.definition.endsWith("/command-center"),
      )!;
      const power = await f.command("economy.power", { entity: base.handle, enabled: 0 });
      const builders = rows
        .filter((row) => row.force === 1 && row.definition.endsWith("/field-technician"))
        .map((row) => row.handle);
      const placed = await f.command("economy.build", {
        definition: "core.structure:eastern-collective/industrial-reactor",
        force: 1,
        builders,
        x: 30 * 1024,
        y: 34 * 1024,
        facing: 16384,
      });
      const reactor = () =>
        f
          .state()!
          .snapshot.entities.find(
            (row) =>
              row.force === 1 &&
              row.definition.endsWith("/industrial-reactor") &&
              !row.constructionSite,
          );
      for (let tick = 0; tick < 900 && !reactor(); tick++) await f.step(1);
      f.select(["core.unit:eastern-collective/collective-soldier"]);
      f.target("core.structure:eastern-collective/industrial-reactor", 1);
      return {
        power,
        placed,
        reactor: reactor(),
        soldiers: f
          .state()!
          .snapshot.entities.filter(
            (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
          ),
      };
    });
    expect(built.power).toBe("accepted");
    expect(built.placed).toBe("accepted");
    expect(built.reactor).toBeDefined();
    await page.getByRole("button", { name: "W · Attack target", exact: true }).click();
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    await expect(page.locator("[data-result]")).toHaveText(/accepted/i);
    const pursuit = await page.evaluate(async (handle) => {
      const f = Reflect.get(window, "combatOrderFixture") as Fixture;
      for (let tick = 0; tick < 800; tick++) {
        const target = f.state()!.snapshot.entities.find((row) => row.handle === handle);
        if (target && target.health < target.maxHealth)
          return {
            hit: true,
            soldiers: f
              .state()!
              .snapshot.entities.filter(
                (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
              ),
          };
        await f.step(1);
      }
      return { hit: false, soldiers: [] };
    }, built.reactor!.handle);
    expect(pursuit.hit).toBe(true);
    expect(
      pursuit.soldiers.some((row) => row.x > Math.max(...built.soldiers.map((row) => row.x))),
    ).toBe(true);
    await page.locator("canvas").focus();
    await page.keyboard.press("h");
    await expect(page.locator("[data-hold]")).toHaveAttribute("aria-pressed", "true");
    const held = await page.evaluate(async () => {
      const f = Reflect.get(window, "combatOrderFixture") as Fixture;
      const pose = () =>
        f
          .state()!
          .snapshot.entities.filter(
            (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
          )
          .map(({ handle, x, y }) => ({ handle, x, y }));
      const before = pose();
      await f.step(30);
      return { before, after: pose(), errors: f.errors() };
    });
    expect(held.after).toEqual(held.before);
    expect(held.errors).toEqual([]);
    await page.evaluate(async () => {
      const f = Reflect.get(window, "combatOrderFixture") as Fixture;
      const units = f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
        );
      await f.command("unit.move", {
        entities: units.map((row) => row.handle),
        x: 15 * 1024 + 512,
        y: 24 * 1024 + 512,
      });
      await f.step(100);
      f.ground(40, 35);
    });
    await page.getByRole("button", { name: "A · Attack-move", exact: true }).click();
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    const engaged = await page.evaluate(async () => {
      const f = Reflect.get(window, "combatOrderFixture") as Fixture;
      for (let tick = 0; tick < 600; tick++) {
        const units = f
          .state()!
          .snapshot.entities.filter(
            (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
          );
        if (units.length && units.every((row) => row.order?.type === "attackMove")) {
          const before = units.map(({ x, y }) => ({ x, y }));
          const health = f
            .state()!
            .snapshot.entities.find(
              (row) => row.force === 1 && row.definition.endsWith("/industrial-reactor"),
            )?.health;
          await f.step(30);
          const current = f
            .state()!
            .snapshot.entities.filter(
              (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
            );
          const after = current.map(({ x, y }) => ({ x, y }));
          const damaged = f
            .state()!
            .snapshot.entities.find(
              (row) => row.force === 1 && row.definition.endsWith("/industrial-reactor"),
            )?.health;
          if (
            JSON.stringify(before) === JSON.stringify(after) &&
            current.every((row) => row.order?.type === "attackMove") &&
            damaged !== undefined &&
            health !== undefined &&
            damaged < health
          )
            return true;
        } else await f.step(1);
      }
      return false;
    });
    expect(engaged).toBe(true);
    const terminal = await page.evaluate(async () => {
      const f = Reflect.get(window, "combatOrderFixture") as Fixture;
      const surrendered = await f.command("match.surrender", { force: 0 });
      return { surrendered, errors: f.errors(), record: await f.record() };
    });
    expect(terminal.surrendered).toBe("accepted");
    expect(terminal.errors).toEqual([]);
    expect(errors).toEqual([]);
    const record = parseMatchRecord(terminal.record);
    expect(verifyMatchRecord(record).hash).toBe(record.hash);
    writeFileSync(info.outputPath("combat-orders.record.json"), JSON.stringify(record));
    await info.attach("combat-order-record", {
      body: JSON.stringify(record),
      contentType: "application/json",
    });
  } finally {
    await page.evaluate(() => (Reflect.get(window, "combatOrderFixture") as Fixture).dispose());
  }
});
