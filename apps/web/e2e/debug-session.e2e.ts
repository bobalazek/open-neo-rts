import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

test("debug shell reloads, retries worker failure and keeps controls reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const counts = { created: 0, terminated: 0 };
    Object.assign(window, { workerCounts: counts });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        counts.created++;
        this.addEventListener("message", ({ data }) => {
          if (data.state) Object.assign(window, { workerState: data.state });
        });
      }
      override terminate() {
        counts.terminated++;
        super.terminate();
      }
    };
  });
  await page.goto("/debug");
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page.getByRole("status", { name: "Session status" })).toContainText(
    "Tick 0 · 0 entities",
  );
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  await expect(page.getByRole("status", { name: "Session status" })).toContainText(
    "Tick 0 · 0 entities",
  );
  await page.route("**/sim-worker.js", (route) => route.abort());
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(page.getByRole("alert")).toContainText("Simulation worker failed");
  await page.unroute("**/sim-worker.js");
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  await page.setViewportSize({ width: 390, height: 720 });
  await expect(page.getByRole("button", { name: "Reload session" })).toBeInViewport();
  await page.getByRole("button", { name: "Reload session" }).focus();
  await page.keyboard.press("w");
  await expect(page.getByRole("status", { name: "Session status" })).toContainText(
    "Tick 0 · 0 entities",
  );
  expect(await page.evaluate(() => Reflect.get(window, "workerCounts"))).toEqual({
    created: 4,
    terminated: 3,
  });
  await page.screenshot({ path: "/tmp/neo-art-completion/artifacts/debug-client/27-shell.png" });
  await page.getByRole("link", { name: "Terrain view" }).click();
  await expect(page.getByRole("region", { name: "Terrain view" })).toBeVisible();
  await page.goto("/debug?models=1");
  await expect(page.getByRole("region", { name: "Model check" })).toBeVisible();
});

for (const production of [false, true]) {
  test(`debug clicks use real commands and models: ${production ? "production" : "development"}`, async ({
    page,
  }, testInfo) => {
    const app = fileURLToPath(new URL("..", import.meta.url));
    const port = 4340 + testInfo.workerIndex;
    let server: ReturnType<typeof spawn> | undefined;
    if (production) {
      execFileSync("bun", ["./build.ts"], { cwd: app });
      server = spawn(
        "bun",
        [
          "-e",
          `Bun.serve({port:${port}, async fetch(req) {const file=Bun.file("dist"+new URL(req.url).pathname);return new Response(await file.exists()?file:Bun.file("dist/index.html"));}});`,
        ],
        { cwd: app, stdio: "ignore" },
      );
    }
    try {
      await page.addInitScript(() => {
        const OriginalWorker = window.Worker;
        window.Worker = class extends OriginalWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            this.addEventListener("message", ({ data }) => {
              if (data.state) Object.assign(window, { workerState: data.state });
            });
          }
        };
      });
      await expect(async () => {
        await page.goto(production ? `http://localhost:${port}/debug` : "/debug");
      }).toPass();
      const canvas = page.locator("#game");
      await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
      const definitions = page.getByRole("listbox", { name: "Definition" });
      expect(await definitions.locator("option").count()).toBe(136);
      await page.getByRole("searchbox", { name: "Search definitions" }).fill("Dragon Tank");
      expect(await definitions.locator("option").count()).toBe(1);
      await page.getByRole("searchbox", { name: "Search definitions" }).fill("");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("Canvas missing");
      const click = async (x: number, y: number) =>
        page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
      const spawnResult = page.getByRole("status", { name: "Spawn result" });
      const models = page.getByRole("status", { name: "Model status" });
      const entries = [
        ["core.unit:alliance-of-free-nations/tactical-operator", 0.3, 0.5],
        ["core.unit:eastern-collective/flame-tank", 0.5, 0.5],
        ["core.unit:phoenix-initiative/insurgent", 0.7, 0.5],
        ["core.structure:eastern-collective/radar-tower", 0.4, 0.7],
        ["core.prop:urban/bench", 0.6, 0.7],
      ] as const;
      for (const [definition, x, y] of entries) {
        await definitions.selectOption(definition);
        if (definition.includes("structure:"))
          await page.getByLabel("Rotation", { exact: true }).selectOption("1");
        await click(x, y);
        await expect(spawnResult).toContainText("Spawned");
        await expect(models).toContainText("Models ready");
      }
      const state = await page.evaluate(() => Reflect.get(window, "workerState"));
      expect(
        state.snapshot.entities.map((entity: { definition: string }) => entity.definition),
      ).toEqual(entries.map(([id]) => id));
      expect(state.snapshot.entities[3]).toMatchObject({ facing: 32768 });
      expect(state.snapshot.entities[3].x % 1024).toBe(0);
      await definitions.selectOption("core.structure:eastern-collective/radar-tower");
      await click(0.4, 0.7);
      await expect(spawnResult).toContainText("placement_failed · blocked");
      const refused = await page.evaluate(() => Reflect.get(window, "workerState"));
      expect(refused.snapshot.entities).toEqual(state.snapshot.entities);
      await spawnResult.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/tmp/neo-art-completion/artifacts/debug-client/29-spawns-${production ? "production" : "development"}.png`,
      });
      await page.route("**/*", (route) =>
        route.request().resourceType() === "fetch" ? route.abort() : route.continue(),
      );
      await page.getByRole("button", { name: "Reload session" }).click();
      await expect(canvas).toHaveAttribute("data-session", "ready");
      await definitions.selectOption("core.unit:eastern-collective/flame-tank");
      await click(0.5, 0.5);
      await expect(spawnResult).toContainText("Spawned");
      await expect(models).toContainText("Model unavailable: Flame Tank");
      await expect(canvas).toHaveAttribute("data-session", "ready");
      await page.unroute("**/*");
      await page.getByRole("button", { name: "Reload session" }).click();
      await expect(canvas).toHaveAttribute("data-session", "ready");
      await click(0.5, 0.5);
      await expect(models).toContainText("Models ready");
    } finally {
      server?.kill();
    }
  });
}

test("debug configuration starts every authored map and reproduces reload", async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.state) Object.assign(window, { workerState: data.state });
        });
      }
    };
  });
  await page.goto("/debug");
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByLabel("Seed", { exact: true }).fill("1.5");
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(page.getByRole("alert")).toContainText("Seed must be an integer");
  await page.getByLabel("Seed", { exact: true }).fill("4294967295");
  await page.getByRole("button", { name: "Add Force" }).click();
  await page.getByLabel("Force 1 faction").selectOption("core.faction:phoenix-initiative");
  await page.getByLabel("Controlled Force", { exact: true }).selectOption("1");
  for (const map of ["flat", "terrain", "water", "resources", "biomes", "training-grounds"]) {
    const id = map === "training-grounds" ? `core.map:${map}` : `core.map:sandbox-${map}`;
    await page.getByLabel("Map", { exact: true }).selectOption(id);
    await page.getByRole("button", { name: "Reload session" }).click();
    await expect(canvas).toHaveAttribute("data-session", "ready");
    await expect(page.getByRole("status", { name: "Session status" })).toContainText(
      "Seed 4294967295 · Controlled Force 2",
    );
    const before = await page.evaluate(() => Reflect.get(window, "workerState"));
    await page.getByRole("button", { name: "Reload session" }).click();
    await expect(canvas).toHaveAttribute("data-session", "ready");
    expect(await page.evaluate(() => Reflect.get(window, "workerState"))).toEqual(before);
  }
  await page.screenshot({
    path: "/tmp/neo-art-completion/artifacts/debug-client/28-configuration.png",
  });
});
