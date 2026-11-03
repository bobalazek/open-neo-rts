import { expect, test } from "@playwright/test";
import {
  clickNativeIcon,
  clickNativeText,
  nativeFrame,
  nativeIconPoint,
  nativeMapPoint,
  observeNativePaint,
} from "./native-paint";

test("native battlefield integrates selected commands, recipes, circular map and a working Resume", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await observeNativePaint(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(world).toHaveAttribute("data-hud", "native");
  await clickNativeText(page, ".");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const text = Reflect.get(window, "nativePaintText");
        return text.has("I") && text.has("B");
      }),
    )
    .toBe(true);
  const builderRecipe = page.locator(
    '[data-definition="core.structure:eastern-collective/barracks-complex"]',
  );
  const recipePoint = await nativeIconPoint(page, builderRecipe);
  await page.mouse.move(recipePoint.x, recipePoint.y);
  await nativeFrame(page);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "nativePaintText").has("Barracks Complex")))
    .toBe(true);
  await page.screenshot({ path: info.outputPath("desktop.png") });
  await page.keyboard.press("Control+1");
  await expect(page.locator("[data-groups] button").first()).toHaveAttribute("data-count", "1");
  const map = page.locator(".hud-minimap canvas");
  const pan = await nativeMapPoint(page, 0.7, 0.7);
  await page.mouse.click(pan.x, pan.y);
  await nativeFrame(page);
  await expect(map).toHaveAttribute("data-camera-cell", /^8[89],8[89]$/);
  await page.keyboard.press("Home");
  await expect(map).toHaveAttribute("data-camera-cell", /^(19|20),(19|20)$/);
  const menuButton = page.getByRole("button", { name: "Match menu", exact: true });
  await clickNativeIcon(page, menuButton);
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator("canvas")).toHaveAttribute("data-panel", "menu", { timeout: 30_000 });
  await page.screenshot({ path: info.outputPath("menu-desktop.png") });
  const tick = await world.getAttribute("data-tick");
  await clickNativeText(page, "Resume match");
  await expect(menu).not.toBeVisible();
  await expect
    .poll(async () => Number(await world.getAttribute("data-tick")))
    .toBeGreaterThan(Number(tick));
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("mobile.png") });
  await clickNativeIcon(page, menuButton);
  await expect(menu.locator("canvas")).toHaveAttribute("data-panel", "menu", { timeout: 30_000 });
  await page.screenshot({ path: info.outputPath("menu-mobile.png") });
  await clickNativeText(page, "Resume match");
  await expect(menu).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("Low graphics keeps terrain clicks, native refusal details and compact keyboard focus aligned", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await observeNativePaint(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "open-neo-rts.settings.v1",
      JSON.stringify({
        format: 1,
        quality: "low",
        uiScale: 150,
        cameraSpeed: 100,
        edgeScroll: false,
        reducedMotion: true,
      }),
    ),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-hud", "native", { timeout: 60_000 });
  await clickNativeText(page, ".");
  const unavailable = page.locator(
    '[data-definition="core.structure:eastern-collective/command-center"]',
  );
  await clickNativeIcon(page, unavailable);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...Reflect.get(window, "nativePaintText").keys()].some((value) =>
          String(value).includes("Unavailable to build in this match"),
        ),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath("low150.png") });
  await world.focus();
  await page.keyboard.press("q");
  await expect(world).toHaveAttribute("data-command-mode", "unit.move");
  await page.mouse.click(510, 500);
  await expect(world).not.toHaveAttribute("data-command-mode", "unit.move");
  await page.setViewportSize({ width: 390, height: 844 });
  await world.focus();
  await page.keyboard.press("b");
  await unavailable.focus();
  await expect(unavailable).toBeFocused();
  await expect(page.locator(".hud-build-panel")).toHaveCSS("display", "block");
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...Reflect.get(window, "nativePaintText").keys()].some((value) =>
          String(value).includes("Unavailable to build in this match"),
        ),
      ),
    )
    .toBe(true);
});
