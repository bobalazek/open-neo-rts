import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

test("model check previews team colours, clips and file errors", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The WebGL model check is exercised in Chromium.");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/debug?models=1");
  const file = page.getByLabel("Model", { exact: true });
  const path = (name: string) =>
    fileURLToPath(
      new URL(
        `../../../content/core/factions/eastern-collective/units/${name}/${name}.glb`,
        import.meta.url,
      ),
    );
  await file.setInputFiles(path("infiltrator"));
  await expect(page.getByRole("status")).toContainText("infiltrator.glb · 4 animation clips");
  const color = page.getByLabel("Team colour");
  const chooseColor = async (value: string) => {
    await color.evaluate((input, hex) => {
      (input as HTMLInputElement).value = hex;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await page.waitForTimeout(250);
  };
  const frame = () => page.screenshot({ clip: { x: 300, y: 270, width: 680, height: 450 } });
  await chooseColor("#ff2222");
  const red = await frame();
  await chooseColor("#2266ff");
  expect(await frame()).not.toEqual(red);
  await page.getByLabel("Animation").selectOption("move");
  await page.waitForTimeout(150);
  const walking = await frame();
  await page.getByLabel("Animation").selectOption("");
  await page.waitForTimeout(100);
  expect(await frame()).not.toEqual(walking);
  await page.getByLabel("Animation").selectOption("attack");
  await file.setInputFiles({
    name: "broken.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("status")).toContainText("Choose a valid GLB");
  await expect(page.getByLabel("Animation")).toBeEnabled();
  await file.setInputFiles(path("flame-tank"));
  await expect(page.getByRole("status")).toContainText("flame-tank.glb");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
