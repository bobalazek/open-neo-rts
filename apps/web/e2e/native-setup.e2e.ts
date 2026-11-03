import { expect, test } from "@playwright/test";

test("native setup edits and validates fields, saves, starts and disposes one real skirmish", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/skirmish");
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-setup", "ready", { timeout: 30_000 });
  await expect(canvas).toHaveAttribute("aria-hidden", "true");
  await expect(canvas).toHaveAttribute("tabindex", "-1");
  // Hit Babylon's visible spawn picker and its fourth option.
  await page.mouse.click(480, 195);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(480, 374);
  await expect(page.getByLabel("Your spawn")).toHaveValue("south-east");
  await expect(page.getByRole("button", { name: "Start local match" })).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveText(
    "Choose two different authored spawn positions.",
  );
  await page.mouse.click(480, 195);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(480, 242);
  await expect(page.getByLabel("Your spawn")).toHaveValue("north-west");
  await page.mouse.click(200, 558);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("73");
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("73");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Starting credits")).toBeFocused();
  await page.getByLabel("Starting credits").fill("6000");
  await page.mouse.click(200, 862);
  await expect(page.getByRole("status")).toHaveText("Setup saved in this browser.");
  await page.getByLabel("Seed", { exact: true }).fill("99");
  await page.mouse.click(500, 862);
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("73");
  await expect(page.getByRole("status")).toHaveText("Saved setup loaded.");
  await page.mouse.click(1065, 862);
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/match$/);
  await page.goBack();
  await expect(canvas).toHaveAttribute("data-setup", "ready", { timeout: 30_000 });
  await expect(canvas).not.toHaveAttribute("data-session", "ready");
  await expect(canvas).toHaveAttribute("tabindex", "-1");
  expect(errors).toEqual([]);
});

test("native setup can scroll to rules and retains its HTML form without graphics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/skirmish");
  await expect(page.locator("#game")).toHaveAttribute("data-setup", "ready", { timeout: 30_000 });
  await page.getByLabel("Seed", { exact: true }).focus();
  await page.getByLabel("Seed", { exact: true }).fill("0");
  await expect(page.getByRole("button", { name: "Start local match" })).toBeEnabled();
  await page.getByLabel("Unit veterancy").press("Space");
  await expect(page.getByLabel("Unit veterancy")).not.toBeChecked();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(37, 639);
  await expect(page.getByLabel("Unit veterancy")).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
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
  await page.reload();
  await expect(page.locator("#game")).toBeHidden();
  await page.getByLabel("Seed", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.getByRole("status")).toHaveText("Setup saved in this browser.");
});

test("abandoned setup graphics initialization cannot change the running match canvas", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "gpu", {
      value: {
        requestAdapter: () =>
          ++calls === 1
            ? new Promise((resolve) => Reflect.set(window, "releaseOldSetup", () => resolve(null)))
            : Promise.resolve(null),
      },
    });
  });
  await page.goto("/skirmish");
  await page.waitForFunction(() => typeof Reflect.get(window, "releaseOldSetup") === "function");
  await page.getByRole("button", { name: "Start local match" }).press("Enter");
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await page.evaluate(() => Reflect.get(window, "releaseOldSetup")());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
      ),
  );
  await expect(canvas).toHaveAttribute("data-session", "ready");
  await expect(canvas).toHaveAttribute("tabindex", "0");
});
