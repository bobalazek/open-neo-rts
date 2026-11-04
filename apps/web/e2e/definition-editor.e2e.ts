import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";
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

test("draft scenario controls launch authored terrain and a frozen unit mirror without saving", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {
    const Base = window.Worker;
    const probe = { setups: [] as unknown[], created: 0, terminated: 0 };
    Reflect.set(window, "draftScenarioProbe", probe);
    window.Worker = class extends Base {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        probe.created++;
        this.addEventListener("message", ({ data }) => {
          if (data.state) Reflect.set(window, "draftScenarioState", data.state);
        });
      }
      override postMessage(
        message: unknown,
        options: StructuredSerializeOptions | Transferable[] = [],
      ) {
        if (message && typeof message === "object" && Reflect.get(message, "type") === "init")
          probe.setups.push(Reflect.get(message, "options").setup);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        probe.terminated++;
        super.terminate();
      }
    };
  });
  await installEditorPack(page);
  await edit(page);
  await click(page, "Open pack folder");
  const health = page.getByLabel("health", { exact: true });
  await expect(health).toHaveValue("900", { timeout: 30000 });
  await health.fill("1901");
  const launch = page.getByRole("button", { name: "Skirmish draft", exact: true });
  await launch.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Set up draft skirmish" });
  await expect(dialog).toHaveClass(/native-panel/);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
  await expect(health).toHaveValue("1901");
  expect(await page.evaluate(() => Reflect.get(window, "draftScenarioProbe").created)).toBe(0);
  await launch.press("Enter");
  await dialog.getByLabel("Map", { exact: true }).selectOption("core.map:sandbox-resources");
  await dialog.getByLabel("Opponent", { exact: true }).selectOption("draft-mirror");
  await dialog.getByLabel("Your spawn", { exact: true }).evaluate((select: HTMLSelectElement) => {
    select.value = "east";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const start = dialog.getByRole("button", { name: "Start skirmish", exact: true });
  await expect(start).toBeDisabled();
  await dialog.getByLabel("Bot spawn", { exact: true }).selectOption("west");
  const seed = dialog.getByLabel("Seed", { exact: true });
  await seed.fill("4294967296");
  await expect(start).toBeDisabled();
  await seed.fill("77");
  await expect(start).toBeEnabled();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("draft-scenario-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("draft-scenario-mobile.png") });
  await start.press("Enter");
  const canvas = page.locator("[data-draft-playtest]");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  const setup = await page.evaluate(() => Reflect.get(window, "draftScenarioProbe").setups[0]);
  expect(setup.seed).toBe(77);
  expect(setup.map).toMatchObject({
    id: "core.map:sandbox-resources",
    terrain: { width: 64, height: 64 },
  });
  expect(setup.normal.bots).toEqual([{ seat: 2, kind: "idle" }]);
  expect(setup.normal.forces.map((force: { spawn: string }) => force.spawn)).toEqual([
    "east",
    "west",
  ]);
  expect(
    setup.normal.forces.every((force: { start: { units: { unit: string; count: number }[] } }) =>
      force.start.units.some((unit) => unit.unit.endsWith("/dragon-tank") && unit.count === 1),
    ),
  ).toBe(true);
  expect(
    (
      await page.evaluate(() => Reflect.get(window, "draftScenarioState") as OfflineState)
    ).snapshot.entities.some(
      (entity) =>
        entity.force === 0 &&
        entity.definition.endsWith("/dragon-tank") &&
        entity.maxHealth === 1901,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Match menu", exact: true }).locator("canvas"),
  ).toHaveAttribute("data-panel", "menu");
  await page
    .getByRole("dialog", { name: "Match menu", exact: true })
    .getByRole("button", { name: "Restart match", exact: true })
    .press("Enter");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "draftScenarioProbe").setups.length))
    .toBe(2);
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  expect(
    await page.evaluate(() => {
      const setups = Reflect.get(window, "draftScenarioProbe").setups;
      return JSON.stringify(setups[0]) === JSON.stringify(setups[1]);
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Return to draft", exact: true }).press("Enter");
  await expect(health).toHaveValue("1901");
  expect(await page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(0);
  await launch.press("Enter");
  await expect(dialog.getByLabel("Map", { exact: true })).toHaveValue("core.map:sandbox-resources");
  await expect(seed).toHaveValue("77");
  await page.goto("/");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll("dialog[open]").length)).toBe(0);
});

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

test("unsaved drafts reach the debug worker and return intact after play and worker failure", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const WorkerBase = window.Worker;
    const counts = { created: 0, terminated: 0 };
    Reflect.set(window, "draftWorkers", counts);
    window.Worker = class extends WorkerBase {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        counts.created++;
        this.addEventListener("message", ({ data }) => {
          if (data.state) Reflect.set(window, "draftWorkerState", data.state);
        });
      }
      override terminate() {
        counts.terminated++;
        super.terminate();
      }
    };
  });
  await installEditorPack(page);
  await edit(page);
  await click(page, "Open pack folder");
  const health = page.getByLabel("health", { exact: true });
  await expect(health).toHaveValue("900", { timeout: 30000 });
  await health.fill("bad");
  await expect(page.getByRole("button", { name: "Playtest draft", exact: true })).toBeDisabled();
  await health.fill("1901");
  await page.getByRole("button", { name: "Playtest draft", exact: true }).press("Enter");
  const canvas = page.locator("[data-draft-playtest]");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 30000 });
  await expect(page.getByRole("listbox", { name: "Definition", exact: true })).toHaveValue(
    "core.unit:eastern-collective/dragon-tank",
  );
  await expect(
    page.getByRole("button", { name: "Copy initial setup link", exact: true }),
  ).toBeDisabled();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.55);
  await expect(page.getByRole("status", { name: "Model status", exact: true })).toContainText(
    "Models ready · 1",
  );
  const state = () => page.evaluate(() => Reflect.get(window, "draftWorkerState") as OfflineState);
  expect((await state()).snapshot.entities[0]?.maxHealth).toBe(1901);
  await page.getByLabel("Inspect entity", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Map action", { exact: true }).selectOption("select");
  const before = (await state()).snapshot.entities[0]!;
  await page.mouse.click(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.55, {
    button: "right",
  });
  await expect(page.getByRole("status", { name: "Order mode", exact: true })).toContainText(
    "accepted",
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect
    .poll(async () => {
      const entity = (await state()).snapshot.entities[0]!;
      return entity.x !== before.x || entity.y !== before.y;
    })
    .toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator(".debug-session").evaluate((panel) => {
    panel.scrollTop = 0;
  });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("draft-playtest-desktop.png") });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export command log", exact: true }).click();
  const download = await downloading;
  const file = (await download.path())!;
  const scenario = JSON.parse(readFileSync(file, "utf8"));
  expect(
    scenario.setup.definitions.find(
      (definition: { id: string }) => definition.id === "core.unit:eastern-collective/dragon-tank",
    ).health,
  ).toBe(1901);
  const tick = (await state()).snapshot.tick;
  const replay = execFileSync(
    "bun",
    ["apps/cli/src/index.ts", "run", file, "--ticks", String(tick)],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(replay).toContain((await state()).hash!);
  await page.getByRole("button", { name: "Return to draft", exact: true }).click();
  await expect(health).toHaveValue("1901");
  await expect(page.locator(".content-tools-controls")).toHaveAttribute(
    "data-panel",
    "content-tools",
  );
  await expect(canvas).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "draftWorkers"))).toEqual({
    created: 1,
    terminated: 1,
  });
  expect(await page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(0);
  expect(
    await page.evaluate(
      async (path) =>
        JSON.parse(await Reflect.get(window, "editorFixture").files.get(path).text()).health,
      path,
    ),
  ).toBe(900);
  await page.route("**/sim-worker.js", (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Playtest draft", exact: true }).press("Enter");
  await expect(canvas).toHaveAttribute("data-session", "error", { timeout: 30000 });
  await expect(page.locator(".debug-session [role=alert]")).toContainText(
    "Simulation worker failed",
    {
      timeout: 30000,
    },
  );
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("draft-playtest-mobile.png") });
  await page.getByRole("button", { name: "Return to draft", exact: true }).click();
  await expect(health).toHaveValue("1901");
  expect(await page.evaluate(() => Reflect.get(window, "draftWorkers"))).toEqual({
    created: 2,
    terminated: 2,
  });
});

