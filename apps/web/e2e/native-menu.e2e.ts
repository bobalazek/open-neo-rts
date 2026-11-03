import { expect, test } from "@playwright/test";

test("native Home canvas buttons, keyboard submenu and resize keep navigation working", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready", { timeout: 30_000 });
  await expect(page.locator("main")).toHaveClass(/home-native/);
  await expect(page.locator("#game")).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#game")).toHaveAttribute("aria-hidden", "true");
  // Coordinates hit the visible Babylon buttons, not the clipped semantic controls.
  await page.mouse.click(180, 354);
  await expect(page.getByRole("button", { name: "Skirmish setup", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Single player", exact: true })).toBeFocused();
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready");
  await page.mouse.click(180, 412);
  await expect(page).toHaveURL(/\/settings$/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready", { timeout: 30_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(180, 582);
  await expect(page.getByRole("button", { name: "Skirmish setup", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/skirmish$/);
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready", { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test("Home retains visible functional controls when graphics initialization fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (/webgl|webgpu/i.test(args[0])) return null;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("The 3D menu could not start", {
    timeout: 30_000,
  });
  await expect(page.locator("main")).not.toHaveClass(/home-native/);
  await page.getByRole("button", { name: "Single player", exact: true }).click();
  await page.getByRole("button", { name: "Skirmish setup", exact: true }).click();
  await expect(page).toHaveURL(/\/skirmish$/);
});
