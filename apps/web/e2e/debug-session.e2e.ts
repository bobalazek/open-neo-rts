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
  await expect(page.getByRole("status")).toContainText("Tick 0 · 0 entities");
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  await expect(page.getByRole("status")).toContainText("Tick 0 · 0 entities");
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
  await expect(page.getByRole("status")).toContainText("Tick 0 · 0 entities");
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
    await expect(page.getByRole("status")).toContainText("Seed 4294967295 · Controlled Force 2");
    const before = await page.evaluate(() => Reflect.get(window, "workerState"));
    await page.getByRole("button", { name: "Reload session" }).click();
    await expect(canvas).toHaveAttribute("data-session", "ready");
    expect(await page.evaluate(() => Reflect.get(window, "workerState"))).toEqual(before);
  }
  await page.screenshot({
    path: "/tmp/neo-art-completion/artifacts/debug-client/28-configuration.png",
  });
});
