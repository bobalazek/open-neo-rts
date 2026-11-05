import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { verifyMatchRecord } from "../../../packages/sim/src";
import {
  clickNativeText,
  nativeFrame,
  nativeMapPoint,
  nativeTextPoint,
  observeNativePaint,
} from "./native-paint";

test("finished skirmish opens a native replay, seeks, switches vision and manages verified browser files", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await observeNativePaint(page);
  await page.addInitScript(() => {
    Reflect.set(window, "nativeFocusPaint", 0);
    const stroke = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (...args: Parameters<typeof stroke>) {
      if (
        this.strokeStyle === "#fff6db" &&
        this.canvas.width >= innerWidth * 0.6 &&
        this.canvas.height >= innerHeight * 0.6
      )
        Reflect.set(window, "nativeFocusPaint", Reflect.get(window, "nativeFocusPaint") + 1);
      return Reflect.apply(stroke, this, args);
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Single player", exact: true }).press("Enter");
  await clickNativeText(page, "Replays");
  await expect(page).toHaveURL(/\/replays$/);
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "replays", { timeout: 60000 });
  await expect(page.locator("[data-save-list]")).toContainText("No replays yet");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("empty-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("empty-mobile.png") });
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  await expect
    .poll(async () => Number(await page.locator("#game").getAttribute("data-tick")))
    .toBeGreaterThan(10);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Surrender", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Watch replay", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "replay", { timeout: 60000 });
  await expect(page.locator("#game")).toHaveAttribute("data-tick", "0");
  await expect(page.locator(".native-replay")).toHaveCount(1);
  await expect(page.locator("[data-players] p")).toHaveCount(2);
  await expect(page.locator("[data-replay-marker]")).toHaveCount(1);
  await expect(page.locator("[data-replay-marker]")).toContainText("Force 1 surrendered");
  await expect(
    page.getByRole("button", { name: "Previous event · ,", exact: true }),
  ).toBeDisabled();
  await page.locator("#game").focus();
  await page.keyboard.press("Period");
  const terminal = await page.locator("[data-timeline]").getAttribute("max");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", terminal!);
  await expect(page.getByRole("button", { name: "Next event · .", exact: true })).toBeDisabled();
  await page.locator("[data-timeline]").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", "0");
  await nativeFrame(page);
  const eventPath = "M6 21V3l13 3-13 6";
  await expect
    .poll(() =>
      page.evaluate(
        (path) => (Reflect.get(window, "nativePaintImages").get(path)?.y ?? 0) > 700,
        eventPath,
      ),
    )
    .toBe(true);
  const eventPoint = await page.evaluate(
    (path) => Reflect.get(window, "nativePaintImages").get(path) as { x: number; y: number },
    eventPath,
  );
  await page.mouse.click(eventPoint.x, eventPoint.y);
  await expect(page.locator("#game")).toHaveAttribute("data-tick", terminal!);
  await page.locator("[data-timeline]").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", "0");
  await page.screenshot({ path: info.outputPath("viewer-desktop.png") });
  await page.locator("#game").focus();
  await page.keyboard.press("g");
  await expect(page.getByRole("button", { name: "Statistics · G", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator("[data-stat-values] tbody tr")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Economy", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await nativeTextPoint(page, "Force 1: 0");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("analytics-economy-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  expect((await nativeTextPoint(page, "Economy")).fontSize).toBe(12);
  await page.screenshot({ path: info.outputPath("analytics-economy-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await nativeFrame(page);
  expect((await nativeTextPoint(page, "Economy")).fontSize).toBe(12);
  await clickNativeText(page, "Military");
  await expect(page.getByRole("tab", { name: "Military", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.locator("[data-stat-metric]").selectOption("armyUnits");
  await expect(page.locator("[data-stat-values] caption")).toHaveText("Living army units");
  await clickNativeText(page, "Orders");
  const playerOrders = page
    .locator("[data-stat-values] tbody tr")
    .filter({ hasText: "Player seat 1" });
  await expect(playerOrders.locator("th,td").nth(2)).toHaveText("0");
  await page.locator("[data-timeline]").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", terminal!);
  await expect(playerOrders.locator("th,td").nth(2)).toHaveText(
    String(Math.floor(1200 / Number(terminal))),
  );
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("analytics-orders-desktop.png") });
  await page.locator("[data-timeline]").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", "0");
  await expect(playerOrders.locator("th,td").nth(2)).toHaveText("0");
  await page.locator("select[data-vision]").selectOption("1");
  await expect(page.locator("[data-stat-values] tbody tr")).toHaveCount(1);
  await expect(page.locator("[data-stat-values]")).not.toContainText("Bot seat");
  await page.locator("select[data-vision]").selectOption("all");
  await expect(page.locator("[data-stat-values] tbody tr")).toHaveCount(2);
  await clickNativeText(page, "Production");
  await expect(page.locator("[data-stat-status]")).toHaveText("No production queues in this view.");
  await page.locator("#game").focus();
  await page.keyboard.press("g");
  await expect(page.locator("[data-analysis]")).toHaveAttribute("hidden", "");
  const vision = page.locator("select[data-vision]");
  await vision.selectOption("1");
  await expect(page.locator("#game")).toHaveAttribute("data-vision", "1");
  await expect(page.locator("[data-players] p")).toHaveCount(1);
  await vision.selectOption("all");
  await expect(page.locator("[data-players] p")).toHaveCount(2);
  await clickNativeText(page, "All");
  await expect(page.locator("#game")).toHaveAttribute("data-vision", "1");
  await vision.selectOption("all");
  await page.locator("#game").focus();
  await page.keyboard.press("BracketRight");
  await expect(page.locator("[data-speed]")).toHaveValue("2");
  await clickNativeText(page, "2×");
  await expect(page.locator("[data-speed]")).toHaveValue("4");
  const mapPoint = await nativeMapPoint(page, 0.5, 0.5);
  await page.mouse.click(mapPoint.x, mapPoint.y);
  await expect(page.locator(".hud-minimap canvas")).toHaveAttribute("data-camera-cell", "64,64");
  await page.locator("#game").focus();
  await page.locator("[data-speed]").selectOption("0.5");
  const playPath = "m8 4 12 8-12 8V4Z";
  await expect
    .poll(() =>
      page.evaluate((path) => Reflect.get(window, "nativePaintImages").has(path), playPath),
    )
    .toBe(true);
  const playPoint = await page.evaluate(
    (path) => Reflect.get(window, "nativePaintImages").get(path) as { x: number; y: number },
    playPath,
  );
  await page.mouse.click(playPoint.x, playPoint.y);
  await expect
    .poll(async () => Number(await page.locator("#game").getAttribute("data-tick")))
    .toBeGreaterThan(0);
  await page.locator('[data-replay-action="play"]').evaluate((button) => {
    if (button.getAttribute("aria-pressed") === "true") (button as HTMLButtonElement).click();
  });
  await expect(page.locator('[data-replay-action="play"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const timeline = page.locator("[data-timeline]");
  await timeline.focus();
  await page.keyboard.press("End");
  const duration = await timeline.getAttribute("max");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", duration!);
  await page.keyboard.press("Home");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", "0");
  await page.locator("#game").focus();
  await page.mouse.click(612, 809);
  await expect
    .poll(async () =>
      Math.abs(
        Number(await page.locator("#game").getAttribute("data-tick")) - Number(duration) / 2,
      ),
    )
    .toBeLessThanOrEqual(2);
  await timeline.focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", "0");
  await page.locator('[data-replay-action="exit"]').focus();
  for (const selector of ["select[data-speed]", "select[data-vision]", "[data-timeline]"]) {
    await page.evaluate(() => Reflect.set(window, "nativeFocusPaint", 0));
    await page.keyboard.press("Tab");
    await expect(page.locator(selector)).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "nativeFocusPaint")))
      .toBeGreaterThan(0);
  }
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(window, "nativePaintText").has(
          "Seek through the replay · Arrow keys, Home / End",
        ),
      ),
    )
    .toBe(true);
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("focus-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("focus-mobile.png") });
  await page.locator("#game").focus();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("viewer-mobile.png") });
  await page.locator("#game").focus();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/replays$/);
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "replays", { timeout: 60000 });
  await page.locator(".save-row").first().press("Enter");
  const name = page.getByLabel("Replay name", { exact: true });
  await name.fill("First skirmish");
  await page.getByRole("button", { name: "Rename replay", exact: true }).press("Enter");
  await expect(page.locator("[data-save-detail] h2")).toHaveText("First skirmish");
  const search = page.getByRole("searchbox");
  await search.fill("Player");
  await expect(page.locator(".save-row")).toHaveCount(1);
  await search.fill("no-such-replay");
  await expect(page.locator("[data-save-list]")).toContainText("No replays match");
  await search.fill("");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("library-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("library-desktop.png") });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export replay", exact: true }).press("Enter");
  const download = await downloaded;
  const file = await readFile((await download.path())!);
  const portable = JSON.parse(file.toString());
  expect(portable.format).toBe(2);
  expect(portable.mapHash).toMatch(/^[a-f0-9]{16}$/);
  expect(portable.record.format).toBe(2);
  expect(portable.record.keyframes.map((frame: { tick: number }) => frame.tick)).toEqual([0]);
  expect(verifyMatchRecord(portable.record).hash).toBe(portable.record.hash);
  await page
    .locator('[type="file"]')
    .setInputFiles({ name: "replay.json", mimeType: "application/json", buffer: file });
  await expect(page.locator(".save-row")).toHaveCount(2, { timeout: 60000 });
  await expect(page.getByRole("button", { name: "Watch replay", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Watch replay", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "replay", { timeout: 60000 });
  await page.locator("[data-timeline]").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", String(portable.record.tick));
  await page.locator("#game").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-row")).toHaveCount(2);
  const { keyframes: _keyframes, ...legacyRecord } = portable.record;
  const legacy = { ...legacyRecord, format: 1 };
  await page.locator('[type="file"]').setInputFiles({
    name: "legacy-record.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator(".save-row")).toHaveCount(3, { timeout: 60000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete replay", exact: true }).press("Enter");
  await expect(page.locator(".save-row")).toHaveCount(2);
  const wrongMap = { ...portable, mapHash: "0000000000000000" };
  await page.locator('[type="file"]').setInputFiles({
    name: "wrong-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(wrongMap)),
  });
  await expect(page.getByRole("alert")).toContainText("map hash");
  await expect(page.locator(".save-row")).toHaveCount(2);
  const corrupt = JSON.parse(file.toString());
  corrupt.record.hash = "0000000000000000";
  await page.locator('[type="file"]').setInputFiles({
    name: "corrupt.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });
  await expect(page.getByRole("alert")).toContainText("terminal tick and hash", { timeout: 60000 });
  await expect(page.locator(".save-row")).toHaveCount(2);
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("open-neo-rts.replays", 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("replays", "readwrite");
        tx.objectStore("replays").put({ id: "damaged", name: "bad" });
        tx.objectStore("replays").put({
          ...value,
          id: "future",
          name: "Future replay",
          record: { ...value.record, scenario: { ...value.record.scenario, simVersion: 999 } },
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, JSON.parse(file.toString()));
  await page.reload();
  await expect(page.locator(".save-row")).toHaveCount(4, { timeout: 60000 });
  await page.getByRole("button", { name: /Future replay/ }).press("Enter");
  await expect(page.locator("[data-save-detail]")).toContainText("Requires simulation 999");
  await expect(page.getByRole("button", { name: "Watch replay", exact: true })).toBeDisabled();
  const archivedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export replay", exact: true }).press("Enter");
  const archived = JSON.parse(await readFile((await (await archivedDownload).path())!, "utf8"));
  expect(archived.id).toBe("future");
  expect(archived.record.scenario.simVersion).toBe(999);
  expect(archived.record.keyframes).toEqual(portable.record.keyframes);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete replay", exact: true }).press("Enter");
  await expect(page.locator(".save-row")).toHaveCount(3);
  await page.getByRole("button", { name: /Damaged replay/ }).press("Enter");
  await expect(page.locator("[data-save-detail]")).toContainText("cannot be read");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete replay", exact: true }).press("Enter");
  await expect(page.locator(".save-row")).toHaveCount(2);
  await page.locator(".save-row").first().press("Enter");
  await page.route("**/replay-worker.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "self.onmessage = () => {};" }),
  );
  await page.getByRole("button", { name: "Watch replay", exact: true }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Loading replay", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/replays$/);
  await page.unroute("**/replay-worker.js");
  await page.locator(".save-row").first().press("Enter");
  await page.route("**/replay-worker.js", (route) => route.abort());
  await page.getByRole("button", { name: "Watch replay", exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Replay worker failed", { timeout: 60000 });
  await expect(page.getByRole("dialog").locator("canvas")).toHaveAttribute(
    "data-panel",
    "replay-error",
    { timeout: 60000 },
  );
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("failure-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("failure-mobile.png") });
  await clickNativeText(page, "Replays");
  await expect(page).toHaveURL(/\/replays$/);
  await expect(page.locator(".save-row")).toHaveCount(2);
});
