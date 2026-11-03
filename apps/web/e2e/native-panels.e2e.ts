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

test("native save gallery keeps typed search focused, imports files and opens result tabs", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  const gui = menu.locator(".native-menu-canvas");
  await expect(gui).toHaveAttribute("data-panel", "menu", { timeout: 30_000 });
  await clickNative(page, "Save game");
  await menu.getByLabel("Save name", { exact: true }).fill("Native gallery proof");
  await clickNative(page, "Save game");
  await expect(menu.locator("[data-saved]")).toHaveText("Game saved in this browser.");
  await clickNative(page, "Back");
  await clickNative(page, "Load game");
  await expect(gui).toHaveAttribute("data-panel", "load");
  await clickNative(page, "Native gallery proof");
  await expect(menu.locator("[data-save-detail] h2")).toHaveText("Native gallery proof");
  const search = await page.evaluate(
    () => Reflect.get(window, "nativeDrawnText").get("Search saves") as { x: number; y: number },
  );
  await page.mouse.click(search.x, search.y + 42);
  await page.keyboard.type("Native gallery proof", { delay: 25 });
  await expect(menu.getByLabel("Search saves", { exact: true })).toHaveValue(
    "Native gallery proof",
  );
  await expect(menu.locator(".save-row")).toHaveCount(1);
  await page.keyboard.type(" missing", { delay: 25 });
  await expect(menu.locator("[data-save-list]")).toHaveText("No saves match this search.");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(menu.getByLabel("Search saves", { exact: true })).toHaveValue("");
  await expect(menu.locator(".save-row")).toHaveCount(2);
  await clickNative(page, "Native gallery proof");
  await page.screenshot({ path: info.outputPath("native-load-desktop.png") });
  const chooser = page.waitForEvent("filechooser");
  await menu.getByLabel("Import saved game", { exact: true }).focus();
  await draw(page);
  await clickNative(page, "Import saved game");
  await (await chooser).setFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(menu.locator("[data-save-error]")).not.toBeEmpty();
  await page.setViewportSize({ width: 390, height: 844 });
  await draw(page);
  await page.screenshot({ path: info.outputPath("native-load-mobile.png") });
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Resume match", exact: true }).press("Enter");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  const result = page.getByRole("dialog", { name: "Defeat", exact: true });
  await expect(result.locator("canvas")).toHaveAttribute("data-panel", "results", {
    timeout: 30_000,
  });
  await clickNative(page, "Economy");
  await expect(result.getByRole("tab", { name: "Economy", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const metric = await page.evaluate(
    () => Reflect.get(window, "nativeDrawnText").get("History metric") as { x: number; y: number },
  );
  await page.mouse.click(metric.x, metric.y + 42);
  await draw(page);
  await clickNative(page, "Credits gathered");
  await expect(result.getByRole("combobox", { name: "History metric", exact: true })).toHaveValue(
    "creditsGathered",
  );
  const economy = result.getByRole("tabpanel", { name: "Economy", exact: true });
  await economy.locator("summary").focus();
  await draw(page);
  await clickNative(page, "Show sampled values");
  await expect(economy.locator("details")).toHaveAttribute("open", "");
  await page.screenshot({ path: info.outputPath("native-results-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await result.getByRole("tab", { name: "Economy", exact: true }).focus();
  await page.evaluate(() => Reflect.get(window, "nativeDrawnText").clear());
  await page.keyboard.press("Home");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "nativeDrawnText").has("Outcome")))
    .toBe(true);
  const totals = result.getByRole("region", { name: "Final Force totals", exact: true });
  await totals.focus();
  await draw(page);
  const before = await page.evaluate(
    () => Reflect.get(window, "nativeDrawnText").get("Your Force").x as number,
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "nativeDrawnText").get("Your Force").x as number),
    )
    .toBeLessThan(before);
  await page.keyboard.press("ArrowLeft");
  await draw(page);
  await page.screenshot({ path: info.outputPath("native-results-mobile.png") });
  await result.getByRole("button", { name: "Home", exact: true }).focus();
  await draw(page);
  await clickNative(page, "Home");
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

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
