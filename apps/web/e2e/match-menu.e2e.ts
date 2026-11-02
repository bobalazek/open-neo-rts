import { expect, test } from "@playwright/test";

test("browser Back disposes an unsaved in-match settings preview", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Bounded normal settings/WebGL journey");
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator("[data-menu-state]")).toHaveText("Paused");
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await menu.getByLabel("Interface scale", { exact: true }).selectOption("150");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("150%");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("100%");
  expect(await page.evaluate(() => localStorage.getItem("open-neo-rts.settings.v1"))).toBeNull();
  await expect(page.locator("#game")).not.toHaveAttribute("data-session", "ready");
});

test("shared device settings preview, cancel, persist and apply live across interface scales", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded normal settings/WebGL journey");
  test.setTimeout(120_000);
  await page.goto("/settings");
  await page.getByLabel("Interface scale", { exact: true }).selectOption("150");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("150%");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("100%");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Graphics preset", { exact: true }).selectOption("low");
  await page.getByLabel("Interface scale", { exact: true }).selectOption("125");
  await page.getByLabel("Camera pan speed", { exact: true }).selectOption("150");
  await page.getByLabel("Edge scrolling", { exact: true }).uncheck();
  await page.getByLabel("Reduced camera motion", { exact: true }).check();
  await page.getByRole("button", { name: "Apply and save" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved on this device.");
  await page.reload();
  await expect(page.getByLabel("Interface scale", { exact: true })).toHaveValue("125");
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("125%");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator("[data-menu-state]")).toHaveText("Paused");
  const tick = await page.locator("#game").getAttribute("data-tick");
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(menu.getByLabel("Graphics preset", { exact: true })).toHaveValue("low");
  await expect(menu.getByLabel("Camera pan speed", { exact: true })).toHaveValue("150");
  await expect(menu.getByLabel("Edge scrolling", { exact: true })).not.toBeChecked();
  await menu.getByLabel("Interface scale", { exact: true }).selectOption("75");
  await menu.getByRole("button", { name: "Apply and save" }).click();
  await menu.getByRole("button", { name: "Back", exact: true }).click();
  expect(await page.locator("#game").getAttribute("data-tick")).toBe(tick);
  await menu.getByRole("button", { name: "Resume match", exact: true }).click();
  const top = await page.locator(".match-top").boundingBox(),
    bottom = await page.locator(".match-hud").boundingBox();
  if (!top || !bottom) throw new Error("HUD layout missing");
  const centre = (top.y + top.height + bottom.y) / 2;
  await page.mouse.move(620, centre - 25);
  await page.mouse.down();
  await page.mouse.move(660, centre + 25, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("[data-details]")).toContainText("Command Center");
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await menu.getByLabel("Interface scale", { exact: true }).selectOption("150");
  await menu.getByRole("button", { name: "Apply and save" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await menu.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath("settings-mobile-150.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await menu.getByRole("button", { name: "Back", exact: true }).click();
  await menu.getByRole("button", { name: "Resume match", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await expect(menu).not.toBeVisible();
  await page.getByRole("button", { name: "Leave match", exact: true }).click();
  await expect(page).toHaveURL(/\/skirmish$/);
});

test("Esc priority, real speed controls, restart confirmation and menu surrender own one session", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded normal menu/WebGL journey");
  test.setTimeout(120_000);
  let workers = 0;
  const errors: string[] = [];
  page.on("worker", () => workers++);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: /Idle builders 2/ }).click();
  await page
    .locator('[data-definition="core.structure:eastern-collective/industrial-reactor"]')
    .click();
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveAttribute("data-command-mode", "economy.build");
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 0");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator("[data-menu-state]")).toHaveText("Paused");
  const tick = await canvas.getAttribute("data-tick");
  await expect(menu.getByRole("button", { name: "Save game", exact: true })).toBeDisabled();
  await menu.getByLabel("Game speed", { exact: true }).selectOption("0.75");
  await expect(page.locator("[data-speed]")).toHaveText("Speed 0.75×");
  await menu.getByLabel("Game speed", { exact: true }).selectOption("1.5");
  await menu.getByRole("button", { name: "Objectives", exact: true }).click();
  await expect(menu).toContainText("Walls do not keep a Force active");
  await page.keyboard.press("Escape");
  await expect(menu.getByRole("button", { name: "Resume match", exact: true })).toBeVisible();
  expect(await canvas.getAttribute("data-tick")).toBe(tick);
  await page.screenshot({ path: info.outputPath("match-menu-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await page.keyboard.press("Minus");
  await expect(page.locator("[data-speed]")).toHaveText("Speed 1×");
  await page.keyboard.press("Equal");
  await expect(page.locator("[data-speed]")).toHaveText("Speed 1.5×");
  await page.keyboard.press("Pause");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.keyboard.press("Pause");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await menu.getByRole("button", { name: "Restart match", exact: true }).click();
  expect(workers).toBe(1);
  page.once("dialog", (dialog) => dialog.accept());
  await menu.getByRole("button", { name: "Restart match", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  expect(workers).toBe(2);
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await menu.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(menu).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await menu.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Defeat", exact: true })).toBeVisible();
  await expect(menu).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("blocked settings storage rolls back preview without claiming persistence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "open-neo-rts.settings.v1") throw new DOMException("Quota", "QuotaExceededError");
      set.call(this, key, value);
    };
  });
  await page.goto("/settings");
  await page.getByLabel("Interface scale", { exact: true }).selectOption("150");
  await page.getByRole("button", { name: "Apply and save" }).click();
  await expect(page.getByRole("alert")).toContainText("Your saved settings were kept");
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe("100%");
  expect(await page.evaluate(() => localStorage.getItem("open-neo-rts.settings.v1"))).toBeNull();
});
