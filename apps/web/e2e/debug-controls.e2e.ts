import { expect, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";

test("debug controls share the real worker, projected selection and granted orders", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.state) Object.assign(window, { debugControlState: data.state });
        });
      }
    };
  });
  await page.goto(
    new URL("/debug", test.info().project.use.baseURL ?? "http://localhost:4320").href,
  );
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const state = () => page.evaluate(() => Reflect.get(window, "debugControlState") as OfflineState);
  const definitions = page.getByRole("listbox", { name: "Definition" });
  expect(await definitions.locator("option").count()).toBe(136);
  await page.getByRole("button", { name: "Add Force" }).click();
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Canvas missing");
  const point = (x: number, y: number) => ({
    x: bounds.x + bounds.width * x,
    y: bounds.y + bounds.height * y,
  });
  const click = async (x: number, y: number, button: "left" | "right" = "left") => {
    const p = point(x, y);
    await page.mouse.click(p.x, p.y, { button });
  };
  const spawnResult = page.getByRole("status", { name: "Spawn result" });
  const count = page.locator('[aria-label="Selection count"]');
  const inspected = page.locator('[aria-label="Integer components"]');
  const time = page.locator('[aria-label="Simulation time"]');
  await definitions.selectOption("core.unit:eastern-collective/dragon-tank");
  await click(0.4, 0.55);
  await expect(spawnResult).toContainText("Spawned");
  await click(0.6, 0.55);
  await expect(page.getByRole("status", { name: "Model status" })).toContainText(
    "Models ready · 2",
  );
  await page.getByLabel("Map action", { exact: true }).selectOption("select");
  await click(0.4, 0.55);
  await expect(count).toHaveText("1 selected");
  await page.keyboard.down("Shift");
  await click(0.6, 0.55);
  await page.keyboard.up("Shift");
  await expect(count).toHaveText("2 selected");
  await page.keyboard.down("Control");
  await click(0.4, 0.55);
  await page.keyboard.up("Control");
  await expect(count).toHaveText("1 selected");
  const start = point(0.8, 0.85);
  const end = point(0.2, 0.2);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();
  await expect(count).toHaveText("2 selected");
  await page.screenshot({ path: test.info().outputPath("selection.png") });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(count).toHaveText("2 selected");
  const beforeOrders = await state();
  await page.getByLabel("Seed", { exact: true }).focus();
  await page.keyboard.press("s");
  expect(await state()).toEqual(beforeOrders);
  await canvas.focus();
  const pan = point(0.5, 0.7);
  await page.mouse.move(pan.x, pan.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(pan.x + 20, pan.y, { steps: 3 });
  await page.mouse.up({ button: "right" });
  expect((await state()).snapshot.tick).toBe(beforeOrders.snapshot.tick);
  await click(0.5, 0.75, "right");
  await expect(page.getByRole("status", { name: "Order mode" })).toContainText(
    "unit.move: accepted",
  );
  expect((await state()).snapshot.entities.every((entity) => entity.order?.type === "move")).toBe(
    true,
  );
  await canvas.focus();
  await page.keyboard.press("s");
  await expect(page.getByRole("status", { name: "Order mode" })).toContainText(
    "unit.stop: accepted",
  );
  expect((await state()).snapshot.entities.every((entity) => entity.order === null)).toBe(true);
  await page.keyboard.press("a");
  await click(0.5, 0.3);
  await expect(page.getByRole("status", { name: "Order mode" })).toContainText(
    "unit.attackMove: accepted",
  );
  expect(
    (await state()).snapshot.entities.every((entity) => entity.order?.type === "attackMove"),
  ).toBe(true);
  await page.getByRole("button", { name: "Stop (S)", exact: true }).click();
  const beforeStep = await state();
  await page.getByRole("button", { name: "Step one tick", exact: true }).click();
  await expect(time).toContainText(`Tick ${beforeStep.snapshot.tick + 1} · Paused`);
  await page.getByLabel("Speed", { exact: true }).selectOption("0.25");
  await expect(time).toContainText("×0.25");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect
    .poll(async () => (await state()).snapshot.tick)
    .toBeGreaterThan(beforeStep.snapshot.tick + 1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await state();
  await page.getByLabel("Speed", { exact: true }).selectOption("8");
  await expect(time).toContainText("×8");
  expect((await state()).snapshot.tick).toBe(paused.snapshot.tick);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect
    .poll(async () => (await state()).snapshot.tick)
    .toBeGreaterThan(paused.snapshot.tick + 2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const selected = (await state()).snapshot.entities[0];
  if (!selected) throw new Error("Missing entity");
  await page.getByLabel("Inspect entity", { exact: true }).selectOption(selected.handle);
  await expect(inspected).toContainText(`"x": ${selected.x}`);
  await page.getByLabel("Health", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Set health", exact: true }).click();
  await expect(inspected).toContainText('"health": 100');
  await page.getByRole("button", { name: "Kill", exact: true }).click();
  await expect(count).toHaveText("0 selected");
  await page.getByLabel("Map action", { exact: true }).selectOption("spawn");
  await definitions.selectOption("core.prop:urban/bench");
  await click(0.5, 0.5);
  await expect(spawnResult).toContainText("Spawned");
  const bench = (await state()).snapshot.entities.find(
    (entity) => entity.definition === "core.prop:urban/bench",
  );
  if (!bench) throw new Error("Missing bench");
  await page.getByLabel("Inspect entity", { exact: true }).selectOption(bench.handle);
  await expect(page.getByRole("button", { name: "Kill", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(count).toHaveText("0 selected");
  await page.getByLabel("Spawn Force", { exact: true }).selectOption("1");
  await definitions.selectOption("core.unit:eastern-collective/dragon-tank");
  await click(0.35, 0.65);
  await expect(spawnResult).toContainText("Spawned");
  const enemy = (await state()).snapshot.entities.find((entity) => entity.force === 1);
  if (!enemy) throw new Error("Missing other Force");
  await page.getByLabel("Inspect entity", { exact: true }).selectOption(enemy.handle);
  await page.getByLabel("Map action", { exact: true }).selectOption("select");
  await click(0.6, 0.7, "right");
  await expect(page.getByRole("status", { name: "Order mode" })).toContainText("no_grant");
  expect(
    (await state()).snapshot.entities.find(({ handle }) => handle === enemy.handle)?.order,
  ).toBeNull();
  await page.setViewportSize({ width: 390, height: 720 });
  await page.getByRole("button", { name: "Step one tick", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Step one tick", exact: true })).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("controls-narrow.png"),
  });
  const finalState = await state();
  expect(finalState.hash).toMatch(/^[a-f0-9]{16}$/);
  await expect(time).toContainText(finalState.hash ?? "missing hash");
});
