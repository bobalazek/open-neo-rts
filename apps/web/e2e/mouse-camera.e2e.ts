import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const fixture = execFileSync(
  "bun",
  ["build", "apps/web/e2e/mouse-camera-proof.ts", "--target=browser", "--minify"],
  { cwd: new URL("../../../", import.meta.url), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);

test("mouse camera sensitivity scales drag and wheel without changing programmatic zoom", async ({
  page,
}) => {
  await page.route("http://mouse-camera.test/**", (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith(".js") ? "text/javascript" : "text/html",
      body: route.request().url().endsWith(".js")
        ? fixture
        : '<canvas width="600" height="400" tabindex="0"></canvas>',
    }),
  );
  await page.goto("http://mouse-camera.test/");
  await page.evaluate(async () => {
    const path = "/fixture.js";
    const { mount } = await import(path);
    Reflect.set(window, "mouseCamera", mount());
  });
  const pose = () => page.evaluate(() => Reflect.get(window, "mouseCamera").pose());
  async function drag(button: "right" | "middle") {
    await page.mouse.move(200, 150);
    await page.mouse.down({ button });
    await page.mouse.move(260, 150);
    await page.mouse.up({ button });
    return pose();
  }
  const normal = await drag("right");
  await page.evaluate(() => Reflect.get(window, "mouseCamera").reset(2));
  const fast = await drag("right");
  expect(fast.x).toBeCloseTo(normal.x * 2, 6);
  expect(Math.abs(normal.x)).toBeGreaterThan(0);
  await page.evaluate(() => Reflect.get(window, "mouseCamera").reset(1));
  const rotation = await drag("middle");
  await page.evaluate(() => Reflect.get(window, "mouseCamera").reset(2, true));
  const inverted = await drag("middle");
  expect(inverted.alpha - Math.PI / 2).toBeCloseTo(-2 * (rotation.alpha - Math.PI / 2), 6);
  await page.evaluate(() => Reflect.get(window, "mouseCamera").reset(1));
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await pose()).radius).toBeGreaterThan(60);
  const zoom = (await pose()).radius;
  await page.evaluate(() => Reflect.get(window, "mouseCamera").reset(2));
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await pose()).radius).toBeGreaterThan(60);
  expect((await pose()).radius / 60).toBeCloseTo((zoom / 60) ** 2, 6);
  await page.evaluate(() => {
    const f = Reflect.get(window, "mouseCamera");
    f.reset(2);
    f.camera.zoomBy(100);
  });
  expect((await pose()).radius).toBeCloseTo(zoom, 6);
  await page.evaluate(() => Reflect.get(window, "mouseCamera").dispose());
});
