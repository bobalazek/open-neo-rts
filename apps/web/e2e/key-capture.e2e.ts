import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

interface KeyRow {
  type: string;
  key: string;
  code: string;
  target: string;
  cancelable: boolean;
  prevented: boolean;
  trusted: boolean;
}
interface ProbeSnapshot {
  provenance: string;
  userAgent: string;
  capabilities: Record<string, unknown>;
  rows: KeyRow[];
}
interface ProbeWindow extends Window {
  keyProbe: {
    provenance: string;
    clear(): void;
    snapshot(): ProbeSnapshot;
    permissions(): Promise<void>;
    release(): Promise<void>;
  };
}

const ordinary = [
  ..."QWERASDFZXCVHPUGO".split("").map((key) => `Key${key}`),
  "Escape",
  "Space",
  "Home",
  "Period",
  "Comma",
  "Enter",
  "Shift+Enter",
  "Tab",
  "Shift+Slash",
  "Shift+Equal",
  "Minus",
  "Pause",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "Control+KeyA",
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 10 }, (_, i) => `Shift+Digit${i}`),
  ...Array.from({ length: 4 }, (_, i) => `Alt+Digit${i + 1}`),
];
const reserved = [
  "F1",
  "F3",
  "F5",
  "F11",
  "F12",
  ...["Control", "Meta"].flatMap((modifier) =>
    ["KeyW", "KeyT", "KeyN", "KeyL", "KeyR", "KeyQ"].map((key) => `${modifier}+${key}`),
  ),
  ...Array.from({ length: 10 }, (_, i) => `Control+Digit${i}`),
  ...["Control", "Shift"].flatMap((modifier) =>
    ["F1", "F2", "F3", "F4"].map((key) => `${modifier}+${key}`),
  ),
];

test("record virtual key delivery, focused input and fullscreen/lock capabilities", async ({
  page,
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(45_000);
  const html = await readFile(new URL("./key-capture.html", import.meta.url), "utf8");
  await page.route("**/__key-capture", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/__key-capture");
  await page.evaluate(() => {
    (window as unknown as ProbeWindow).keyProbe.provenance =
      "Playwright virtual keyboard; native accelerators unmeasured";
  });
  const snapshot = () =>
    page.evaluate(() => (window as unknown as ProbeWindow).keyProbe.snapshot());
  const results: { context: string; combination: string; rows: KeyRow[]; error?: string }[] = [];
  async function press(context: string, combination: string) {
    await page.locator(context === "input" ? "#input" : "#surface").focus();
    await page.evaluate(() => (window as unknown as ProbeWindow).keyProbe.clear());
    let error: string | undefined;
    try {
      await page.keyboard.press(combination);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    results.push({
      context,
      combination,
      rows: (await snapshot()).rows,
      ...(error ? { error } : {}),
    });
  }
  for (const key of ordinary) await press("surface", key);
  for (const key of reserved) await press("surface-reserved-virtual-only", key);
  for (const key of [
    "KeyA",
    "KeyS",
    "ArrowLeft",
    "Backspace",
    "Tab",
    "Control+KeyA",
    "Control+Digit1",
    "Meta+KeyL",
  ])
    await press("input", key);
  const inputValue = await page.locator("#input").inputValue();
  await page.evaluate(() => (window as unknown as ProbeWindow).keyProbe.permissions());
  await page.locator("#fullscreen").click();
  await expect
    .poll(async () => (await snapshot()).capabilities.fullscreenRequest, { timeout: 2000 })
    .not.toBe("pending");
  const fullscreen = await snapshot();
  await page.locator("#keyboard").click();
  try {
    await expect
      .poll(async () => (await snapshot()).capabilities.keyboardRequest, { timeout: 1500 })
      .not.toBe("pending");
  } catch {
    /* A pending permission prompt is evidence, not a success. */
  }
  const keyboard = await snapshot();
  for (const key of ["Control+Digit1", "Escape"]) await press("fullscreen-lock-virtual-only", key);
  await page.evaluate(() => (window as unknown as ProbeWindow).keyProbe.release());
  await page.locator("#pointer").click();
  try {
    await expect
      .poll(async () => (await snapshot()).capabilities.pointerRequest, { timeout: 1500 })
      .not.toBe("pending");
  } catch {
    /* Preserve the unresolved request in the report. */
  }
  const pointer = await snapshot();
  await page.evaluate(() => (window as unknown as ProbeWindow).keyProbe.release());
  const report = {
    browserName,
    version: browser.version(),
    platform: process.platform,
    headless: testInfo.project.use.headless ?? true,
    provenance:
      "Playwright virtual keyboard; native browser/OS accelerator capture NOT established",
    fullscreen: fullscreen.capabilities,
    keyboard: keyboard.capabilities,
    pointer: pointer.capabilities,
    inputValue,
    results,
  };
  const reportPath = testInfo.outputPath(`key-capture-${browserName}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach(`key-capture-${browserName}.json`, {
    path: reportPath,
    contentType: "application/json",
  });
  const ordinaryRows = results.filter((result) => result.context === "surface");
  expect(ordinaryRows).toHaveLength(ordinary.length);
  for (const result of ordinaryRows) {
    expect(result.error, result.combination).toBeUndefined();
    const down = result.rows.find(
      (row) => row.type === "keydown" && !["Control", "Shift", "Alt", "Meta"].includes(row.key),
    );
    expect(down?.target, result.combination).toBe("surface");
    expect(down?.prevented, result.combination).toBe(true);
  }
  for (const result of results.filter((row) => row.context === "input"))
    expect(
      result.rows.filter((row) => row.type === "keydown").every((row) => !row.prevented),
      result.combination,
    ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`key-capture-${browserName}.png`) });
});
