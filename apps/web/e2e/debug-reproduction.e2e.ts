import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";
import type { DebugSessionExport } from "../../../packages/client/src/worker/protocol";

test("initial links round-trip and a refused/reordered worker session exports to the CLI", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    Object.assign(window, { reproductionWorkers: 0 });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        Reflect.set(
          window,
          "reproductionWorkers",
          Number(Reflect.get(window, "reproductionWorkers")) + 1,
        );
        this.addEventListener("message", ({ data }) => {
          if (data.state) Object.assign(window, { reproductionState: data.state });
          if (data.result?.scenario) Object.assign(window, { reproductionExport: data.result });
        });
      }
    };
  });
  const url = new URL("/debug", test.info().project.use.baseURL ?? "http://localhost:4320");
  url.searchParams.set("map", "core.map:sandbox-flat");
  url.searchParams.set("seed", "123");
  url.searchParams.set(
    "force",
    "eastern-collective@d64235;core.faction:alliance-of-free-nations@3b8ddd",
  );
  url.searchParams.set(
    "spawn",
    "core.unit:eastern-collective/dragon-tank@28,32,0,0;core.unit:eastern-collective/dragon-tank@36,32,1,1",
  );
  await page.goto(url.href);
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const state = () => page.evaluate(() => Reflect.get(window, "reproductionState") as OfflineState);
  const initial = await state();
  expect(initial.snapshot.tick).toBe(1);
  expect(initial.snapshot.entities).toHaveLength(2);
  const link = page.getByLabel("Initial setup link", { exact: true });
  const canonical = await link.inputValue();
  await page.getByRole("button", { name: "Copy initial setup link", exact: true }).click();
  await expect(page.getByRole("status", { name: "Reproduction status" })).toContainText(
    /copied|Clipboard unavailable/,
  );
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing canvas");
  const click = (x: number, y: number, button: "left" | "right" = "left") =>
    page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y, { button });
  await page
    .getByRole("listbox", { name: "Definition" })
    .selectOption("core.structure:eastern-collective/radar-tower");
  await click(0.5, 0.45);
  await expect(page.getByRole("status", { name: "Spawn result" })).toContainText("Spawned");
  await click(0.5, 0.45);
  await expect(page.getByRole("status", { name: "Spawn result" })).toContainText(
    "placement_failed",
  );
  await page.getByLabel("Inspect entity", { exact: true }).selectOption("e1");
  await page.getByLabel("Map action", { exact: true }).selectOption("select");
  await click(0.75, 0.7, "right");
  await expect(page.getByRole("status", { name: "Order mode" })).toContainText(
    "unit.move: accepted",
  );
  await click(0.25, 0.7, "right");
  await expect(page.getByRole("status", { name: "Order mode" })).toContainText(
    "unit.move: accepted",
  );
  await page.getByRole("button", { name: "Stop (S)", exact: true }).click();
  await page.getByLabel("Health", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Set health", exact: true }).click();
  await expect(page.locator('[aria-label="Integer components"]')).toContainText('"health": 100');
  await page.getByLabel("Speed", { exact: true }).selectOption("8");
  const tick = (await state()).snapshot.tick;
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect.poll(async () => (await state()).snapshot.tick).toBeGreaterThan(tick + 2);
  // Keep the button pressed across worker redraws at ×8, as a normal pointer press can be.
  await page.getByRole("button", { name: "Pause", exact: true }).click({ delay: 100 });
  await expect(page.getByRole("button", { name: "Step one tick", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Step one tick", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export command log", exact: true }).click();
  const file = await download;
  const output = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(output);
  const exported = await page.evaluate(
    () => Reflect.get(window, "reproductionExport") as DebugSessionExport,
  );
  expect(exported.hash).toBe((await state()).hash);
  expect(exported.scenario.commands.filter((command) => command.type === "unit.move")).toHaveLength(
    2,
  );
  expect(
    exported.scenario.commands.filter((command) => command.type === "debug.spawn"),
  ).toHaveLength(3);
  expect(exported.tick).toBeGreaterThan(
    Math.max(...exported.scenario.commands.map((command) => command.tick)) + 1,
  );
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const cli = execFileSync(
    "bun",
    ["apps/cli/src/index.ts", "run", output, "--ticks", String(exported.tick)],
    { cwd: root, encoding: "utf8" },
  );
  expect(cli.trim().split("\n").at(-1)).toBe(`${exported.tick} ${exported.hash}`);
  await expect(page.getByRole("status", { name: "Reproduction status" })).toContainText(
    `--ticks ${exported.tick}`,
  );
  expect(await link.inputValue()).toBe(canonical);
  await page.getByRole("status", { name: "Reproduction status" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("export.png"),
  });
  await page.goto(canonical);
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  expect((await state()).hash).toBe(initial.hash);
  await page.goto(`${canonical}&seed=2`);
  await expect(page.getByRole("alert")).toContainText("Duplicate debug parameter: seed");
  expect(await page.evaluate(() => Reflect.get(window, "reproductionWorkers"))).toBe(0);
  await page.getByRole("button", { name: "Reload session", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  expect((await state()).snapshot.entities).toHaveLength(0);
});
