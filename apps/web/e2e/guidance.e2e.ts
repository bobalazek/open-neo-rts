import { expect, test } from "@playwright/test";
import { clickNativeText, nativeTextPoint, observeNativePaint } from "./native-paint";

test("guidance is staged in native Settings and once-only hints link to the paused match manual", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await observeNativePaint(page);
  await page.goto("/");
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready", { timeout: 30_000 });
  await clickNativeText(page, "Settings");
  await clickNativeText(page, "Guidance");
  const select = page.getByLabel("Contextual hints", { exact: true });
  await expect(select).toHaveValue("important");
  await clickNativeText(page, "Important");
  await clickNativeText(page, "All");
  await clickNativeText(page, "Back");
  await clickNativeText(page, "Guidance");
  await expect(select).toHaveValue("important");
  await clickNativeText(page, "Important");
  await clickNativeText(page, "All");
  await clickNativeText(page, "Apply and save");
  await expect(page.getByRole("status")).toContainText("saved");
  await clickNativeText(page, "Back");
  await clickNativeText(page, "Back");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const hint = page.locator("[data-hint]");
  await expect(hint).not.toHaveAttribute("hidden", "", { timeout: 30_000 });
  await expect(hint).toContainText("builder has been idle");
  await nativeTextPoint(page, "Dismiss hint");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("open-neo-rts.guidance.v1") ?? "{}").seen,
    ),
  ).toContain("idle-builder");
  await clickNativeText(page, "More in Field Manual");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator(".native-menu-canvas")).toHaveAttribute("data-panel", "manual");
  await expect(menu.locator("[data-panel-detail] h2")).toHaveText("Field Technician");
  const tick = await world.getAttribute("data-tick");
  await nativeTextPoint(page, "Field Technician");
  expect(await world.getAttribute("data-tick")).toBe(tick);
  await page.keyboard.press("Escape");
  await menu.getByRole("button", { name: "Resume match", exact: true }).press("Enter");
  await page.getByRole("button", { name: "HUD help", exact: true }).press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...(Reflect.get(window, "nativePaintText") as Map<string, unknown>).keys()].some((line) =>
          line.startsWith("Resources, power"),
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator("[data-hud-help]")).not.toHaveAttribute("hidden", "");
  await page.getByRole("button", { name: "HUD help", exact: true }).press("Enter");
  await expect(page.locator("[data-hud-help]")).toHaveAttribute("hidden", "");
  await page.getByRole("button", { name: "Dismiss hint", exact: true }).press("Enter");
  await expect(hint).toHaveAttribute("hidden", "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Pause", exact: true }).press("Enter");
  await page.getByRole("button", { name: /Idle producers/ }).press("Enter");
  const selected = await page.locator("[data-summary]").getAttribute("data-name");
  expect(selected).toBeTruthy();
  await world.focus();
  await page.keyboard.press("KeyI");
  await page.evaluate(() => Reflect.get(window, "nativePaintText").delete("Base statistics"));
  await page.locator("[data-selection-manual]").press("Enter");
  await expect(menu.locator(".native-menu-canvas")).toHaveAttribute("data-panel", "manual");
  await expect(menu.locator("[data-panel-detail] h2")).toHaveText(selected!);
  await expect(menu.locator("[data-panel-detail] h2")).toBeFocused();
  await expect(menu.locator("[data-panel-list] > button")).toHaveCount(19);
  const point = await nativeTextPoint(page, "Base statistics");
  expect(point.y).toBeGreaterThan(0);
  expect(point.y).toBeLessThan(844);
});

test("native manual finds concepts and derives the current controls page", async ({ page }) => {
  await observeNativePaint(page);
  await page.goto("/manual");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "manual", { timeout: 30_000 });
  await clickNativeText(page, "All entries");
  await clickNativeText(page, "Concepts and controls");
  await expect(page.locator("[data-panel-list] > button")).toHaveCount(4);
  await page.getByLabel("Search the manual").fill("fog and scouting");
  const detail = page.locator("[data-panel-detail]");
  await expect(detail.locator("h2")).toHaveText("Fog and scouting");
  await nativeTextPoint(page, "Fog and scouting");
  await expect(detail).toContainText("last known position");
  await page.getByLabel("Search the manual").fill("current controls");
  await expect(detail.locator("h2")).toHaveText("Current controls");
  await expect(detail).not.toContainText("{panUp}");
  await expect(detail).toContainText("Shift");
  await page.getByLabel("Search the manual").fill("missing guide phrase");
  await expect(detail).toBeEmpty();
  await expect(page.locator("[data-panel-list]")).toContainText("No matching entries");
});
