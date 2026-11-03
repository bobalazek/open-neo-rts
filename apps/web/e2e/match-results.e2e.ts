import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { MatchRecord, SeatSnapshot } from "../../../packages/sim/src";
import { nativeTextPoint, observeNativePaint } from "./native-paint";

test("real paid production reaches the frozen final totals on desktop and narrow layouts", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await observeNativePaint(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        Reflect.set(window, "recordWorker", this);
        this.addEventListener("message", (event) => {
          if (event.data.state?.snapshot)
            Reflect.set(window, "lastResultSnapshot", event.data.state.snapshot);
        });
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/match$/);
  const refused = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const worker = Reflect.get(window, "recordWorker") as Worker;
        const listener = ({ data }: MessageEvent) => {
          if (data.id !== 9_000_004) return;
          worker.removeEventListener("message", listener);
          resolve(data.error ?? "unexpected acceptance");
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ id: 9_000_004, type: "export-match-record" });
      }),
  );
  expect(refused).toContain("Finish the normal match");
  const producer = await nativeTextPoint(page, ",");
  await page.mouse.move(producer.x, producer.y);
  await page.mouse.down();
  // A live snapshot between down/up must not replace the label and cancel WebKit's click.
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await page.getByRole("button", { name: "Resume", exact: true }).press("Enter");
  await page
    .locator('[data-definition="core.unit:eastern-collective/field-technician"]')
    .press("Enter");
  await expect(page.locator("[data-credits]")).toHaveText("Credits 4550");
  await expect(page.getByRole("button", { name: /Idle builders 3/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".match-notices button")).toContainText("Unit ready");
  const live = await page.evaluate(async () => {
    const worker = Reflect.get(window, "recordWorker") as Worker;
    let id = 8_000_000;
    const request = (data: object) =>
      new Promise<void>((resolve, reject) => {
        const current = id++;
        const listener = (event: MessageEvent) => {
          if (event.data.id !== current) return;
          worker.removeEventListener("message", listener);
          if (event.data.error) reject(new Error(event.data.error));
          else resolve();
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ ...data, id: current });
      });
    await request({ type: "pause", paused: true });
    while ((Reflect.get(window, "lastResultSnapshot") as { tick: number }).tick < 650)
      await request({ type: "step" });
    return Reflect.get(window, "lastResultSnapshot") as SeatSnapshot;
  });
  expect(live.statistics?.map((row) => row.force)).toEqual([0]);
  expect(live.statistics?.[0]?.details).toBeUndefined();
  await page.getByRole("button", { name: "Surrender", exact: true }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "Defeat", exact: true });
  await expect(dialog).toBeVisible();
  const cells = dialog.getByRole("row", { name: /Your Force Surrendered/ }).getByRole("cell");
  await expect(cells.nth(2)).toHaveText("1 / 0 / 0");
  await expect(cells.nth(3)).toHaveText("0 / 0 / 0");
  await expect(cells.nth(4)).toHaveText("0 / 450 / 0");
  await expect(cells.nth(5)).toHaveText("0 / 0 / 0");
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save replay", exact: true }).press("Enter");
  const download = await downloaded;
  const path = info.outputPath("match-replay.json");
  await download.saveAs(path);
  const record = JSON.parse(readFileSync(path, "utf8")) as MatchRecord;
  expect(record.scenario.setup.debug).toBe(false);
  expect(record.scenario.commands.every((command) => command.seat === 1)).toBe(true);
  const verified = execFileSync(
    "bun",
    [
      "-e",
      'import { verifyMatchRecord } from "./packages/sim/src/index.ts"; const value = await Bun.file(process.argv[1]).json(); console.log(JSON.stringify(verifyMatchRecord(value)));',
      path,
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
    },
  );
  expect(JSON.parse(verified)).toMatchObject({ tick: record.tick, hash: record.hash });
  const snapshot = await page.evaluate(
    () => Reflect.get(window, "lastResultSnapshot") as SeatSnapshot,
  );
  const own = snapshot.statistics?.find((row) => row.force === 0);
  expect(own?.details?.history.map((point) => point.tick)).toContain(600);
  expect(own?.details?.history.at(-1)?.tick).toBe(record.tick);
  expect(
    own?.details?.types.find((type) => type.definition.endsWith("/field-technician"))?.built,
  ).toBe(1);
  expect(own?.details?.controllers.find((controller) => controller.seat === 1)).toMatchObject({
    orders: 2,
    ticks: record.tick,
  });
  writeFileSync(info.outputPath("detailed-statistics.json"), JSON.stringify(snapshot.statistics));
  await dialog.getByRole("tab", { name: "Economy", exact: true }).press("Enter");
  await expect(dialog.getByRole("img", { name: "Credits stock", exact: true })).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "History metric", exact: true })
    .selectOption("creditsGathered");
  await dialog
    .getByRole("tabpanel", { name: "Economy", exact: true })
    .getByText("Show sampled values", { exact: true })
    .press("Enter");
  await expect(dialog.getByRole("region", { name: "Credits gathered", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("economy-history.png") });
  await dialog
    .getByRole("combobox", { name: "History metric", exact: true })
    .selectOption("industrialIncome");
  await dialog
    .getByRole("tabpanel", { name: "Economy", exact: true })
    .getByText("Show sampled values", { exact: true })
    .press("Enter");
  await expect(
    dialog
      .getByRole("region", { name: "Industrial capacity income / minute", exact: true })
      .getByRole("row", { name: "Force 1 0:30 2", exact: true })
      .getByRole("cell")
      .last(),
  ).toHaveText("2");
  await dialog.getByRole("tab", { name: "Military", exact: true }).press("Enter");
  await expect(
    dialog
      .getByRole("row")
      .filter({ hasText: "Field Technician" })
      .filter({ hasText: "Force 1" })
      .getByRole("cell")
      .nth(1),
  ).toHaveText("1");
  await dialog.getByRole("tab", { name: "Orders / APM", exact: true }).press("Enter");
  await expect(
    dialog.getByRole("row").filter({ hasText: "Player seat 1" }).getByRole("cell").nth(1),
  ).toHaveText("2");
  await expect(dialog).toContainText("Bot seat 2");
  await dialog.getByRole("tab", { name: "Orders / APM", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(dialog.getByRole("tab", { name: "Summary", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(dialog.getByRole("status")).toHaveText("Replay download started.");
  await page.screenshot({ path: info.outputPath("match-totals-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("region", { name: "Final Force totals" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("match-totals-mobile.png") });
  await dialog.getByRole("tab", { name: "Economy", exact: true }).press("Enter");
  await page.screenshot({ path: info.outputPath("history-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

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
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, "raceSurrender", true));
  await page.getByRole("button", { name: "Surrender", exact: true }).press("Enter");
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
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/match$/);
  await page.getByRole("button", { name: "Pause", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Surrender", exact: true }).press("Enter");
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
  await result.getByRole("button", { name: "Rematch", exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(canvas).toHaveAttribute("data-entities", "7");
  expect(workers).toBe(2);
  await page.getByRole("button", { name: "Surrender", exact: true }).press("Enter");
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "Home", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Open Neo RTS" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).not.toHaveAttribute("data-session", "ready");
  await expect(canvas).toHaveAttribute("data-menu", "ready");
  expect(errors).toEqual([]);
});
