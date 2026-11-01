import { expect, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";

test("the 200-unit terrain scene has observational counters, real movement and repeatable reload", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.state) Reflect.set(window, "performanceState", data.state);
        });
      }
    };
  });
  await page.goto("/debug?scene=terrain-200");
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const read = () => page.evaluate(() => Reflect.get(window, "performanceState") as OfflineState);
  const initial = await read();
  expect(initial.paused).toBe(true);
  expect(initial.snapshot.tick).toBe(2);
  expect(initial.snapshot.entities).toHaveLength(200);
  expect(initial.snapshot.entities.every((entity) => entity.order?.type === "move")).toBe(true);
  await expect(page.getByLabel("Model status", { exact: true })).toContainText("Models ready");
  const counters = page.getByLabel("Performance counters", { exact: true });
  await expect(counters).toContainText("Worker step");
  await expect.poll(() => counters.getAttribute("data-instances")).not.toBe("0");
  await expect
    .poll(async () => Number(await counters.getAttribute("data-frame-ms")))
    .toBeGreaterThan(0);
  expect(Number(await counters.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
  expect(Number(await counters.getAttribute("data-tick-ms"))).toBeGreaterThanOrEqual(0);
  expect((await read()).hash).toBe(initial.hash);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await read()).snapshot.entities.filter((entity, index) => {
          const before = initial.snapshot.entities[index];
          return before && (entity.x !== before.x || entity.y !== before.y);
        }).length,
      { timeout: 10_000 },
    )
    .toBe(200);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const moved = await read();
  expect(
    moved.snapshot.entities.some((entity, index) => {
      const before = initial.snapshot.entities[index];
      return before && (entity.x !== before.x || entity.y !== before.y);
    }),
  ).toBe(true);
  await testInfo.attach("performance-observations.json", {
    body: JSON.stringify({
      project: testInfo.project.name,
      browser: browser.version(),
      viewport: page.viewportSize(),
      counters: await counters.textContent(),
      initialHash: initial.hash,
      tick: moved.snapshot.tick,
    }),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "Reload session", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  expect((await read()).hash).toBe(initial.hash);
  expect(await counters.count()).toBe(1);
  await expect(page.getByLabel("Initial setup link", { exact: true })).toHaveValue(
    /\?scene=terrain-200$/,
  );
  await page.goto("/debug");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  expect((await read()).snapshot.entities).toHaveLength(0);
  await expect(counters).not.toHaveAttribute("data-tick-ms");
});