test("draft skirmishes use edited recipes and health in a temporary normal match with the bot", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await page.addInitScript(() => {
    const WorkerBase = window.Worker;
    const probe = {
      created: 0,
      terminated: 0,
      writes: 0,
      audioCreated: 0,
      audioClosed: 0,
      setups: [] as unknown[],
    };
    Reflect.set(window, "draftSkirmishProbe", probe);
    const Context = window.AudioContext;
    if (Context)
      window.AudioContext = class extends Context {
        constructor(...args: ConstructorParameters<typeof Context>) {
          super(...args);
          probe.audioCreated++;
        }
        override async close() {
          await super.close();
          probe.audioClosed++;
        }
      };
    window.Worker = class extends WorkerBase {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        probe.created++;
        this.addEventListener("message", ({ data }) => {
          if (data.state) Reflect.set(window, "draftSkirmishState", data.state);
        });
      }
      override postMessage(
        message: unknown,
        options: StructuredSerializeOptions | Transferable[] = [],
      ) {
        if (message && typeof message === "object" && "type" in message && message.type === "init")
          probe.setups.push(Reflect.get(message, "options").setup);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        probe.terminated++;
        super.terminate();
      }
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.transaction.db.name === "open-neo-rts.saves") probe.writes++;
      return Reflect.apply(put, this, args);
    };
  });
  await installEditorPack(page);
  await edit(page);
  await click(page, "Open pack folder");
  const technicianPath = "factions/eastern-collective/units/field-technician/unit.json";
  await expect(page.getByLabel("health", { exact: true })).toHaveValue("900", { timeout: 30000 });
  await page.getByLabel("Pack definition", { exact: true }).selectOption(`core/${technicianPath}`);
  const health = page.getByLabel("health", { exact: true });
  await expect(health).toHaveValue("100");
  await health.fill("1901");
  await page.getByRole("tab", { name: "Production", exact: true }).press("Enter");
  await page.getByLabel("cost.credits", { exact: true }).fill("17");
  await page.getByLabel("buildTime", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Skirmish draft", exact: true }).press("Enter");
  await page
    .getByRole("dialog", { name: "Set up draft skirmish" })
    .getByRole("button", { name: "Start skirmish", exact: true })
    .press("Enter");
  const canvas = page.locator("[data-draft-playtest]");
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  await expect(canvas).toHaveAttribute("data-mode", "controlled");
  await expect(canvas).toHaveAttribute("data-hud", "native");
  const state = () =>
    page.evaluate(() => Reflect.get(window, "draftSkirmishState") as OfflineState);
  expect(
    (await state()).snapshot.entities
      .filter((entity) => entity.definition.endsWith("/field-technician"))
      .every((entity) => entity.maxHealth === 1901),
  ).toBe(true);
  const setup = await page.evaluate(() => Reflect.get(window, "draftSkirmishProbe").setups[0]);
  expect(setup.debug).toBe(false);
  expect(setup.normal.bots).toEqual([{ seat: 2, kind: "basic-skirmish", force: 1 }]);
  await page.getByRole("button", { name: /Idle producers 1/ }).press("Enter");
  const recipe = page.locator('[data-definition="core.unit:eastern-collective/field-technician"]');
  await expect(recipe).toBeEnabled();
  await recipe.press("Enter");
  await expect(page.locator("[data-credits]")).toHaveText("Credits 4983");
  // Clear the real starting-unit exit blockers through an ordinary selection and move order.
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.7, {
    steps: 4,
  });
  await page.mouse.up();
  await page.mouse.click(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.52, {
    button: "right",
  });
  await expect
    .poll(
      async () =>
        (await state()).snapshot.entities.filter(
          (entity) => entity.force === 0 && entity.definition.endsWith("/field-technician"),
        ).length,
    )
    .toBe(3);
  await page.getByRole("button", { name: /Idle builders/ }).press("Enter");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("draft-skirmish-desktop.png") });
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  const menu = page.getByRole("dialog", { name: "Match menu", exact: true });
  await expect(menu.getByRole("button", { name: "Save game", exact: true })).toBeDisabled();
  await expect(menu.getByRole("button", { name: "Load game", exact: true })).toBeDisabled();
  await expect(
    menu.getByRole("button", { name: "Installed Field Manual", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async (path) => {
    const fixture = Reflect.get(window, "editorFixture"),
      raw = JSON.parse(await fixture.files.get(path).text());
    raw.health = 44;
    fixture.files.set(path, new File([JSON.stringify(raw)], "unit.json"));
  }, technicianPath);
  await menu.getByRole("button", { name: "Restart match", exact: true }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "draftSkirmishProbe").setups.length))
    .toBe(2);
  await expect(canvas).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  expect(
    (await state()).snapshot.entities
      .filter((entity) => entity.definition.endsWith("/field-technician"))
      .every((entity) => entity.maxHealth === 1901),
  ).toBe(true);
  await expect(page.locator("[data-credits]")).toHaveText("Credits 5000");
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("draft-skirmish-mobile.png") });
  await page.getByRole("button", { name: "Return to draft", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Skirmish draft", exact: true })).toBeFocused();
  await expect(page.getByLabel("cost.credits", { exact: true })).toHaveValue("17");
  await page.getByRole("tab", { name: "General", exact: true }).press("Enter");
  await expect(health).toHaveValue("1901");
  await expect(page.locator("[data-draft-skirmish]")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "draftSkirmishProbe").writes)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = Reflect.get(window, "draftSkirmishProbe");
        return probe.audioCreated === probe.audioClosed;
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, "editorFixture").writes)).toBe(0);
  await page.route("**/sim-worker.js", (route) => route.abort());
  await page.getByRole("button", { name: "Skirmish draft", exact: true }).press("Enter");
  await page
    .getByRole("dialog", { name: "Set up draft skirmish" })
    .getByRole("button", { name: "Start skirmish", exact: true })
    .press("Enter");
  await expect(page.locator(".content-tools section > [role=alert]")).toContainText(
    "Simulation worker failed",
    { timeout: 60000 },
  );
  await expect(health).toHaveValue("1901");
  expect(await page.evaluate(() => Reflect.get(window, "draftSkirmishProbe").terminated)).toBe(3);
  expect(await page.evaluate(() => Reflect.get(window, "draftSkirmishProbe").writes)).toBe(0);
});
