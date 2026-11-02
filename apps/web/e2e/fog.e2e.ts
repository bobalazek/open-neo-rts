import { expect, test } from "@playwright/test";

test("projected fog and remembered original structures render, clear hidden models, switch groups and reload", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Focused WebGL fog fixture runs in Chromium");
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/debug?fog=1");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-stage", "observed");
  await expect(canvas).toHaveAttribute("data-live", "2");
  await page.screenshot({ path: info.outputPath("observed.png") });
  await page.getByRole("button", { name: "Lose sight", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-stage", "hidden");
  await expect(canvas).toHaveAttribute("data-live", "0");
  await expect(canvas).toHaveAttribute("data-ghosts", "1");
  await expect(page.locator("[data-selection]")).toHaveText("Selected: none");
  await page.screenshot({ path: info.outputPath("remembered.png") });
  await page.getByRole("button", { name: "Re-observe empty site", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-stage", "empty");
  await expect(canvas).toHaveAttribute("data-ghosts", "0");
  await page.getByRole("button", { name: "Switch vision group", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-stage", "group");
  await expect(canvas).toHaveAttribute("data-live", "0");
  await expect(canvas).toHaveAttribute("data-ghosts", "0");
  await page.getByRole("button", { name: "Show debug no-fog", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-stage", "debug");
  await expect(canvas).toHaveAttribute("data-live", "2");
  await page.screenshot({ path: info.outputPath("explicit-debug-no-fog.png") });
  await page.getByRole("button", { name: "Reload fixture", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-stage", "observed");
  await expect(canvas).toHaveAttribute("data-live", "2");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});
