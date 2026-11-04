import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { installEditorPack } from "./definition-editor-fixture";
import { nativeFrame } from "./native-paint";

const path = "factions/eastern-collective/units/dragon-tank/unit.json";
async function edit(page: import("@playwright/test").Page) {
  await page.goto("/tools/content");
  await expect(page.locator("#game")).toHaveAttribute("data-model", "Dragon Tank", {
    timeout: 30000,
  });
  const pane = page.locator(".content-tools-controls");
  await expect(pane).toHaveAttribute("data-panel", "content-tools");
  const bounds = (await pane.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 0.75, bounds.y + bounds.height - 62);
  await expect(page.locator(".definition-editor")).toHaveCount(1);
}
async function click(page: import("@playwright/test").Page, name: string) {
  await page
    .getByRole("button", { name, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
}

test("schema form edits save validated JSON, preserve invalid input and resolve disk conflicts", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installEditorPack(page);
  await edit(page);
  await click(page, "Open pack folder");
  const health = page.getByLabel("health", { exact: true });
  await expect(health).toHaveValue("900", { timeout: 30000 });
  await health.fill("bad");
  await expect(page.getByRole("button", { name: "Save definition", exact: true })).toBeDisabled();
  await page
    .getByRole("tab", { name: "Combat", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole("tab", { name: "General", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(health).toHaveValue("bad");
  await health.fill("901");
  await page
    .getByLabel("Add or remove fields", { exact: true })
    .selectOption({ label: "Add tags" });
  await click(page, "Apply field change");
  await page.getByLabel("tags[1]", { exact: true }).fill("test");
  await page
    .getByLabel("Add or remove fields", { exact: true })
    .selectOption({ label: "Remove tags[1]" });
  await click(page, "Apply field change");
  await expect(page.getByLabel("tags[1]", { exact: true })).toHaveCount(0);
  await page.evaluate((path) => {
    Reflect.get(window, "editorFixture").delayPath = path;
  }, path);
  await click(page, "Save definition");
  await expect(health).toBeDisabled();
  await page.waitForFunction(() => !!Reflect.get(window, "editorFixture").release);
  await page.evaluate(() => Reflect.get(window, "editorFixture").release());
  const saving = page.getByRole("button", { name: "Save definition", exact: true });
  await expect(saving).toBeEnabled({ timeout: 30000 });
  expect(
    await page.evaluate(
      async (path) =>
        JSON.parse(await Reflect.get(window, "editorFixture").files.get(path).text()).health,
      path,
    ),
  ).toBe(901);
  const other = "core/factions/alliance-of-free-nations/structures/advanced-armory/structure.json";
  await page.evaluate((path) => {
    Reflect.get(window, "editorFixture").delayPath = path;
  }, other.slice(5));
  await page.getByLabel("Pack definition", { exact: true }).selectOption(other);
  await expect(health).toBeDisabled();
  await page.waitForFunction(() => !!Reflect.get(window, "editorFixture").release);
  await page.evaluate(() => Reflect.get(window, "editorFixture").release());
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Advanced Armory");
  await page.getByLabel("Pack definition", { exact: true }).selectOption(`core/${path}`);
  await expect(health).toHaveValue("901");
  await health.fill("902");
  await page.evaluate(async (path) => {
    const state = Reflect.get(window, "editorFixture");
    const value = JSON.parse(await state.files.get(path).text());
    value.health = 903;
    state.files.set(path, new File([JSON.stringify(value)], "unit.json"));
  }, path);
  await click(page, "Save definition");
  await expect(page.getByRole("button", { name: "Keep my edits", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "File changed on disk", exact: true }),
  ).toHaveAttribute("data-native-block", /panel-node-/);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "editorConflictPainted")))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Save definition", exact: true, includeHidden: true }),
  ).toBeHidden();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(1);
  await click(page, "Keep my edits");
  await click(page, "Save definition");
  await expect(saving).toBeEnabled({ timeout: 30000 });
  expect(
    await page.evaluate(
      async (path) =>
        JSON.parse(await Reflect.get(window, "editorFixture").files.get(path).text()).health,
      path,
    ),
  ).toBe(902);
  await health.fill("904");
  await page.evaluate(() => {
    Reflect.get(window, "editorFixture").fail = true;
  });
  await click(page, "Save definition");
  await expect(saving).toBeEnabled({ timeout: 30000 });
  await expect(page.locator(".definition-editor [role=alert]")).toContainText("Test write failure");
  await expect(health).toHaveValue("904");
  expect(
    await page.evaluate(
      async (path) =>
        JSON.parse(await Reflect.get(window, "editorFixture").files.get(path).text()).health,
      path,
    ),
  ).toBe(902);
  await click(page, "Discard edits");
  await expect(health).toHaveValue("902");
});

test("read-only pack folders download a checked copy and dirty navigation retains edits", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installEditorPack(page, false);
  await edit(page);
  await page.locator(".definition-editor input[type=file]").evaluate((input: HTMLInputElement) => {
    const transfer = new DataTransfer();
    for (const file of Reflect.get(window, "editorFolderFiles")) transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const health = page.getByLabel("health", { exact: true });
  await expect(health).toHaveValue("900", { timeout: 30000 });
  await health.fill("905");
  await click(page, "Back");
  await expect(health).toHaveValue("905");
  const downloading = page.waitForEvent("download");
  await click(page, "Download JSON");
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(path.replaceAll("/", "-"));
  expect(JSON.parse(readFileSync((await download.path())!, "utf8")).health).toBe(905);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(0);
  await expect(page.locator(".definition-editor [role=alert]")).toContainText(
    "source pack has not been changed",
  );
});

test("invalid unreferenced wrecks block saves without changing the draft or disk", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installEditorPack(page);
  await edit(page);
  await page.evaluate(async () => {
    const files = Reflect.get(window, "editorFixture").files as Map<string, File>;
    const path = "factions/eastern-collective/units/dragon-tank/dragon-tank.wreck.glb";
    const bytes = new Uint8Array(await files.get(path)!.arrayBuffer());
    bytes[0] = 0;
    files.set(path, new File([bytes], "dragon-tank.wreck.glb"));
  });
  await click(page, "Open pack folder");
  const health = page.getByLabel("health", { exact: true });
  await expect(health).toHaveValue("900", { timeout: 30000 });
  await health.fill("901");
  await click(page, "Save definition");
  await expect(page.locator(".definition-editor")).toContainText("glTF:", {
    timeout: 30000,
  });
  await expect(health).toHaveValue("901");
  expect(await page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(0);
  expect(
    await page.evaluate(
      async (path) =>
        JSON.parse(await Reflect.get(window, "editorFixture").files.get(path).text()).health,
      path,
    ),
  ).toBe(900);
});

test("new definitions copy authored assets, publish the manifest and select the saved result", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await installEditorPack(page);
  await edit(page);
  await click(page, "Open pack folder");
  await expect(page.getByLabel("health", { exact: true })).toHaveValue("900", { timeout: 30000 });
  await page.getByRole("button", { name: "New from selected", exact: true }).press("Enter");
  await page.getByLabel("New display name", { exact: true }).fill("Test Tank");
  await page.getByLabel("New folder name", { exact: true }).fill("test-tank");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("create-definition-desktop.png") });
  await page.getByRole("button", { name: "Create definition", exact: true }).press("Enter");
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Test Tank", {
    timeout: 30000,
  });
  expect(await page.getByLabel("Pack definition", { exact: true }).inputValue()).toBe(
    `core/${path.replace("/dragon-tank/", "/test-tank/")}`,
  );
  const snapshot = await page.evaluate(async (path) => {
    const state = Reflect.get(window, "editorFixture");
    const target = path.replace("/dragon-tank/", "/test-tank/");
    const manifest = JSON.parse(await state.files.get("manifest.json").text());
    return {
      listed: manifest.files.units.includes(target),
      source: JSON.parse(await state.files.get(path).text()).name,
      copy: JSON.parse(await state.files.get(target).text()).id,
      metadata:
        (await state.files.get(target.replace("unit.json", "assets.json")).text()) ===
        (await state.files.get(path.replace("unit.json", "assets.json")).text()),
    };
  }, path);
  expect(snapshot).toEqual({
    listed: true,
    source: "Dragon Tank",
    copy: "unit:eastern-collective/test-tank",
    metadata: true,
  });
  await page.getByRole("button", { name: "New from selected", exact: true }).press("Enter");
  await page.getByLabel("New display name", { exact: true }).fill("Collision");
  await page.getByLabel("New folder name", { exact: true }).fill("dragon-tank");
  await page.getByRole("button", { name: "Create definition", exact: true }).press("Enter");
  await expect(page.locator(".definition-editor [role=alert]")).toContainText("already exists");
  await expect(page.getByLabel("New display name", { exact: true })).toHaveValue("Collision");
});

test("read-only creation downloads a coordinated changes archive without touching the source", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await installEditorPack(page, false);
  await edit(page);
  await page.locator(".definition-editor input[type=file]").evaluate((input: HTMLInputElement) => {
    const transfer = new DataTransfer();
    for (const file of Reflect.get(window, "editorFolderFiles")) transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByLabel("health", { exact: true })).toHaveValue("900", { timeout: 30000 });
  await page.getByRole("button", { name: "New from selected", exact: true }).press("Enter");
  await page.getByLabel("New display name", { exact: true }).fill("Archive Tank");
  await page.getByLabel("New folder name", { exact: true }).fill("archive-tank");
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("create-definition-mobile.png") });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download changes ZIP", exact: true }).press("Enter");
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("core-archive-tank-changes.zip");
  await download.saveAs(info.outputPath("creation-changes.zip"));
  await expect(page.locator(".definition-editor [role=alert]")).toContainText(
    "not a standalone pack",
  );
  expect(await page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(0);
  await page.getByRole("button", { name: "Cancel creation", exact: true }).press("Enter");
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Dragon Tank");
});
