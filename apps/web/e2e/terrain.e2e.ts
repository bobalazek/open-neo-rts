import { expect, test } from "@playwright/test";

test("terrain picker loads each authored map and survives an unknown deep link", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "WebGL terrain smoke test runs in Chromium");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:4320/debug?map=unknown");
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
