import { expect, test } from "@playwright/test";
import { clickNativeText, nativeFrame, nativeTextPoint, observeNativePaint } from "./native-paint";

test.beforeEach(async ({ page }) => {
  await observeNativePaint(page);
});

test("native Field Manual searches actual roster facts, clears empty results and recovers model loading", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready", { timeout: 30_000 });
  await clickNativeText(page, "Field Manual");
  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "manual", { timeout: 30_000 });
  await expect(page.locator("[data-panel-list] > button")).toHaveCount(15);
  const point = await nativeTextPoint(page, "Search the roster");
  await page.mouse.click(point.x, point.y + 32);
  await page.keyboard.type("dragon");
  await expect(page.getByLabel("Search the roster")).toHaveValue("dragon");
  await expect(page.locator("[data-panel-list] > button")).toHaveCount(1);
  const detail = page.locator("[data-panel-detail]");
  await expect(detail.getByRole("heading", { name: "Dragon Tank", exact: true })).toHaveText(
    "Dragon Tank",
  );
  await expect(
    detail.getByRole("row", { name: "Cost 1000 credits, 100 materials", exact: true }),
  ).toHaveCount(1);
  await expect(
    detail.getByRole("row", { name: "Build time (seconds) 15", exact: true }),
  ).toHaveCount(1);
  await nativeTextPoint(page, "1000 credits, 100 materials");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("unmatched roster name");
  await expect(page.locator("[data-panel-list]")).toContainText("No matching entries");
  await expect(detail).toBeEmpty();
  await page.getByLabel("Search the roster").fill("war factory");
  const produces = detail
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Produces", exact: true }) });
  await expect(produces).toContainText("Dragon Tank");
  await expect(produces).toContainText("Metamorphic APC");
  await expect(produces).not.toContainText("Flame Tank");
  await expect(produces).not.toContainText("Mobile EMP");
  await page.getByLabel("Search the roster").fill("rocket");
  await detail.getByRole("button", { name: "Inspect model" }).focus();
  await nativeFrame(page);
  await page.route("**/*.glb", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await clickNativeText(page, "Inspect model");
  const model = page.getByRole("dialog", { name: "Rocket Trooper", exact: true });
  await expect(model.getByRole("alert")).toContainText("model could not be loaded", {
    timeout: 30_000,
  });
  await page.unroute("**/*.glb");
  await model.getByRole("button", { name: "Retry loading", exact: true }).press("Enter");
  await expect(model.getByRole("status")).toBeEmpty({ timeout: 30_000 });
  await expect(model.getByRole("alert")).toBeEmpty();
  await model.locator(".manual-model-canvas").focus();
  await page.keyboard.press("Escape");
  await expect(model).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "Inspect model" })).toBeFocused();
  await expect(page).toHaveURL(/\/manual$/);
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("paused-match Field Manual retains its worker and returns to the same match", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  const gui = menu.locator(".native-menu-canvas");
  await expect(gui).toHaveAttribute("data-panel", "menu", { timeout: 30_000 });
  await expect(menu.getByRole("button", { name: "Field Manual", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "Field Manual", exact: true }).press("Enter");
  await expect(gui).toHaveAttribute("data-panel", "manual");
  const tick = await world.getAttribute("data-tick");
  await menu.getByLabel("Search the roster").fill("extractor");
  await expect(menu.getByRole("heading", { name: "Resource Extractor", exact: true })).toHaveText(
    "Resource Extractor",
  );
  await expect(menu.getByRole("row", { name: "Cost 800 credits", exact: true })).toHaveCount(1);
  await nativeTextPoint(page, "800 credits");
  await clickNativeText(page, "Units and structures");
  await clickNativeText(page, "Units");
  await expect(menu.locator("[data-panel-detail]")).toBeEmpty();
  expect(await world.getAttribute("data-tick")).toBe(tick);
  await page.keyboard.press("Escape");
  await expect(gui).toHaveAttribute("data-panel", "menu");
  await menu.getByRole("button", { name: "Resume match", exact: true }).press("Enter");
  await expect(menu).not.toBeVisible();
  await expect
    .poll(async () => Number(await world.getAttribute("data-tick")))
    .toBeGreaterThan(Number(tick));
  await expect(page).toHaveURL(/\/match$/);
});
