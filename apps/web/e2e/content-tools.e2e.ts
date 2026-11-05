import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { parseGlb } from "../../../packages/content/src/assets/glb";
import { contentToolsFixture } from "./content-tools-fixture";
import { nativeFrame } from "./native-paint";

test("socket editor applies checked model-local edits and exports a geometry-preserving GLB", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tools/content?model=core.unit:eastern-collective/dragon-tank");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-model", "Dragon Tank", { timeout: 30000 });
  const edit = page.getByRole("button", { name: "Edit sockets", exact: true });
  await expect(edit).toBeEnabled();
  await page.evaluate(() => Reflect.get(window, "contentToolPaint").delete("Edit sockets"));
  await edit.focus();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const point = Reflect.get(window, "contentToolPaint").get("Edit sockets");
        const bounds = document.querySelector(".content-tools-controls")!.getBoundingClientRect();
        return !!point && point.y > bounds.y + 80 && point.y < bounds.bottom - 60;
      }),
    )
    .toBe(true);
  const point = await page.evaluate(
    () => Reflect.get(window, "contentToolPaint").get("Edit sockets") as { x: number; y: number },
  );
  await page.mouse.click(point.x, point.y);
  const editor = page.locator("[data-socket-editor]");
  await expect(editor).toHaveCount(1);
  const socket = page.getByLabel("Socket", { exact: true });
  await socket.selectOption({ label: "socket_muzzle_0" });
  const x = page.getByLabel("Local X (m)", { exact: true });
  const initial = await x.inputValue();
  await x.fill("2.5");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel socket edits", exact: true }).press("Enter");
  await expect(editor).toHaveCount(0);
  await edit.press("Enter");
  await expect(editor).toHaveCount(1);
  await socket.selectOption({ label: "socket_muzzle_0" });
  await expect(x).toHaveValue(initial);
  await x.fill("bad");
  await expect(editor.getByRole("alert")).toContainText("finite positions");
  await expect(page.getByRole("button", { name: "Apply to preview", exact: true })).toBeDisabled();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("sockets-invalid-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await x.focus();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("sockets-invalid-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  const selected = await socket.inputValue();
  await socket.selectOption({ label: "socket_exhaust_0" });
  await expect(socket).toHaveValue(selected);
  await expect(x).toHaveValue("bad");
  await x.fill("0.25");
  await page.getByLabel("New socket parent", { exact: true }).selectOption({ label: "turret" });
  await page.getByLabel("New socket name", { exact: true }).fill("socket_marker");
  await page.getByRole("button", { name: "Add socket", exact: true }).press("Enter");
  await expect(socket.locator("option:checked")).toHaveText("socket_marker");
  await x.fill("0.5");
  await page.getByLabel("Rotation Y (°)", { exact: true }).fill("45");
  await page.getByLabel("Gizmo", { exact: true }).selectOption("rotate");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("sockets-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await socket.focus();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("sockets-mobile.png") });
  await page.getByRole("button", { name: "Apply to preview", exact: true }).press("Enter");
  await expect(editor).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByRole("button", { name: "Fire", exact: true })).toBeEnabled();
  await expect(page.locator("[data-model-checks]")).toContainText("socket_marker");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GLB", exact: true }).press("Enter");
  const download = await downloading;
  const bytes = new Uint8Array(await readFile((await download.path())!));
  const gltf = parseGlb(bytes);
  const muzzle = gltf.nodes!.find((node) => node.name === "socket_muzzle_0")!;
  expect(muzzle.translation![0]).toBe(0.25);
  const marker = gltf.nodes!.findIndex((node) => node.name === "socket_marker");
  expect(gltf.nodes![marker]!.translation![0]).toBe(0.5);
  expect(gltf.nodes!.find((node) => node.name === "turret")!.children).toContain(marker);
  const original = new Uint8Array(
    await readFile(
      fileURLToPath(
        new URL(
          "../../../content/core/factions/eastern-collective/units/dragon-tank/dragon-tank.glb",
          import.meta.url,
        ),
      ),
    ),
  );
  const tail = (value: Uint8Array) =>
    value.subarray(
      20 + new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(12, true),
    );
  expect(tail(bytes)).toEqual(tail(original));
  expect(gltf.animations).toEqual(parseGlb(original).animations);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles({
    name: "socket-roundtrip.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(bytes),
  });
  await expect(world).toHaveAttribute("data-model", "socket-roundtrip.glb");
  await edit.press("Enter");
  await expect(editor).toHaveCount(1);
  await socket.selectOption({ label: "socket_marker" });
  await expect(x).toHaveValue("0.5");
  await expect(page.getByLabel("Rotation Y (°)", { exact: true })).toHaveValue("45");
  await page.getByRole("button", { name: "Cancel socket edits", exact: true }).press("Enter");
  expect(errors).toEqual([]);
});

