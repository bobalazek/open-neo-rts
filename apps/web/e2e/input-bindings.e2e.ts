import { expect, test } from "@playwright/test";
import {
  BINDINGS_KEY,
  defaultBindings,
  wasdBindings,
} from "../../../packages/client/src/features/settings/bindings";
import { clickNativeText, nativeFrame, observeNativePaint } from "./native-paint";

test("native Controls captures real keys, blocks conflicts, imports safely and persists only on Apply", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await observeNativePaint(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Controls", exact: true }).press("Enter");
  await expect(page.locator(".native-panel")).toBeVisible();
  const action = page.getByLabel("Action", { exact: true });
  await expect(action).toHaveValue("move");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("controls-desktop.png") });
  await clickNativeText(page, "Change shortcut");
  await expect(page.getByRole("status")).toContainText("Press your shortcut");
  await page.keyboard.press("s");
  await expect(page.getByRole("alert")).toContainText("Move / Stop");
  await expect(page.getByRole("button", { name: "Apply shortcuts", exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), BINDINGS_KEY)).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("conflict-mobile.png") });
  await page.getByRole("button", { name: "Change shortcut", exact: true }).press("Enter");
  await page.keyboard.press("j");
  await expect(page.locator('[role="alert"]')).toBeEmpty();
  await page.getByRole("button", { name: "Apply shortcuts", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("Shortcuts saved on this device.");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BINDINGS_KEY);
  expect(saved.bindings.move).toEqual(["KeyJ"]);
  await page.getByRole("button", { name: "Change shortcut", exact: true }).press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveText("Shortcut capture canceled.");
  await page.getByRole("button", { name: "Change shortcut", exact: true }).press("Enter");
  await page.keyboard.press("k");
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Controls", exact: true }).press("Enter");
  await expect(page.locator("[data-assignment]")).toHaveText("Move: J");
  const imported = wasdBindings();
  await page.getByLabel("Import shortcuts", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":2}'),
  });
  await expect(page.getByRole("status")).toContainText("Could not import shortcuts");
  await expect(page.locator("[data-assignment]")).toHaveText("Move: J");
  await page.getByLabel("Import shortcuts", { exact: true }).setInputFiles({
    name: "wasd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: 1, bindings: imported })),
  });
  await expect(page.getByRole("status")).toContainText("imported for review");
  await expect(page.locator("[data-assignment]")).toHaveText("Move: 1");
  await page.getByRole("button", { name: "Apply shortcuts", exact: true }).press("Enter");
  await page.reload();
  await page.getByRole("button", { name: "Controls", exact: true }).press("Enter");
  await expect(page.locator("[data-assignment]")).toHaveText("Move: 1");
  await page.getByLabel("Category", { exact: true }).selectOption("camera");
  await page.getByLabel("Action", { exact: true }).selectOption("panUp");
  await expect(page.locator("[data-assignment]")).toHaveText("Pan camera up: W");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shortcuts", exact: true }).press("Enter");
  await (await download).saveAs(info.outputPath("exported-bindings.json"));
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("controls-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("saved and live-edited shortcuts drive the actual match, map, camera, groups, native details and quick saves", async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const bindings = defaultBindings();
  bindings.move = ["KeyJ", "KeyK"];
  bindings.panRight = ["KeyL"];
  bindings.details = ["KeyO"];
  bindings.buildMenu = ["KeyT"];
  bindings.pause = ["KeyP"];
  bindings.home = ["KeyN"];
  bindings["group.select.1"] = ["KeyM"];
  bindings.quicksave = ["F6"];
  bindings.quickload = ["F8"];
  await page.addInitScript(
    ({ key, bindings }) => localStorage.setItem(key, JSON.stringify({ format: 1, bindings })),
    { key: BINDINGS_KEY, bindings },
  );
  await page.addInitScript(() => {
    const interval = window.setInterval;
    window.setInterval = ((callback: TimerHandler, delay?: number) => {
      if (delay === 180000 && typeof callback === "function")
        Reflect.set(window, "bindingAutosave", callback);
      return interval(callback, delay);
    }) as typeof window.setInterval;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.state)
            Reflect.set(
              window,
              "bindingStateCount",
              (Reflect.get(window, "bindingStateCount") ?? 0) + 1,
            );
        });
      }
    };
  });
  await observeNativePaint(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(page.locator("[data-save-notice]")).toHaveText("Game saved in this browser.");
  await world.focus();
  await page.keyboard.press("Period");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  const move = page.getByRole("button", { name: "J / K · Move", exact: true });
  await expect(move).toHaveAttribute("data-hotkey", "J");
  await expect(move).toHaveAttribute("data-command-index", "0");
  await page.keyboard.press("q");
  await expect(world).not.toHaveAttribute("data-command-mode", "unit.move");
  await page.keyboard.press("Shift+k");
  await expect(world).toHaveAttribute("data-command-mode", "unit.move");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+1");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-summary]")).toHaveAttribute("data-count", "0");
  await page.keyboard.press("m");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  await page.keyboard.press("o");
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...Reflect.get(window, "nativePaintText").keys()].some(
          (value) => String(value).includes("Field Technician:") && String(value).includes(" HP"),
        ),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  const minimap = page.locator(".hud-minimap canvas");
  const before = await minimap.getAttribute("data-camera-cell");
  await world.focus();
  await page.keyboard.down("Shift");
  await page.keyboard.down("l");
  await expect.poll(() => minimap.getAttribute("data-camera-cell")).not.toBe(before);
  await page.keyboard.up("l");
  await page.keyboard.up("Shift");
  await page.keyboard.press("n");
  await expect(minimap).toHaveAttribute("aria-label", /N returns to base/);
  await page.keyboard.press("p");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const tick = await world.getAttribute("data-tick");
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.getByRole("button", { name: "Current controls", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "Current controls", exact: true }).press("Enter");
  await expect(menu).toContainText("P pauses or resumes");
  await menu.getByRole("button", { name: "Edit shortcuts", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Change shortcut", exact: true }).press("Enter");
  await page.keyboard.press("s");
  await expect(menu.getByRole("alert").last()).toContainText("Move / Stop");
  let published = await page.evaluate(() => Reflect.get(window, "bindingStateCount"));
  await page.evaluate(() => Reflect.get(window, "bindingAutosave")());
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "bindingStateCount")))
    .toBeGreaterThan(published);
  await expect(menu.getByRole("button", { name: "Apply shortcuts", exact: true })).toBeDisabled();
  await menu.getByRole("button", { name: "Change shortcut", exact: true }).press("Enter");
  published = await page.evaluate(() => Reflect.get(window, "bindingStateCount"));
  await page.evaluate(() => Reflect.get(window, "bindingAutosave")());
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "bindingStateCount")))
    .toBeGreaterThan(published);
  await expect(menu.getByLabel("Action", { exact: true })).toBeDisabled();
  await expect(menu.getByRole("button", { name: "Apply shortcuts", exact: true })).toBeDisabled();
  await page.keyboard.press("y");
  await menu.getByRole("button", { name: "Apply shortcuts", exact: true }).press("Enter");
  await expect(menu.getByRole("status").last()).toHaveText("Shortcuts saved on this device.");
  expect(await world.getAttribute("data-tick")).toBe(tick);
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await expect(menu).toContainText("Y / K moves");
  await page.keyboard.press("Escape");
  await menu.getByRole("button", { name: "Resume match", exact: true }).press("Enter");
  await expect(menu).not.toBeVisible();
  await expect(world).toBeFocused();
  await page.keyboard.press("y");
  await expect(world).toHaveAttribute("data-command-mode", "unit.move");
  await page.keyboard.press("Escape");
  await page.keyboard.press("F6");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const file = JSON.parse(localStorage.getItem(key)!);
        return file.bindings.move;
      }, BINDINGS_KEY),
    )
    .toEqual(["KeyY", "KeyK"]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const open = indexedDB.open("open-neo-rts.saves", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result,
                tx = db.transaction("saves"),
                read = tx.objectStore("saves").get("quicksave");
              tx.oncomplete = () => {
                resolve(read.result?.kind === "quick");
                db.close();
              };
              tx.onabort = () => {
                reject(tx.error);
                db.close();
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.keyboard.press("F8");
  const replacing = page.getByRole("dialog", { name: "Load game?", exact: true });
  await expect(replacing.getByRole("button", { name: "Save and load", exact: true })).toBeEnabled();
  await replacing.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
  await expect(replacing).toHaveCount(0);
  await expect(world).toHaveAttribute("data-session", "ready");
  await page.screenshot({ path: info.outputPath("bound-match-desktop.png") });
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  await expect(menu.getByRole("button", { name: "Settings", exact: true })).toBeEnabled();
  await menu.getByRole("button", { name: "Settings", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Controls", exact: true }).press("Enter");
  await menu.getByLabel("Preset to apply", { exact: true }).selectOption("wasd");
  await menu.getByRole("button", { name: "Use preset", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Apply shortcuts", exact: true }).press("Enter");
  await expect(menu.getByRole("status").last()).toHaveText("Shortcuts saved on this device.");
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await menu.getByRole("button", { name: "Resume match", exact: true }).press("Enter");
  await expect(menu).not.toBeVisible();
  await expect(world).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+1");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  await page.keyboard.press("1");
  await expect(world).toHaveAttribute("data-command-mode", "unit.move");
  await page.keyboard.press("Escape");
  const wasdPosition = await minimap.getAttribute("data-camera-cell");
  await page.keyboard.down("d");
  await expect.poll(() => minimap.getAttribute("data-camera-cell")).not.toBe(wasdPosition);
  await page.keyboard.up("d");
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("wasd-match-mobile.png") });
  expect(errors).toEqual([]);
});
