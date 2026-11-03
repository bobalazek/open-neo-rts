import { expect, type Page, test } from "@playwright/test";

const draw = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const points = new Map<string, { x: number; y: number }>();
    Reflect.set(window, "nativeDrawnText", points);
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      this: CanvasRenderingContext2D,
      ...args: Parameters<typeof fill>
    ) {
      const [text, x, y] = args;
      const size = Number.parseFloat(this.font.match(/[\d.]+px/)?.[0] ?? "16");
      const point = this.getTransform().transformPoint({
        x: x + this.measureText(text).width / 2,
        y: y - size / 3,
      });
      points.set(text, { x: point.x, y: point.y });
      Reflect.apply(fill, this, args);
    };
  });
});

// Target painted glyphs, then use real pointer input; semantic HTML controls stay clipped.
async function clickNative(page: Page, text: string) {
  await expect
    .poll(() => page.evaluate((text) => Reflect.get(window, "nativeDrawnText").has(text), text))
    .toBe(true);
  const point = await page.evaluate(
    (text) => Reflect.get(window, "nativeDrawnText").get(text) as { x: number; y: number },
    text,
  );
  await page.mouse.click(point.x, point.y);
  await draw(page);
}

test("native settings pointer controls save preferences and Back cancels reset preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings", {
    timeout: 30_000,
  });
  await clickNative(page, "Medium");
  await clickNative(page, "Low");
  await expect(page.getByLabel("Graphics preset", { exact: true })).toHaveValue("low");
  await clickNative(page, "Edge scrolling");
  await expect(page.getByLabel("Edge scrolling", { exact: true })).not.toBeChecked();
  await clickNative(page, "Apply and save");
  await expect(page.getByRole("status")).toHaveText("Settings saved on this device.");
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings", {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Graphics preset", { exact: true })).toHaveValue("low");
  await expect(page.getByLabel("Edge scrolling", { exact: true })).not.toBeChecked();
  await clickNative(page, "Reset to defaults");
  await expect(page.getByLabel("Graphics preset", { exact: true })).toHaveValue("medium");
  await clickNative(page, "Back");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Settings", exact: true }).press("Enter");
  await expect(page.getByLabel("Graphics preset", { exact: true })).toHaveValue("low");
});

test("native pause canvas saves a match, previews settings and resumes with modal Escape priority", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  const gui = menu.locator(".native-menu-canvas");
  await expect(gui).toHaveAttribute("data-panel", "menu", { timeout: 30_000 });
  const tick = await world.getAttribute("data-tick");
  await clickNative(page, "Normal (1×)");
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await clickNative(page, "Save game");
  await expect(gui).toHaveAttribute("data-panel", "save");
  await clickNative(page, await menu.getByLabel("Save name", { exact: true }).inputValue());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Native menu proof");
  await expect(menu.getByLabel("Save name", { exact: true })).toHaveValue("Native menu proof");
  await clickNative(page, "Save game");
  await expect(menu.locator("[data-saved]")).toHaveText("Game saved in this browser.");
  await clickNative(page, "Back");
  await expect(gui).toHaveAttribute("data-panel", "menu");
  await clickNative(page, "Settings");
  await expect(gui).toHaveAttribute("data-panel", "settings");
  await menu.getByLabel("Interface scale", { exact: true }).selectOption("150");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("150%");
  await page.setViewportSize({ width: 390, height: 844 });
  await menu.getByLabel("Reduced camera motion", { exact: true }).press("Space");
  await expect(menu.getByLabel("Reduced camera motion", { exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(gui).toHaveAttribute("data-panel", "menu");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("100%");
  expect(await world.getAttribute("data-tick")).toBe(tick);
  await menu.getByRole("button", { name: "Current controls", exact: true }).press("Enter");
  await expect(gui).toHaveAttribute("data-panel", "keys");
  await expect(menu).toContainText("the Set group and Add selection buttons store them.");
  await page.screenshot({ path: info.outputPath("controls-portrait.png") });
  await page.setViewportSize({ width: 568, height: 320 });
  await draw(page);
  await page.mouse.move(250, 170);
  await page.mouse.wheel(0, 900);
  await draw(page);
  await page.screenshot({ path: info.outputPath("controls-landscape-end.png") });
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await expect(gui).toHaveAttribute("data-panel", "menu");
  await page.setViewportSize({ width: 390, height: 844 });
  await draw(page);
  await clickNative(page, "Resume match");
  await expect(menu).not.toBeVisible();
  await expect
    .poll(async () => Number(await world.getAttribute("data-tick")))
    .toBeGreaterThan(Number(tick));
  expect(errors).toEqual([]);
});
