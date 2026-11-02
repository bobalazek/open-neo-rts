import { expect, test } from "@playwright/test";

test("normal minimap masks shroud, pans locally, returns Home and submits owned orders through the worker", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Normal minimap WebGL smoke runs in Chromium");
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  const world = page.locator("#game"),
    minimap = page.locator(".hud-minimap canvas");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(minimap).toHaveAttribute("data-markers", "7");
  expect(
    await minimap.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return [
        ...(canvas.getContext("2d")?.getImageData(canvas.width - 4, canvas.height - 4, 1, 1).data ??
          []),
      ];
    }),
  ).toEqual([0, 0, 0, 255]);
  const bounds = await minimap.boundingBox();
  if (!bounds) throw new Error("Minimap bounds missing");
  await minimap.click({ position: { x: bounds.width * 0.75, y: bounds.height * 0.75 } });
  await expect(minimap).toHaveAttribute("data-camera-cell", /^9[56],9[56]$/);
  const panned = await minimap.getAttribute("data-camera-cell");
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-minimap [role=status]")).toHaveText(
    "Combat alerts are not available yet. No camera jump was made.",
  );
  await expect(minimap).toHaveAttribute("data-camera-cell", panned ?? "");
  await page.keyboard.press("Home");
  await expect(minimap).toHaveAttribute("data-camera-cell", /^(19|20),(19|20)$/);
  await page.getByRole("button", { name: /Idle builders 2/ }).click();
  async function orderCell(x: number, y: number) {
    const current = await minimap.boundingBox();
    if (!current) throw new Error("Minimap bounds missing");
    await page.mouse.click(
      current.x + (current.width * (x + 0.5)) / 128,
      current.y + (current.height * (y + 0.5)) / 128,
      { button: "right" },
    );
  }
  await orderCell(26, 23);
  await expect(page.locator("[data-details]")).toContainText("Moving");
  await world.focus();
  await page.keyboard.press("a");
  await orderCell(24, 25);
  await expect(page.locator("[data-details]")).toContainText("Attacking");
  await expect(world).not.toHaveAttribute("data-command-mode", "unit.attackMove");
  await expect(page.locator("[data-credits]")).toHaveText("Credits 5000");
  await page.screenshot({ path: info.outputPath("minimap-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Minimap", exact: true }).click();
  await expect(minimap).toBeVisible();
  expect(
    await page
      .locator(".match-hud")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("minimap-mobile.png") });
  await page.getByRole("button", { name: "Leave match", exact: true }).click();
  await expect(world).toBeHidden();
  await expect(minimap).toHaveCount(0);
  expect(errors).toEqual([]);
});
