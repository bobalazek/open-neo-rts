import { expect, type Page, test } from "@playwright/test";
import type { OfflineState, PlacementDiagnostic } from "../../../packages/client/src/worker";

async function openPlacement(page: Page, url = "/debug") {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.state) Object.assign(window, { placementState: data.state });
          if (
            data.result &&
            typeof data.result.ok === "boolean" &&
            Number.isInteger(data.result.tick)
          )
            Object.assign(window, { placementDiagnostic: data.result });
        });
      }
    };
  });
  await page.goto(url);
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready");
  const definitions = page.getByRole("listbox", { name: "Definition" });
  const preview = page.getByRole("status", { name: "Placement preview" });
  const result = page.getByRole("status", { name: "Spawn result" });
  const diagnostic = () =>
    page.evaluate(() => Reflect.get(window, "placementDiagnostic") as PlacementDiagnostic);
  const state = () => page.evaluate(() => Reflect.get(window, "placementState") as OfflineState);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Canvas missing");
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  return { canvas, definitions, preview, result, diagnostic, state, x, y };
}

test("authoritative placement preview agrees with rotated refusals and camera changes", async ({
  page,
}) => {
  const { canvas, definitions, preview, result, diagnostic, state, x, y } =
    await openPlacement(page);
  await definitions.selectOption("core.structure:eastern-collective/shipyard");
  await page.mouse.move(x, y);
  for (const rotation of [0, 1, 2, 3]) {
    await page.getByLabel("Rotation", { exact: true }).selectOption(String(rotation));
    await expect(preview).toContainText(`${rotation * 90}° · not_deep_water`);
    const checked = await diagnostic();
    expect(checked.ok).toBe(false);
    expect(await page.locator('[aria-label="Placement cells"] li').allTextContents()).toEqual(
      checked.cells?.map(
        (cell) => `${cell.x}, ${cell.y} · ${cell.rule ?? "prop"} · ${cell.failure ?? "allowed"}`,
      ) ?? [],
    );
    await page.mouse.click(x, y);
    await expect(result).toContainText("placement_failed · not_deep_water");
    expect((await state()).snapshot.entities).toHaveLength(0);
  }
  const beforeCamera = (await diagnostic()).cells?.[0]?.x;
  await canvas.focus();
  await page.keyboard.down("ArrowRight");
  try {
    await expect.poll(async () => (await diagnostic()).cells?.[0]?.x).not.toBe(beforeCamera);
  } finally {
    await page.keyboard.up("ArrowRight");
  }
});

test("shared extractor snaps to a material node, renders and refuses a second claim", async ({
  page,
}) => {
  const { definitions, preview, result, diagnostic, state, x, y } = await openPlacement(
    page,
    "/debug?map=core.map%3Asandbox-resources",
  );
  await definitions.selectOption("core.structure:neutral/resource-extractor");
  await page.mouse.move(x, y);
  await expect(preview).toContainText("Allowed");
  expect((await diagnostic()).cells?.map(({ x, y }) => [x, y])).toEqual([
    [31, 31],
    [32, 31],
    [31, 32],
    [32, 32],
  ]);
  await page.mouse.click(x, y);
  await expect(result).toContainText("Spawned Resource Extractor");
  await expect(page.getByLabel("Model status", { exact: true })).toContainText("Models ready · 1");
  expect((await state()).snapshot.entities[0]).toMatchObject({
    definition: "core.structure:neutral/resource-extractor",
    x: 31 * 1024,
    y: 31 * 1024,
    health: 800,
    maxHealth: 800,
  });
  await expect(preview).toContainText("blocked");
  await page.mouse.click(x, y);
  await expect(result).toContainText("placement_failed · blocked");
  expect((await state()).snapshot.entities).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath("extractor-node.png") });
});

test("authoritative placement commits refresh occupancy and reset on reload", async ({ page }) => {
  const { canvas, definitions, preview, result, diagnostic, state, x, y } =
    await openPlacement(page);
  await definitions.selectOption("core.structure:eastern-collective/radar-tower");
  await page.getByLabel("Rotation", { exact: true }).selectOption("0");
  await page.mouse.move(x, y);
  await expect(preview).toContainText("Allowed");
  await page.screenshot({ path: test.info().outputPath("placement-allowed.png") });
  await page.mouse.click(x, y);
  await expect(result).toContainText("Spawned Radar Tower");
  await expect(preview).toContainText("blocked");
  expect((await diagnostic()).cells?.every((cell) => cell.failure === "blocked")).toBe(true);
  await page.mouse.click(x, y);
  await expect(result).toContainText("placement_failed · blocked");
  expect((await state()).snapshot.entities).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath("placement-blocked.png") });
  await page.getByRole("button", { name: "Reload session" }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready");
  await page.mouse.move(x, y);
  await expect(preview).toContainText("Allowed @0");
  expect((await state()).snapshot.entities).toHaveLength(0);
});
