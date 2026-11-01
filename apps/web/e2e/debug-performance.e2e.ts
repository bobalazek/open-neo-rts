import { expect, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";

interface MovementProgress {
  positions: Pick<OfflineState["snapshot"]["entities"][number], "handle" | "x" | "y">[];
  logicalCeiling: number;
  state?: OfflineState;
}

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
          if (!data.state) return;
          const state = data.state as OfflineState;
          Reflect.set(window, "performanceState", state);
          const progress = Reflect.get(window, "performanceProgress") as
            | MovementProgress
            | undefined;
          if (!progress || progress.state) return;
          const current = new Map(state.snapshot.entities.map((entity) => [entity.handle, entity]));
          const moved = progress.positions.every((before) => {
            const entity = current.get(before.handle);
            return entity && (entity.x !== before.x || entity.y !== before.y);
          });
          if (moved || state.snapshot.tick >= progress.logicalCeiling) progress.state = state;
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
  const positions = initial.snapshot.entities.map(({ handle, x, y }) => ({ handle, x, y }));
  const logicalCeiling = initial.snapshot.tick + 32;
  await page.evaluate(
    (progress: MovementProgress) => Reflect.set(window, "performanceProgress", progress),
    { positions, logicalCeiling },
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  // Initial movement is bounded in sim ticks; the whole case still has its 60s watchdog.
  const progress = await page.waitForFunction(
    () => (Reflect.get(window, "performanceProgress") as MovementProgress).state,
    undefined,
    { timeout: 0 },
  );
  const progressed = (await progress.jsonValue()) as OfflineState;
  await progress.dispose();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Step one tick", exact: true })).toBeEnabled();
  const moved = await read();
  const current = new Map(progressed.snapshot.entities.map((entity) => [entity.handle, entity]));
  const unmoved = positions.filter((before) => {
    const entity = current.get(before.handle);
    return !entity || (entity.x === before.x && entity.y === before.y);
  });
  await testInfo.attach("performance-observations.json", {
    body: JSON.stringify({
      project: testInfo.project.name,
      browser: browser.version(),
      viewport: page.viewportSize(),
      counters: await counters.textContent(),
      initialHash: initial.hash,
      tick: moved.snapshot.tick,
      progressTick: progressed.snapshot.tick,
      logicalCeiling,
      moved: positions.length - unmoved.length,
      unmovedHandles: unmoved.map(({ handle }) => handle),
    }),
    contentType: "application/json",
  });
  expect(progressed.snapshot.entities).toHaveLength(200);
  expect(positions.length - unmoved.length).toBe(200);
  expect(moved.paused).toBe(true);
  expect(
    moved.snapshot.entities.some((entity, index) => {
      const before = initial.snapshot.entities[index];
      return before && (entity.x !== before.x || entity.y !== before.y);
    }),
  ).toBe(true);
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