test("model actions fire, destroy and restore original paired models while retaining good art after a failed pair", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/tools/content?model=core.unit:eastern-collective/dragon-tank");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-model", "Dragon Tank", { timeout: 30000 });
  const fire = page.getByRole("button", { name: "Fire", exact: true });
  const destroy = page.getByRole("button", { name: "Destroy", exact: true });
  const restore = page.getByRole("button", { name: "Restore model", exact: true });
  await expect(fire).toBeEnabled();
  const live = await world.screenshot();
  await destroy.press("Enter");
  await expect(fire).toBeDisabled();
  await expect(destroy).toBeDisabled();
  await page.waitForTimeout(850);
  expect(await world.screenshot()).not.toEqual(live);
  await restore.press("Enter");
  await expect(fire).toBeEnabled();
  expect(await world.screenshot()).toEqual(live);
  await fire.press("Enter");
  await page.waitForTimeout(350);
  await restore.press("Enter");
  await world.click();
  await expect(world).toBeFocused();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("model-actions-desktop.png") });
  await destroy.press("Enter");
  // Bun serves hashed asset names; fail the paired wreck after the new live model request.
  const rubble = /\.glb(?:\?|$)/;
  let requested = 0;
  await page.route(rubble, (route) =>
    ++requested === 2 ? route.fulfill({ body: "broken" }) : route.continue(),
  );
  await page
    .getByLabel("Installed definition", { exact: true })
    .selectOption("core.structure:eastern-collective/industrial-reactor");
  await expect(page.getByRole("alert")).toContainText("previous model");
  expect(requested).toBe(2);
  await expect(world).toHaveAttribute("data-model", "Dragon Tank");
  await expect(fire).toBeDisabled();
  await expect(destroy).toBeDisabled();
  await restore.press("Enter");
  await expect(fire).toBeEnabled();
  await page.unroute(rubble);
  const retry = page.getByRole("button", { name: "Retry loading", exact: true });
  await expect(retry).toBeEnabled();
  await retry.press("Enter");
  await expect(world).toHaveAttribute("data-model", "Industrial Reactor");
  await expect(fire).toBeDisabled();
  await destroy.press("Enter");
  await page.waitForTimeout(850);
  await page.setViewportSize({ width: 390, height: 844 });
  await restore.focus();
  await world.click();
  await expect(world).toBeFocused();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("model-actions-mobile.png") });
  await restore.press("Enter");
  await expect(destroy).toBeEnabled();
  await expect(page.getByRole("alert")).toBeEmpty();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const painted = new Map<string, { x: number; y: number; ink?: boolean }>();
    Reflect.set(window, "contentToolPaint", painted);
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) {
      Reflect.apply(fill, this, args);
      const bounds = document.querySelector(".content-tools-controls")?.getBoundingClientRect();
      if (
        bounds &&
        this.canvas.width >= bounds.width * 0.6 &&
        this.canvas.height >= bounds.height * 0.6
      ) {
        const size = Number.parseFloat(this.font.match(/[\d.]+px/)?.[0] ?? "16");
        const point = this.getTransform().transformPoint({
          x: args[1] + this.measureText(args[0]).width / 2,
          y: args[2] - size / 3,
        });
        painted.set(args[0], {
          x: bounds.x + (point.x * bounds.width) / this.canvas.width,
          y: bounds.y + (point.y * bounds.height) / this.canvas.height,
          ...(args[0] === "track_r_hub_4" && {
            ink: this.getImageData(
              point.x - this.measureText(args[0]).width / 2,
              point.y - size,
              this.measureText(args[0]).width,
              size * 2,
            ).data.some(
              (value, index, pixels) =>
                index % 4 === 0 &&
                value > 180 &&
                pixels[index + 1]! > 180 &&
                pixels[index + 2]! > 170,
            ),
          }),
        });
      }
    };
  });
});

