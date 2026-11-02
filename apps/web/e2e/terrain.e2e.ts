import { expect, test } from "@playwright/test";
import resources from "../../../content/core/maps/sandbox-resources/map.json" with { type: "json" };
import training from "../../../content/core/maps/training-grounds/map.json" with { type: "json" };

test("terrain picker loads each authored map and survives an unknown deep link", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "WebGL terrain smoke test runs in Chromium");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?map=unknown");
  await expect(page.getByRole("alert")).toHaveText("Could not load this map. Choose another map.");
  const select = page.getByRole("combobox", { name: "Map" });
  for (const [id, size] of [
    ["sandbox-flat", "64 × 64"],
    ["sandbox-terrain", "96 × 96"],
    ["sandbox-water", "96 × 96"],
    ["sandbox-resources", "64 × 64"],
    ["sandbox-biomes", "128 × 128"],
    ["training-grounds", "128 × 128"],
  ]) {
    await select.selectOption(`core.map:${id}`);
    await expect(page.locator("canvas")).toHaveAttribute("data-map", `core.map:${id}`);
    await expect(page.getByRole("status")).toContainText(size ?? "");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("original resource art loads on both authored resource maps", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "WebGL map art smoke test runs in Chromium");
  const errors: string[] = [];
  const models: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().endsWith(".glb") && response.ok()) models.push(response.url());
  });
  const expectedKinds: string[] = [];
  for (const map of [resources, training, resources]) {
    expectedKinds.push(...new Set(map.resources.map(({ kind }) => kind)));
    await page.goto(`/?map=core.${map.id}`);
    await expect(page.locator("canvas")).toHaveAttribute("data-map", `core.${map.id}`);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  expect(models).toHaveLength(expectedKinds.length);
  expect(new Set(models).size).toBe(new Set(expectedKinds).size);
  expect(errors).toEqual([]);
});

test("missing static map art identifies its model and leaves the picker usable", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "WebGL map art smoke test runs in Chromium");
  await page.route("**/*.glb", (route) => route.fulfill({ status: 404 }));
  await page.goto("/?map=core.map:sandbox-resources");
  await expect(page.getByRole("alert")).toContainText("Map model ore-cell:");
  await page.getByRole("combobox", { name: "Map" }).selectOption("core.map:sandbox-flat");
  await expect(page.locator("canvas")).toHaveAttribute("data-map", "core.map:sandbox-flat");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
