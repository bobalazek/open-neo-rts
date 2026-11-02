import { expect, test } from "@playwright/test";

test("Home and saved skirmish setup start one real normal match after cancelled loading", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Normal screen WebGL smoke runs in Chromium");
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open Neo RTS" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("home-desktop.png") });
  await page.getByRole("button", { name: "Single player", exact: true }).click();
  await page.getByRole("button", { name: "Skirmish setup", exact: true }).click();
  await expect(page).toHaveURL(/\/skirmish$/);
  await page.getByLabel("Your spawn").selectOption("south-east");
  await expect(page.getByRole("button", { name: "Start local match" })).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveText(
    "Choose two different authored spawn positions.",
  );
  await page.getByLabel("Your spawn").selectOption("north-west");
  await page.getByLabel("Seed", { exact: true }).fill("42");
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.getByRole("status")).toHaveText("Setup saved in this browser.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("main").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath("setup-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Load saved setup" }).click();
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("42");
  await page.setViewportSize({ width: 1280, height: 720 });
  let release = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*.r8", async (route) => {
    await delayed;
    await route.continue();
  });
  await page.getByRole("button", { name: "Start local match" }).click();
  await expect(page.getByRole("heading", { name: "Loading local match" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel loading" }).click();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByRole("heading", { name: "Skirmish", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start local match" }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", {
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/match$/);
  await expect(page.locator("#game")).toHaveAttribute("data-mode", "controlled");
  await expect(page.locator("#game")).toHaveAttribute("data-entities", "7");
  await expect(page.getByText("Credits 5000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const tick = await page.locator("#game").getAttribute("data-tick");
  await page.screenshot({ path: info.outputPath("normal-match-desktop.png") });
  expect(await page.locator("#game").getAttribute("data-tick")).toBe(tick);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave match" }).click();
  await expect(page).toHaveURL(/\/skirmish$/);
  await expect(page.locator("#game")).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/\/skirmish$/);
  await expect(page.getByRole("status")).toHaveText(
    "There is no active match. Start a new local match below.",
  );
  expect(errors).toEqual([]);
});

test("failed worker loading can retry through the same quick-start path", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Normal screen WebGL smoke runs in Chromium");
  test.setTimeout(90_000);
  await page.route("**/sim-worker.js", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  await expect(
    page.getByRole("heading", { name: "Could not start this match. Retry, or return to setup." }),
  ).toBeVisible({ timeout: 60_000 });
  await page.unroute("**/sim-worker.js");
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", {
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/match$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave match" }).click();
  await expect(page.locator("#game")).toBeHidden();
});