test("content tools preview installed models and local team/clip/LOD/damage changes, retaining a valid model on failure", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/tools/content?model=core.unit:eastern-collective/dragon-tank");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-model", "Dragon Tank", { timeout: 30_000 });
  await expect(page.locator(".content-tools-controls")).toHaveAttribute(
    "data-panel",
    "content-tools",
  );
  await expect(page.locator("[data-model-checks]")).toContainText("0 errors");
  const materials = page.locator("summary").filter({ hasText: "Materials" });
  await materials.focus();
  await materials.press("Enter");
  await page.evaluate(() => Reflect.get(window, "contentToolPaint").clear());
  await page.getByRole("region", { name: "Materials", exact: true }).focus();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const point = Reflect.get(window, "contentToolPaint").get("team");
        const bounds = document.querySelector(".content-tools-controls")!.getBoundingClientRect();
        return !!point && point.y > bounds.y + 100 && point.y < bounds.bottom - 24;
      }),
    )
    .toBe(true);
  await page.evaluate(() => Reflect.get(window, "contentToolPaint").clear());
  await page.setViewportSize({ width: 390, height: 844 });
  const nodes = page.locator("summary").filter({ hasText: "Nodes and parts" });
  await nodes.focus();
  await nodes.press("Enter");
  await page.evaluate(() => Reflect.get(window, "contentToolPaint").clear());
  const nodeRegion = page.getByRole("region", { name: "Nodes and parts", exact: true });
  await nodeRegion.focus();
  await nativeFrame(page);
  await nodeRegion.press("End");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const point = Reflect.get(window, "contentToolPaint").get("track_r_hub_4");
        const bounds = document.querySelector(".content-tools-controls")!.getBoundingClientRect();
        return !!point?.ink && point.y > bounds.y + 90 && point.y < bounds.bottom - 70;
      }),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await nativeFrame(page);
  await page.evaluate(() => Reflect.get(window, "contentToolPaint").clear());
  await page.getByLabel("Team colour", { exact: true }).focus();
  for (const label of ["Red", "Blue"]) {
    await expect
      .poll(() =>
        page.evaluate((label) => Reflect.get(window, "contentToolPaint").has(label), label),
      )
      .toBe(true);
    const point = await page.evaluate(
      (label) => Reflect.get(window, "contentToolPaint").get(label) as { x: number; y: number },
      label,
    );
    await page.mouse.click(point.x, point.y);
  }
  await expect(page.getByLabel("Team colour", { exact: true })).toHaveValue("#3c93d9");
  const input = page.locator('input[type="file"]');
  await page.evaluate(() => Reflect.get(window, "contentToolPaint").delete("Open local GLB"));
  await page.getByRole("button", { name: "Open local GLB", exact: true }).focus();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const point = Reflect.get(window, "contentToolPaint").get("Open local GLB");
        const bounds = document.querySelector(".content-tools-controls")!.getBoundingClientRect();
        return point && point.y > bounds.bottom - 100 && point.y < bounds.bottom;
      }),
    )
    .toBe(true);
  const openPoint = await page.evaluate(
    () => Reflect.get(window, "contentToolPaint").get("Open local GLB") as { x: number; y: number },
  );
  const choosing = page.waitForEvent("filechooser", { timeout: 5000 });
  await page.mouse.click(openPoint.x, openPoint.y);
  await (await choosing).setFiles({
    name: "viewer-fixture.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(contentToolsFixture()),
  });
  await expect(world).toHaveAttribute("data-model", "viewer-fixture.glb");
  await expect(page.getByLabel("Installed definition", { exact: true })).toHaveValue("");
  const choose = async (name: string, value: string) => {
    await page.getByLabel(name, { exact: true }).evaluate((element, value) => {
      (element as HTMLSelectElement).value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(180);
  };
  const picture = () => world.screenshot();
  await choose("Team colour", "#d8443a");
  const red = await picture();
  await choose("Team colour", "#3c93d9");
  expect(await picture()).not.toEqual(red);
  await choose("Level of detail", "0");
  const high = await picture();
  await choose("Level of detail", "1");
  expect(await picture()).not.toEqual(high);
  const low = await picture();
  await choose("Damage-state preview", "65");
  expect(await picture()).toEqual(low);
  await choose("Level of detail", "0");
  await choose("Damage-state preview", "100");
  const healthy = await picture();
  await choose("Damage-state preview", "65");
  expect(await picture()).not.toEqual(healthy);
  await choose("Damage-state preview", "100");
  await choose("Animation", "move");
  const moving = await picture();
  await choose("Animation", "");
  expect(await picture()).not.toEqual(moving);
  await world.hover();
  await page.mouse.wheel(0, 100000);
  await page.waitForTimeout(800);
  await choose("Level of detail", "0");
  const farHigh = await picture();
  await choose("Level of detail", "auto");
  expect(await picture()).not.toEqual(farHigh);
  await input.setInputFiles({
    name: "bad.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toContainText("previous model");
  await expect(world).toHaveAttribute("data-model", "viewer-fixture.glb");
  await expect(page.getByLabel("Animation", { exact: true })).toBeEnabled();
  await input.setInputFiles(
    fileURLToPath(
      new URL(
        "../../../content/core/factions/eastern-collective/units/infiltrator/infiltrator.glb",
        import.meta.url,
      ),
    ),
  );
  await expect(world).toHaveAttribute("data-model", "infiltrator.glb");
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], "unpaired.glb", { type: "model/gltf-binary" }),
      );
      return data;
    },
    Array.from(contentToolsFixture(false)),
  );
  await world.dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(world).toHaveAttribute("data-model", "unpaired.glb");
  await expect(page.getByLabel("Level of detail", { exact: true })).toBeDisabled();
  await page.getByLabel("Find a model", { exact: true }).fill("unmatched model phrase");
  await expect(page.locator("[data-empty]")).not.toHaveAttribute("hidden", "");
  await page.getByLabel("Find a model", { exact: true }).fill("rocket trooper");
  await expect(world).toHaveAttribute("data-model", "Rocket Trooper");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("unknown installed links recover without fetching arbitrary remote models", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "other.invalid") remote.push(request.url());
  });
  await page.goto("/tools/content?model=https%3A%2F%2Fother.invalid%2Fmodel.glb");
  await expect(page.getByRole("alert")).toContainText("unknown");
  await page.getByLabel("Find a model", { exact: true }).fill("dragon tank");
  await expect(page.locator("#game")).toHaveAttribute("data-model", "Dragon Tank", {
    timeout: 30_000,
  });
  expect(remote).toEqual([]);
});
