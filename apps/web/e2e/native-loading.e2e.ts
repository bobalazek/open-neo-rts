import { expect, test } from "@playwright/test";
import { clickNativeText, nativeFrame, observeNativePaint } from "./native-paint";

test("native loading paints real stages, cancels, and recovers from a failed worker", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await observeNativePaint(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Reflect.set(window, "holdLoading", true);
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown) {
      const request = message as { type?: string; paused?: boolean };
      if (request.type === "pause" && request.paused === false) {
        Reflect.set(window, "releaseStartingMatch", () => post.call(this, message));
        return;
      }
      if ((message as { type?: string }).type === "init") {
        if (Reflect.get(window, "holdLoading")) return;
        if (Reflect.get(window, "failLoading")) {
          queueMicrotask(() => this.dispatchEvent(new ErrorEvent("error")));
          return;
        }
      }
      return post.call(this, message);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const loading = page.getByRole("dialog", { name: "Loading local match", exact: true });
  await expect(loading.locator("canvas")).toHaveAttribute("data-panel", "loading", {
    timeout: 60_000,
  });
  await expect(loading.getByRole("status")).toHaveText("Starting the normal match worker…", {
    timeout: 60_000,
  });
  await expect(loading.locator("progress")).toHaveJSProperty("value", 3);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(window, "nativePaintText").has("Starting the normal match worker…"),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath("desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("mobile.png") });
  await clickNativeText(page, "Cancel loading");
  await expect(loading).toHaveCount(0);
  await expect(page.locator("#game")).toHaveAttribute("data-setup", "ready");
  await expect(page.getByRole("heading", { name: "Skirmish", exact: true })).toBeFocused();
  await page.evaluate(() => {
    Reflect.set(window, "holdLoading", false);
    Reflect.set(window, "failLoading", true);
  });
  await page.getByRole("button", { name: "Start local match", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "loading-error", {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Match loading failed", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Match loading failed", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("error-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("error-desktop.png") });
  await page.evaluate(() => Reflect.set(window, "failLoading", false));
  await clickNativeText(page, "Retry loading");
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, "releaseStartingMatch")), {
      timeout: 60_000,
    })
    .toBe("function");
  await expect(page.locator("#game")).not.toHaveAttribute("data-session", "ready");
  await expect(loading).toBeVisible();
  await page.evaluate(() => {
    (Reflect.get(window, "releaseStartingMatch") as () => void)();
  });
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(loading).toHaveCount(0);
  await expect(page.locator("#game")).toBeFocused();
  await expect(page.locator("#game")).not.toHaveAttribute("data-panel");
  await expect(page).toHaveURL(/\/match$/);
  await page.keyboard.press(".");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Match menu", exact: true }).locator("[data-menu-state]"),
  ).toHaveText("Paused");
});
