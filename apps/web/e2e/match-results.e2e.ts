import { expect, test } from "@playwright/test";

test("a terminal result arriving before a stale surrender resume rejection stays visible", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded worker ordering regression");
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      override postMessage(message: unknown) {
        const request = message as { type?: string; paused?: boolean };
        if (
          Reflect.get(window, "raceSurrender") &&
          request.type === "pause" &&
          request.paused === false
        ) {
          Reflect.set(window, "raceSurrender", false);
          // End through actual granted worker commands before delivering the held resume.
          const ended = (event: MessageEvent) => {
            if (!event.data.state?.snapshot.victory?.result) return;
            this.removeEventListener("message", ended);
            super.postMessage(message);
          };
          this.addEventListener("message", ended);
          super.postMessage({ id: 9_000_000, type: "pause", paused: false });
          super.postMessage({
            id: 9_000_001,
            type: "command",
            command: { type: "match.surrender", payload: { force: 0 } },
          });
        } else super.postMessage(message);
      }
    };
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-session", "ready", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, "raceSurrender", true));
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Defeat", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Could not start this match. Retry, or return to setup." }),
  ).toHaveCount(0);
});

test("real surrender ends a paused normal match once, rematch creates a new worker and Home disposes it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded normal-screen WebGL journey");
  test.setTimeout(120_000);
  const errors: string[] = [];
  let workers = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", () => workers++);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/match$/);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  const result = page.getByRole("dialog", { name: "Defeat", exact: true });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Team 2 wins");
  await expect(result.getByRole("row", { name: "Your Force Surrendered" })).toBeVisible();
  await expect(result.getByRole("row", { name: "Force 2 Survived" })).toBeVisible();
  const tick = await canvas.getAttribute("data-tick");
  await page.keyboard.press("Escape");
  await expect(result).toBeVisible();
  await page.screenshot({ path: info.outputPath("match-result-desktop.png") });
  expect(await canvas.getAttribute("data-tick")).toBe(tick);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("match-result-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await result.getByRole("button", { name: "Rematch", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-entities", "7");
  expect(workers).toBe(2);
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Open Neo RTS" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).toBeHidden();
  expect(errors).toEqual([]);
});
