import { expect, type Locator, type Page, test } from "@playwright/test";
import { nativeFrame, nativeTextPoint, observeNativePaint } from "./native-paint";

async function observeSelection(page: Page) {
  await observeNativePaint(page);
  await page.addInitScript(() => {
    Reflect.set(window, "selectionPaint", []);
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      if (
        this.canvas.width >= innerWidth * 0.6 &&
        this.canvas.height >= innerHeight * 0.6 &&
        ((this.fillStyle === "#ddc382" && Math.abs(this.globalAlpha - 0.35) < 0.01) ||
          (this.fillStyle === "#eff1e9" && width === 2 && height > 10))
      ) {
        const point = this.getTransform().transformPoint({ x, y });
        Reflect.get(window, "selectionPaint").push({
          x: (point.x * innerWidth) / this.canvas.width,
          y: (point.y * innerHeight) / this.canvas.height,
          width: (width * innerWidth) / this.canvas.width,
          height: (height * innerHeight) / this.canvas.height,
          selection: this.fillStyle === "#ddc382",
          expected:
            (this.measureText(Reflect.get(window, "selectionNeedle") ?? "").width * innerWidth) /
            this.canvas.width,
        });
      }
      Reflect.apply(fill, this, [x, y, width, height]);
    };
  });
}

async function range(
  page: Page,
  field: Locator,
  start: number,
  end: number,
  direction: "forward" | "backward" = "forward",
) {
  await field.focus();
  await field.evaluate(
    (input: HTMLInputElement, { start, end, direction }) => {
      Reflect.set(window, "selectionPaint", []);
      Reflect.set(window, "selectionNeedle", input.value.slice(start, end));
      input.setSelectionRange(start, end, direction);
    },
    { start, end, direction },
  );
  await paintedRange(page, start !== end);
}

async function paintedRange(page: Page, selection: boolean) {
  await expect
    .poll(() =>
      page.evaluate(
        (selection) =>
          Reflect.get(window, "selectionPaint").some(
            (paint: { selection: boolean; width: number; expected: number }) =>
              paint.selection === selection &&
              paint.width > 0 &&
              (!selection || Math.abs(paint.width - paint.expected) < 1),
          ),
        selection,
      ),
    )
    .toBe(true);
  await nativeFrame(page);
}

test("semantic setup editing paints its caret and range and returns to native pointer editing", async ({
  page,
}, info) => {
  await observeSelection(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/skirmish");
  await expect(page.locator("#game")).toHaveAttribute("data-setup", "ready", { timeout: 30_000 });
  const seed = page.getByLabel("Seed", { exact: true });
  await seed.fill("1234567890");
  // macOS WebKit uses Home for document navigation, so start at an explicit input offset.
  await seed.evaluate((input: HTMLInputElement) => input.setSelectionRange(0, 0));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.evaluate(() => {
    Reflect.set(window, "selectionPaint", []);
    Reflect.set(window, "selectionNeedle", "345");
  });
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await paintedRange(page, true);
  expect(
    await seed.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
  ).toEqual([2, 5]);
  await page.screenshot({ path: info.outputPath("setup-selection-desktop.png") });
  await page.keyboard.type("99");
  await expect(seed).toHaveValue("129967890");
  await page.evaluate(() => Reflect.set(window, "selectionPaint", []));
  await page.keyboard.press("ArrowLeft");
  await paintedRange(page, false);
  const label = await nativeTextPoint(page, "Seed");
  await page.mouse.click(label.x, label.y + 42);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("73");
  await expect(seed).toHaveValue("73");
  await page.setViewportSize({ width: 390, height: 844 });
  await seed.fill("1234567890");
  await range(page, seed, 2, 5, "backward");
  await page.screenshot({ path: info.outputPath("setup-selection-mobile.png") });
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await expect(page.locator("#game")).not.toHaveAttribute("data-setup", "ready");
  expect(errors).toEqual([]);
});

test("named save and both galleries paint Unicode and search selections without duplicate editing", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await observeSelection(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator("canvas")).toHaveAttribute("data-panel", "menu", { timeout: 30_000 });
  await menu.getByRole("button", { name: "Save game", exact: true }).press("Enter");
  await expect(menu.locator("canvas")).toHaveAttribute("data-panel", "save");
  const name = menu.getByLabel("Save name", { exact: true });
  await name.fill("Orbit 🚀 save");
  await range(page, name, 6, 8, "backward");
  await page.screenshot({ path: info.outputPath("save-selection-desktop.png") });
  await page.keyboard.type("TANK");
  await expect(name).toHaveValue("Orbit TANK save");
  await menu.getByRole("button", { name: "Save game", exact: true }).press("Enter");
  await expect(menu.locator("[data-saved]")).toHaveText("Game saved in this browser.");
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Load game", exact: true }).press("Enter");
  await expect(menu.locator("canvas")).toHaveAttribute("data-panel", "load");
  const search = menu.getByLabel("Search saves", { exact: true });
  await search.fill("Orbit");
  await range(page, search, 1, 4);
  await expect(menu.locator(".save-row")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await range(page, search, 1, 4, "backward");
  await page.screenshot({ path: info.outputPath("search-selection-mobile.png") });
  await page.goto("/load");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "load", { timeout: 30_000 });
  const standalone = page.getByLabel("Search saves", { exact: true });
  await standalone.fill("Orbit");
  await range(page, standalone, 0, 5);
  await page.keyboard.type("missing");
  await expect(standalone).toHaveValue("missing");
  await expect(page.locator("[data-save-list]")).toHaveText("No saves match this search.");
  expect(errors).toEqual([]);
});
