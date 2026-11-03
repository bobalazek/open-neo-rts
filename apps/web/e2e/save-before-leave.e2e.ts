import { expect, type Page, test } from "@playwright/test";
import type { SavedGame } from "../../../packages/client/src/features/load-game/storage";
import { checkpointHash, restoreMatchSnapshot } from "../../../packages/sim/src";
import { clickNativeText, nativeFrame, observeNativePaint } from "./native-paint";

async function manualSaves(page: Page): Promise<SavedGame[]> {
  return page.evaluate(
    () =>
      new Promise<SavedGame[]>((resolve, reject) => {
        const open = indexedDB.open("open-neo-rts.saves", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("saves"),
            read = tx.objectStore("saves").getAll();
          tx.oncomplete = () => {
            resolve(read.result.filter((save: SavedGame) => save.kind === "manual"));
            db.close();
          };
          tx.onabort = () => {
            reject(tx.error);
            db.close();
          };
        };
      }),
  );
}

test("native save-before-leave preserves the paused world through cancellation, failure and pending persistence", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await observeNativePaint(page);
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "saves" && Reflect.get(window, "failExitSave"))
        throw new DOMException("Test quota exceeded", "QuotaExceededError");
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown) {
      if (
        (message as { type?: string }).type === "export-match-snapshot" &&
        Reflect.get(window, "holdExitSave")
      ) {
        Reflect.set(window, "releaseExitSave", () => post.call(this, message));
        return;
      }
      return post.call(this, message);
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page.locator("[data-save-notice]")).toHaveText("Game saved in this browser.");
  const original = await world.elementHandle();
  await page.getByRole("button", { name: "Leave match", exact: true }).press("Enter");
  const prompt = page.getByRole("dialog", { name: "Leave match?", exact: true });
  const save = prompt.getByRole("button", { name: "Save and leave", exact: true });
  await expect(save).toBeEnabled();
  const tick = await world.getAttribute("data-tick");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("leave-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("leave-mobile.png") });
  await clickNativeText(page, "Cancel");
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(() => world.getAttribute("data-tick")).not.toBe(tick);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);

  await page.getByRole("button", { name: "Pause", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Leave match", exact: true }).press("Enter");
  await expect(save).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, "failExitSave", true));
  await page.getByRole("button", { name: "Leave match", exact: true }).press("Enter");
  await prompt.getByLabel("Save name", { exact: true }).fill("Before leaving");
  await save.press("Enter");
  await expect(prompt.getByRole("alert")).toContainText("Test quota exceeded");
  expect(await manualSaves(page)).toHaveLength(0);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("failure-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("failure-desktop.png") });
  await page.evaluate(() => {
    Reflect.set(window, "failExitSave", false);
    Reflect.set(window, "holdExitSave", true);
  });
  await save.press("Enter");
  await expect(prompt.getByRole("status")).toHaveText("Saving match…");
  await expect(prompt.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(
    prompt.getByRole("button", { name: "Leave without saving", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(1);
  expect(await manualSaves(page)).toHaveLength(0);
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("saving-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("saving-mobile.png") });
  await page.evaluate(() => Reflect.get(window, "releaseExitSave")());
  await expect(page).toHaveURL(/\/skirmish$/);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(world).not.toHaveAttribute("data-session", "ready");
  const [file] = await manualSaves(page);
  expect(file!.name).toBe("Before leaving");
  expect(checkpointHash(restoreMatchSnapshot(file!.match, file!.match.scenario.setup))).toBe(
    file!.match.hash,
  );
  expect(errors).toEqual([]);
});

test("restart and load save the current game before replacing its worker, and Cancel retains the load gallery", async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  let workers = 0;
  page.on("worker", () => workers++);
  await observeNativePaint(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page.locator("[data-save-notice]")).toHaveText("Game saved in this browser.");
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await menu.getByRole("button", { name: "Restart match", exact: true }).press("Enter");
  const restart = page.getByRole("dialog", { name: "Restart match?", exact: true });
  await expect(
    restart.getByRole("button", { name: "Save and restart", exact: true }),
  ).toBeEnabled();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("restart-desktop.png") });
  await restart.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
  await expect(menu.getByRole("button", { name: "Restart match", exact: true })).toBeFocused();
  expect(workers).toBe(1);
  await menu.getByRole("button", { name: "Restart match", exact: true }).press("Enter");
  await restart.getByLabel("Save name", { exact: true }).fill("Before restart");
  const original = await world.elementHandle();
  await restart.getByRole("button", { name: "Save and restart", exact: true }).press("Enter");
  await expect
    .poll(() => original!.evaluate((element) => element.isConnected), { timeout: 60_000 })
    .toBe(false);
  await expect(world).toHaveAttribute("data-session", "ready");
  expect(workers).toBe(2);
  expect((await manualSaves(page)).map((file) => file.name)).toEqual(["Before restart"]);
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Load game", exact: true }).press("Enter");
  await menu.locator(".save-row").filter({ hasText: "Before restart" }).press("Enter");
  await menu.getByRole("button", { name: "Load selected game", exact: true }).press("Enter");
  const load = page.getByRole("dialog", { name: "Load game?", exact: true });
  await expect(load.getByRole("button", { name: "Save and load", exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("load-mobile.png") });
  await load.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
  await expect(menu.locator(".save-row[aria-pressed=true]")).toContainText("Before restart");
  expect(workers).toBe(2);
  await menu.getByRole("button", { name: "Load selected game", exact: true }).press("Enter");
  await load.getByLabel("Save name", { exact: true }).fill("Before load");
  const replacement = await world.elementHandle();
  await load.getByRole("button", { name: "Save and load", exact: true }).press("Enter");
  await expect
    .poll(() => replacement!.evaluate((element) => element.isConnected), { timeout: 60_000 })
    .toBe(false);
  await expect(world).toHaveAttribute("data-session", "ready");
  expect(workers).toBe(3);
  const files = await manualSaves(page);
  expect(files.map((file) => file.name).sort()).toEqual(["Before load", "Before restart"]);
  for (const file of files)
    expect(checkpointHash(restoreMatchSnapshot(file.match, file.match.scenario.setup))).toBe(
      file.match.hash,
    );
});
