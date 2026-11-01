import { expect, type Page, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";
import type { DebugOverlayData } from "../../../packages/sim/src/projection";

async function openOverlays(page: Page, path: string) {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const packets = { terrain: 0, navigation: 0 };
    Object.assign(window, { overlayPackets: packets });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (!data.state) return;
          Object.assign(window, { overlayState: data.state });
          if (data.state.overlays?.terrain) packets.terrain++;
          if (data.state.overlays?.navigation) {
            packets.navigation++;
            Object.assign(window, { overlayNavigation: data.state.overlays.navigation });
          }
        });
      }
    };
  });
  await page.goto(new URL(path, test.info().project.use.baseURL ?? "http://localhost:4320").href);
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const state = () => page.evaluate(() => Reflect.get(window, "overlayState") as OfflineState);
  const nav = () =>
    page.evaluate(
      () => Reflect.get(window, "overlayNavigation") as NonNullable<DebugOverlayData["navigation"]>,
    );
  const packets = () =>
    page.evaluate(
      () => Reflect.get(window, "overlayPackets") as { terrain: number; navigation: number },
    );
  const status = page.getByRole("status", { name: "Overlay status" });
  return { canvas, state, nav, packets, status };
}

test("debug terrain overlays show copied rules and clear on reload without changing outcomes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { canvas, state, nav, packets, status } = await openOverlays(
    page,
    "/debug?map=core.map:sandbox-terrain",
  );
  const initial = await state();
  await page.getByLabel("Grid", { exact: true }).check();
  await page.getByLabel("Heights", { exact: true }).check();
  await page.getByLabel("Navigation and costs", { exact: true }).check();
  await expect(status).toContainText("foot:");
  expect((await state()).hash).toBe(initial.hash);
  expect((await state()).snapshot.tick).toBe(0);
  expect((await packets()).terrain).toBe(1);
  await page.getByLabel("Nav domain", { exact: true }).selectOption("naval");
  await expect(status).toContainText("naval:");
  expect((await nav()).cost.every((cost) => cost === 0)).toBe(true);
  await page.getByLabel("Nav domain", { exact: true }).selectOption("foot");
  await expect(status).toContainText("foot:");
  await expect(page.getByLabel("Fog (unavailable)", { exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("terrain.png") });
  await page.getByLabel("Map", { exact: true }).selectOption("core.map:sandbox-flat");
  await page.getByRole("button", { name: "Reload session", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  await expect(page.getByLabel("Grid", { exact: true })).not.toBeChecked();
});

test("debug route overlays refresh blockers, retain cached grids and turn off without changing outcomes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { canvas, state, nav, packets, status } = await openOverlays(
    page,
    "/debug?spawn=core.unit:eastern-collective/dragon-tank@24,32",
  );
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing canvas");
  const click = (x: number, y: number, button: "left" | "right" = "left") =>
    page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y, { button });
  const definitions = page.getByRole("listbox", { name: "Definition" });
  await page.getByLabel("Inspect entity", { exact: true }).selectOption("e1");
  await page.getByLabel("Map action", { exact: true }).selectOption("select");
  await page.getByLabel("Current paths", { exact: true }).check();
  await page.getByLabel("Navigation and costs", { exact: true }).check();
  await click(0.7, 0.65, "right");
  await expect(status).toContainText("1 current paths");
  expect((await state()).overlays?.paths?.[0]?.handle).toBe("e1");
  expect((await state()).overlays?.paths?.[0]).not.toHaveProperty("entity");
  const beforeBlock = (await nav()).revision;
  await page.getByLabel("Map action", { exact: true }).selectOption("spawn");
  await definitions.selectOption("core.structure:eastern-collective/radar-tower");
  await click(0.5, 0.5);
  await expect(page.getByRole("status", { name: "Spawn result" })).toContainText("Spawned");
  await expect.poll(async () => (await nav()).revision).toBeGreaterThan(beforeBlock);
  expect((await nav()).cost.some((cost) => cost === 0)).toBe(true);
  const beforeRun = await packets();
  const tick = (await state()).snapshot.tick;
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect.poll(async () => (await state()).snapshot.tick).toBeGreaterThan(tick + 2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(await packets()).toEqual(beforeRun);
  await page.screenshot({
    path: test.info().outputPath("paths-blocker.png"),
  });
  const beforeOff = await state();
  await page.getByLabel("Navigation and costs", { exact: true }).uncheck();
  await page.getByLabel("Current paths", { exact: true }).uncheck();
  await expect(status).toHaveText("Overlays off.");
  expect((await state()).hash).toBe(beforeOff.hash);
  expect((await state()).overlays).toBeUndefined();
});
