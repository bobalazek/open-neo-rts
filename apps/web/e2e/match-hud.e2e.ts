import { expect, test } from "@playwright/test";

test("normal HUD uses real production receipts, selection groups and cancellable placement", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Normal HUD WebGL smoke runs in Chromium");
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await page.getByRole("button", { name: /Idle builders 2/ }).click();
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  await expect(
    page.locator('[data-definition="core.structure:eastern-collective/command-center"]'),
  ).toBeDisabled();
  await expect(page.locator('[data-definition*="technology-center"]')).toHaveCount(0);
  await expect(page.locator('[data-definition*="quantum-nexus"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Set group", exact: true }).click();
  await expect(page.locator("[data-groups] button").first()).toHaveText("1: 1");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 0");
  await page.keyboard.press("1");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  await page
    .locator('[data-definition="core.structure:eastern-collective/industrial-reactor"]')
    .click();
  await expect(canvas).toHaveAttribute("data-command-mode", "economy.build");
  await page.keyboard.press("v");
  await expect(page.locator("p[data-mode]")).toContainText("90°");
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveAttribute("data-command-mode", "economy.build");
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await expect(page.locator("[data-credits]")).toHaveText("Credits 5000");
  await page.screenshot({ path: info.outputPath("hud-builder-desktop.png") });
  await page
    .locator('[data-definition="core.structure:eastern-collective/industrial-reactor"]')
    .click();
  await page.mouse.move(735, 350);
  await page.mouse.click(735, 350);
  await expect(page.locator("[data-credits]")).toHaveText("Credits 4100");
  await expect(
    page.getByRole("button", { name: "Select Industrial Reactor site", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel site (100%)", exact: true }).click();
  await expect(page.locator("[data-credits]")).toHaveText("Credits 5000");
  await page.getByRole("button", { name: /Idle producers 1/ }).click();
  const technician = page.locator(
    '[data-definition="core.unit:eastern-collective/field-technician"]',
  );
  await expect(technician).toBeEnabled();
  // Pause as paid work first paints; slow driver round trips can exceed the authored eight seconds.
  await technician.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const paid = new MutationObserver(() => {
          const pause = document.querySelector<HTMLButtonElement>("[data-pause]");
          if (
            document.querySelector("[data-credits]")?.textContent === "Credits 4550" &&
            document
              .querySelector("[data-queue]")
              ?.textContent?.includes("Field Technician · slot 1") &&
            pause?.textContent === "Pause"
          ) {
            paid.disconnect();
            pause.click();
            resolve();
          }
        });
        paid.observe(document.body, { subtree: true, childList: true, characterData: true });
        (element as HTMLButtonElement).click();
      }),
  );
  await expect(page.locator("[data-credits]")).toHaveText("Credits 4550");
  await expect(page.locator("[data-queue]")).toContainText("Field Technician · slot 1");
  await expect(page.getByRole("button", { name: "Cancel item", exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("hud-production-desktop.png") });
  // Cancel when the resumed UI enables the real button, before another remote-control round trip.
  await page.getByRole("button", { name: "Resume", exact: true }).evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const resumed = new MutationObserver(() => {
          const cancel = document.querySelector<HTMLButtonElement>("[data-queue] button");
          if (
            document.querySelector("[data-pause]")?.textContent === "Pause" &&
            cancel &&
            !cancel.disabled
          ) {
            resumed.disconnect();
            cancel.click();
            resolve();
          }
        });
        resumed.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["disabled"],
        });
        (element as HTMLButtonElement).click();
      }),
  );
  await expect(page.locator("[data-queue] li")).toHaveCount(0);
  await expect(page.locator("[data-credits]")).toHaveText("Credits 5000");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Leave match" })).toBeVisible();
  expect(
    await page
      .locator(".match-hud")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("hud-mobile.png") });
  await page.getByRole("button", { name: "Leave match" }).click();
  await expect(canvas).toBeHidden();
  expect(errors).toEqual([]);
});
