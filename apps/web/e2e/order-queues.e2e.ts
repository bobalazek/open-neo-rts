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
const setup: MatchSetup = {
  ...original,
  grants: [...original.grants, { seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
  map: {
    ...flatMap(48),
    spawns: [
      { id: "near", position: [10 * 1024, 10 * 1024], facing: 16384 },
      { id: "far", position: [36 * 1024, 36 * 1024], facing: 16384 },
    ],
    resources: [
      { kind: "ore", position: [8 * 1024, 15 * 1024], radius: 1024, amount: 10000 },
      { kind: "ore", position: [40 * 1024, 41 * 1024], radius: 1024, amount: 10000 },
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
};
type Fixture = Awaited<ReturnType<typeof start>>;

test("original units queue/edit/cancel moves and builders pay once for sequential queued sites through HUD/worker", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://order-queues.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Queued orders</title><canvas tabindex="0" width="400" height="200"></canvas>',
    });
  });
  await page.goto("http://order-queues.test/");
  await page.evaluate(async (setup) => {
    const url = "/fixture.js";
    const { start } = (await import(url)) as { start: typeof import("./deploy-fixture").start };
    Object.assign(window, { queueFixture: await start(setup) });
    (Reflect.get(window, "queueFixture") as Fixture).select([
      "core.unit:eastern-collective/collective-soldier",
    ]);
  }, setup);
  const ground = async (x: number, y: number) =>
    page.evaluate(({ x, y }) => (Reflect.get(window, "queueFixture") as Fixture).ground(x, y), {
      x,
      y,
    });
  try {
    await ground(20, 15);
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    await expect(page.locator("[data-result]")).toHaveText(/accepted/i);
    await page.keyboard.down("Shift");
    await ground(22, 18);
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    await expect(
      page.locator("[data-order-queue] button", { hasText: "Remove queued order" }),
    ).toHaveCount(1);
    await ground(24, 20);
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    await page.keyboard.up("Shift");
    await expect(
      page.getByRole("button", { name: "Remove queued order", exact: true }),
    ).toHaveCount(2);
    await page.getByRole("button", { name: "Move queued waypoint", exact: true }).first().click();
    await ground(26, 20);
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    await expect(page.locator("[data-order-queue]")).toContainText("(26, 20)");
    await page.getByRole("button", { name: "Remove queued order", exact: true }).first().click();
    await expect(
      page.getByRole("button", { name: "Remove queued order", exact: true }),
    ).toHaveCount(1);
    const moved = await page.evaluate(async () => {
      const f = Reflect.get(window, "queueFixture") as Fixture;
      for (
        let tick = 0;
        tick < 600 &&
        f
          .state()!
          .snapshot.entities.some((row) => row.force === 0 && (row.order || row.queuedOrders));
        tick++
      )
        await f.step(1);
      return f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
        )
        .map((row) => ({ x: row.x, y: row.y, pending: row.queuedOrders?.length ?? 0 }));
    });
    expect(moved).toHaveLength(3);
    expect(
      moved.every(
        (row) => row.x === 24 * 1024 + 512 && row.y === 20 * 1024 + 512 && row.pending === 0,
      ),
    ).toBe(true);
    await page.evaluate(async () => {
      const f = Reflect.get(window, "queueFixture") as Fixture;
      f.select(["core.unit:eastern-collective/field-technician"]);
      const builders = f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 0 && row.definition.endsWith("/field-technician"),
        )
        .map((row) => row.handle);
      await f.command("unit.move", { entities: builders, x: 13 * 1024 + 512, y: 15 * 1024 + 512 });
    });
    await page.keyboard.down("Shift");
    await page
      .locator('[data-definition="core.structure:eastern-collective/industrial-reactor"]')
      .click();
    await ground(14, 10);
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    await expect(
      page.getByRole("button", { name: "Remove queued order", exact: true }),
    ).toHaveCount(1);
    await ground(17, 10);
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    await page.keyboard.up("Shift");
    await expect(
      page.getByRole("button", { name: "Remove queued order", exact: true }),
    ).toHaveCount(2);
    const queuedCredits = await page.evaluate(
      () =>
        (Reflect.get(window, "queueFixture") as Fixture)
          .state()!
          .snapshot.banks?.find((row) => row.force === 0)?.resources.credits,
    );
    expect(queuedCredits).toBe(5000);
    await page.keyboard.press("Escape");
    const built = await page.evaluate(async () => {
      const f = Reflect.get(window, "queueFixture") as Fixture;
      const completed = () =>
        f
          .state()!
          .snapshot.entities.filter(
            (row) =>
              row.force === 0 &&
              row.definition.endsWith("/industrial-reactor") &&
              !row.constructionSite,
          );
      for (let tick = 0; tick < 1200 && completed().length < 2; tick++) await f.step(1);
      const snapshot = f.state()!.snapshot;
      return {
        count: completed().length,
        snapshot,
        errors: f.errors(),
      };
    });
    expect(
      built.snapshot.entities.filter(
        (row) =>
          row.force === 0 &&
          row.definition.endsWith("/industrial-reactor") &&
          !row.constructionSite,
      ),
    ).toHaveLength(2);
    expect(built.snapshot.banks?.find((row) => row.force === 0)?.resources.credits).toBe(3200);
    expect(built.errors).toEqual([]);
    await page
      .locator('[data-definition="core.structure:eastern-collective/barracks-complex"]')
      .click();
    await ground(14, 15);
    await page.locator("canvas").click({ position: { x: 50, y: 50 } });
    await expect(page.locator("[data-result]")).toHaveText(/accepted/i);
    await page.evaluate(() =>
      (Reflect.get(window, "queueFixture") as Fixture).target(
        "core.structure:eastern-collective/barracks-complex",
      ),
    );
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    const combat = await page.evaluate(async () => {
      const f = Reflect.get(window, "queueFixture") as Fixture;
      const producer = () =>
        f
          .state()!
          .snapshot.entities.find(
            (row) =>
              row.force === 0 &&
              row.definition.endsWith("/barracks-complex") &&
              !row.constructionSite,
          );
      for (let tick = 0; tick < 800 && !producer(); tick++) await f.step(1);
      const own = f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 0 && row.definition.endsWith("/collective-soldier"),
        )
        .map((row) => row.handle);
      await f.command("unit.move", { entities: own, x: 5 * 1024 + 512, y: 20 * 1024 + 512 });
      await f.step(300);
      const enemies = f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 1 && row.definition.endsWith("/collective-soldier"),
        )
        .map((row) => row.handle);
      const attacked = await f.command("unit.attack", {
        entities: enemies,
        entity: producer()?.handle,
      });
      for (let tick = 0; tick < 800 && producer()?.health === producer()?.maxHealth; tick++)
        await f.step(1);
      const damaged = producer();
      await f.command("unit.move", { entities: enemies, x: 36 * 1024 + 512, y: 36 * 1024 + 512 });
      await f.step(160);
      f.select(["core.unit:eastern-collective/field-technician"]);
      f.target("core.structure:eastern-collective/barracks-complex");
      return { attacked, damaged };
    });
    expect(combat.attacked).toBe("accepted");
    expect(combat.damaged).toBeDefined();
    expect(combat.damaged!.health).toBeLessThan(combat.damaged!.maxHealth);
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    const repaired = await page.evaluate(async () => {
      const f = Reflect.get(window, "queueFixture") as Fixture;
      const producer = () =>
        f
          .state()!
          .snapshot.entities.find(
            (row) => row.force === 0 && row.definition.endsWith("/barracks-complex"),
          );
      for (let tick = 0; tick < 300 && producer()?.health !== producer()?.maxHealth; tick++)
        await f.step(1);
      f.select(["core.structure:eastern-collective/barracks-complex"]);
      f.ground(20, 16);
      return producer();
    });
    expect(repaired?.health).toBe(repaired?.maxHealth);
    await page.locator("canvas").click({ button: "right", position: { x: 50, y: 50 } });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (Reflect.get(window, "queueFixture") as Fixture)
              .state()!
              .snapshot.entities.find(
                (row) => row.force === 0 && row.definition.endsWith("/barracks-complex"),
              )?.production?.rally?.x,
        ),
      )
      .toBe(20 * 1024 + 512);
    const terminal = await page.evaluate(async () => {
      const f = Reflect.get(window, "queueFixture") as Fixture;
      const surrendered = await f.command("match.surrender", { force: 0 });
      return { surrendered, record: await f.record(), errors: f.errors() };
    });
    expect(terminal.surrendered).toBe("accepted");
    expect(terminal.errors).toEqual([]);
    expect(errors).toEqual([]);
    const record = parseMatchRecord(terminal.record);
    expect(verifyMatchRecord(record).hash).toBe(record.hash);
    writeFileSync(info.outputPath("order-queues.record.json"), JSON.stringify(record));
  } finally {
    await page.evaluate(() => (Reflect.get(window, "queueFixture") as Fixture).dispose());
  }
});
