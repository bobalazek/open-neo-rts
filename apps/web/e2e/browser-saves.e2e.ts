import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import type { SavedGame } from "../../../packages/client/src/features/load-game/storage";
import { checkpointHash, restoreMatchSnapshot } from "../../../packages/sim/src";

async function saves(page: Page): Promise<SavedGame[]> {
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
            resolve(read.result);
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

async function replaceStored(page: Page, save: SavedGame) {
  await page.evaluate(
    (save) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("open-neo-rts.saves", 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("saves", "readwrite");
          tx.objectStore("saves").put(save);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        open.onerror = () => reject(open.error);
      }),
    save,
  );
}

test("real match save slots survive failed writes and canceled loads, import/export and resume", async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const interval = window.setInterval;
    const callbacks: (() => void)[] = [];
    Reflect.set(window, "saveIntervals", callbacks);
    window.setInterval = ((callback: TimerHandler, delay?: number) => {
      if (delay === 180000 && typeof callback === "function")
        callbacks.push(callback as () => void);
      return interval(callback, delay);
    }) as typeof window.setInterval;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "saves" && Reflect.get(window, "failSaveWrites"))
        throw new DOMException("Test quota exceeded", "QuotaExceededError");
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown) {
      const request = message as { type?: string; options?: { savedMatch?: unknown } };
      if (
        request.type === "init" &&
        request.options?.savedMatch &&
        Reflect.get(window, "holdSavedLoad")
      ) {
        Reflect.set(window, "savedLoadBlocked", true);
        return;
      }
      if (request.type === "init") Reflect.set(window, "currentSaveWorker", this);
      return post.call(this, message);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect
    .poll(async () => (await saves(page)).filter((save) => save.kind === "auto").length)
    .toBe(1);
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  let menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.locator("[data-menu-state]")).toHaveText("Paused");
  await menu.getByRole("button", { name: "Save game", exact: true }).press("Enter");
  await menu.getByLabel("Save name", { exact: true }).fill("Before the push");
  await menu.getByRole("button", { name: "Save game", exact: true }).press("Enter");
  await expect(menu.locator("[data-saved]")).toHaveText("Game saved in this browser.");
  const manual = (await saves(page)).find((save) => save.name === "Before the push")!;
  expect(manual.packs).toHaveLength(1);
  expect(manual.match.scenario.setup.definitions).toHaveLength(137);
  const colors = await page.evaluate(async (thumbnail) => {
    const image = new Image();
    image.src = thumbnail;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 32, 18);
    const data = context.getImageData(0, 0, 32, 18).data,
      colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return colors.size;
  }, manual.thumbnail);
  expect(colors).toBeGreaterThan(20);
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Quicksave now", exact: true }).press("Enter");
  await expect
    .poll(async () => (await saves(page)).some((save) => save.id === "quicksave"))
    .toBe(true);
  const quick = (await saves(page)).find((save) => save.id === "quicksave")!;
  await page.evaluate(() => Reflect.set(window, "failSaveWrites", true));
  await menu.getByRole("button", { name: "Quicksave now", exact: true }).press("Enter");
  await expect(menu.locator("[data-menu-error]")).not.toBeEmpty();
  expect((await saves(page)).find((save) => save.id === "quicksave")).toEqual(quick);
  await page.evaluate(() => Reflect.set(window, "failSaveWrites", false));
  const originalAuto = (await saves(page)).find((save) => save.id === "autosave-0")!.createdAt;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => (Reflect.get(window, "saveIntervals") as (() => void)[]).at(-1)?.());
    await expect
      .poll(async () =>
        (await saves(page))
          .filter((save) => save.kind === "auto")
          .some((save) => save.id === `autosave-${(i + 1) % 3}`),
      )
      .toBe(true);
    await expect(page.locator("[data-save-notice]")).toHaveText("Game saved in this browser.");
  }
  await expect
    .poll(async () => (await saves(page)).find((save) => save.id === "autosave-0")!.createdAt)
    .toBeGreaterThan(originalAuto);
  expect((await saves(page)).filter((save) => save.kind === "auto")).toHaveLength(3);
  await menu.getByRole("button", { name: "Resume match", exact: true }).press("Enter");
  await expect
    .poll(async () => Number(await page.locator("#game").getAttribute("data-tick")))
    .toBeGreaterThan(manual.match.tick + 3);
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Load game", exact: true }).press("Enter");
  await menu.locator(".save-row").filter({ hasText: "Before the push" }).press("Enter");
  const download = page.waitForEvent("download");
  await menu.getByRole("button", { name: "Export save", exact: true }).press("Enter");
  await (await download).saveAs(info.outputPath("portable-save.json"));
  const previousCanvas = await page.locator("#game").elementHandle();
  const previousTick = await page.locator("#game").getAttribute("data-tick");
  await page.evaluate(() => Reflect.set(window, "holdSavedLoad", true));
  await menu.getByRole("button", { name: "Load selected game", exact: true }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => !!Reflect.get(window, "savedLoadBlocked")), { timeout: 30_000 })
    .toBe(true);
  await page.getByRole("button", { name: "Cancel loading", exact: true }).click();
  await expect(menu.locator("[data-save-error]")).toContainText("current match was kept");
  expect(
    await previousCanvas!.evaluate((canvas) => canvas.isConnected && canvas.id === "game"),
  ).toBe(true);
  expect(await page.locator("#game").getAttribute("data-tick")).toBe(previousTick);
  await page.evaluate(() => Reflect.set(window, "holdSavedLoad", false));
  const corrupt = { ...manual, match: { ...manual.match, hash: "0000000000000000" } };
  const count = (await saves(page)).length;
  await menu.locator("[data-save-import]").setInputFiles({
    name: "corrupt.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });
  await expect(menu.locator("[data-save-error]")).toContainText("checksum");
  expect((await saves(page)).length).toBe(count);
  expect(await page.locator("#game").getAttribute("data-tick")).toBe(previousTick);
  await menu.locator("[data-save-import]").setInputFiles({
    name: "unsafe-preview.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...manual, thumbnail: "data:image/svg+xml;base64,PHN2Zz4=" }),
    ),
  });
  await expect(menu.locator("[data-save-error]")).toContainText("Invalid saved game");
  expect((await saves(page)).length).toBe(count);
  await menu.locator("[data-save-import]").setInputFiles({
    name: "portable.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(manual)),
  });
  await expect
    .poll(async () => (await saves(page)).filter((save) => save.name === manual.name).length, {
      timeout: 30000,
    })
    .toBe(2);
  await menu.getByRole("button", { name: "Load selected game", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-tick", String(manual.match.tick), {
    timeout: 60_000,
  });
  await expect
    .poll(() => previousCanvas!.evaluate((canvas) => canvas.isConnected), { timeout: 60000 })
    .toBe(false);
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await menu.getByRole("button", { name: "Save game", exact: true }).press("Enter");
  await menu.getByLabel("Save name", { exact: true }).fill("Resumed proof");
  await menu.getByRole("button", { name: "Save game", exact: true }).press("Enter");
  await expect(menu.locator("[data-saved]")).toHaveText("Game saved in this browser.");
  const resumed = (await saves(page)).find((save) => save.name === "Resumed proof")!;
  expect(resumed.match.hash).toBe(manual.match.hash);
  expect(checkpointHash(restoreMatchSnapshot(resumed.match, resumed.match.scenario.setup))).toBe(
    manual.match.hash,
  );
  writeFileSync(info.outputPath("resumed-save.json"), JSON.stringify(resumed));
  await page.screenshot({ path: info.outputPath("saved-match.png") });
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Load game", exact: true }).press("Enter");
  await menu.locator(".save-row").filter({ hasText: "Resumed proof" }).press("Enter");
  await replaceStored(page, { ...resumed, createdAt: resumed.createdAt + 1 });
  await menu.getByRole("button", { name: "Load selected game", exact: true }).press("Enter");
  await expect(menu.locator("[data-save-error]")).toContainText("slot changed");
  await replaceStored(page, { ...resumed, createdAt: resumed.createdAt + 2 });
  page.once("dialog", (dialog) => dialog.accept());
  await menu.getByRole("button", { name: "Delete save", exact: true }).press("Enter");
  await expect(menu.locator("[data-save-error]")).toContainText("slot changed");
  expect((await saves(page)).find((save) => save.id === resumed.id)?.createdAt).toBe(
    resumed.createdAt + 2,
  );
  const incompatible = {
    ...manual,
    id: "manual-incompatible",
    name: "Old game version",
    match: { ...manual.match, simVersion: manual.match.simVersion + 1 },
  } as SavedGame;
  await replaceStored(page, incompatible);
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Load game", exact: true }).press("Enter");
  await menu.locator(".save-row").filter({ hasText: "Old game version" }).press("Enter");
  await expect(
    menu.getByRole("button", { name: "Load selected game", exact: true }),
  ).toBeDisabled();
  await expect(menu).toContainText("No migration is available");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("load-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  page.once("dialog", (dialog) => dialog.accept());
  await menu.getByRole("button", { name: "Delete save", exact: true }).press("Enter");
  await expect
    .poll(async () => (await saves(page)).some((save) => save.id === incompatible.id))
    .toBe(false);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await menu.locator(".save-row").filter({ hasText: "Resumed proof" }).press("Enter");
  await page.evaluate(() => {
    Reflect.set(window, "holdSavedLoad", true);
    Reflect.set(window, "savedLoadBlocked", false);
  });
  await menu.getByRole("button", { name: "Load selected game", exact: true }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => !!Reflect.get(window, "savedLoadBlocked")), { timeout: 30_000 })
    .toBe(true);
  await page.getByRole("button", { name: "Cancel loading", exact: true }).click();
  await expect(menu.locator("[data-save-error]")).toContainText("current match was kept");
  await page.evaluate(() => Reflect.set(window, "holdSavedLoad", false));
  await page.evaluate(() =>
    (Reflect.get(window, "currentSaveWorker") as Worker).dispatchEvent(new ErrorEvent("error")),
  );
  await expect(page).toHaveURL(/\/skirmish$/);
  await expect(page.getByRole("status")).toContainText("Simulation worker failed");
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Continue latest save", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Single player", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Load game", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/load$/);
  await page.getByLabel("Search saves", { exact: true }).fill("does not exist");
  await expect(page.locator("[data-save-list]")).toHaveText("No saves match this search.");
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Continue latest save", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page.locator("#game")).toHaveAttribute("data-tick", String(manual.match.tick));
});
