import { expect, test } from "@playwright/test";
import type { SeatSnapshot } from "../../../packages/sim/src";

test("normal minimap masks shroud, pans locally, returns Home and submits owned orders through the worker", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Normal minimap WebGL smoke runs in Chromium");
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const observed: string[] = [];
    Reflect.set(window, "minimapOrders", observed);
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener(
          "message",
          ({ data }: MessageEvent<{ state?: { snapshot?: SeatSnapshot } }>) => {
            for (const entity of data.state?.snapshot?.entities ?? []) {
              if (
                entity.force !== 0 ||
                !entity.definition.endsWith("/field-technician") ||
                !entity.order
              )
                continue;
              const key = `${entity.force}|${entity.definition}|${entity.order.type}|${entity.order.x}|${entity.order.y}`;
              if (!observed.includes(key)) observed.push(key);
              if (observed.length > 32) observed.shift();
            }
          },
        );
      }
    };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  const world = page.locator("#game"),
    minimap = page.locator(".hud-minimap canvas");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  await expect(minimap).toHaveAttribute("data-markers", "7");
  expect(
    await minimap.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return [
        ...(canvas.getContext("2d")?.getImageData(canvas.width - 4, canvas.height - 4, 1, 1).data ??
          []),
      ];
    }),
  ).toEqual([0, 0, 0, 255]);
  const bounds = await minimap.boundingBox();
  if (!bounds) throw new Error("Minimap bounds missing");
  await minimap.click({ position: { x: bounds.width * 0.75, y: bounds.height * 0.75 } });
  await expect(minimap).toHaveAttribute("data-camera-cell", /^9[56],9[56]$/);
  const panned = await minimap.getAttribute("data-camera-cell");
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-minimap [role=status]")).toHaveText(
    "No recent notices. No camera jump was made.",
  );
  await expect(minimap).toHaveAttribute("data-camera-cell", panned ?? "");
  await page.keyboard.press("Home");
  await expect(minimap).toHaveAttribute("data-camera-cell", /^(19|20),(19|20)$/);
  const oldTop = await page.locator(".match-top").boundingBox();
  const oldHud = await page.locator(".match-hud").boundingBox();
  if (!oldTop || !oldHud) throw new Error("HUD bounds missing");
  // Keep this regression's insets fixed: growing notices otherwise hit the viewport-relative cap.
  await page.locator(".match-hud").evaluate((element, height) => {
    element.style.maxHeight = `${height}px`;
  }, oldHud.height);
  await page.setViewportSize({ width: 1280, height: 820 });
  const newTop = await page.locator(".match-top").boundingBox();
  const newHud = await page.locator(".match-hud").boundingBox();
  if (!newTop || !newHud) throw new Error("Resized HUD bounds missing");
  expect(newTop.height).toBe(oldTop.height);
  expect(newHud.height).toBe(oldHud.height);
  // Only the canvas height changed; box selection must still cover the rendered playable area.
  await page.mouse.move(1270, newHud.y - 10);
  await page.mouse.down();
  await page.mouse.move(10, newTop.y + newTop.height + 10, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 7");
  await page.keyboard.press("Escape");
  const centre = (newTop.y + newTop.height + newHud.y) / 2;
  await page.mouse.move(632, centre - 8);
  await page.mouse.down();
  await page.mouse.move(648, centre + 8, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await expect(page.locator("[data-details]")).toContainText("Command Center");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Idle builders 2/ }).click();
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  async function orderCell(x: number, y: number) {
    const current = await minimap.boundingBox();
    if (!current) throw new Error("Minimap bounds missing");
    await page.mouse.click(
      current.x + (current.width * (x + 0.5)) / 128,
      current.y + (current.height * (y + 0.5)) / 128,
      { button: "right" },
    );
  }
  const observedOrder = (type: string, x: number, y: number) =>
    expect
      .poll(() => page.evaluate(() => Reflect.get(window, "minimapOrders") as string[]))
      .toContain(
        `0|core.unit:eastern-collective/field-technician|${type}|${x * 1024 + 512}|${y * 1024 + 512}`,
      );
  await orderCell(26, 23);
  await observedOrder("move", 26, 23);
  await minimap.focus();
  await expect(minimap).toBeFocused();
  await page.keyboard.press("a");
  await expect(world).toHaveAttribute("data-command-mode", "unit.attackMove");
  await orderCell(24, 25);
  await observedOrder("attackMove", 24, 25);
  await expect(world).not.toHaveAttribute("data-command-mode", "unit.attackMove");
  await orderCell(27, 24);
  await observedOrder("move", 27, 24);
  await minimap.focus();
  await page.keyboard.press("a");
  await page.keyboard.press("Escape");
  await expect(world).not.toHaveAttribute("data-command-mode", "unit.attackMove");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(page.locator("[data-credits]")).toHaveText("Credits 5000");
  await page.screenshot({ path: info.outputPath("minimap-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Minimap", exact: true }).click();
  await expect(minimap).toBeVisible();
  expect(
    await page
      .locator(".match-hud")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("minimap-mobile.png") });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave match", exact: true }).click();
  await expect(world).toBeHidden();
  await expect(minimap).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("local minimap pings refuse shroud and support keyboard placement and Space", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded offline minimap ping journey");
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).click();
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const minimap = page.locator(".hud-minimap canvas");
  await minimap.click({ position: { x: 150, y: 150 }, modifiers: ["Alt"] });
  await expect(page.locator(".hud-minimap [role=status]")).toHaveText(
    "Explore this location before placing a ping.",
  );
  await expect(page.locator(".match-notices li")).toHaveCount(0);
  await minimap.focus();
  await page.keyboard.press("Home");
  await page
    .getByLabel("Local ping type (Alt-click minimap)", { exact: true })
    .selectOption("danger");
  await page.getByRole("button", { name: "Ping camera location", exact: true }).click();
  await expect(page.locator(".match-notices button")).toHaveText(/^Danger · (19|20), (19|20)$/);
  await expect(page.locator(".hud-minimap [role=status]")).toContainText(
    "offline match does not send",
  );
  await minimap.click({ position: { x: 110, y: 110 } });
  await minimap.focus();
  await page.keyboard.press("Space");
  await expect(minimap).toHaveAttribute("data-camera-cell", /^(19|20),(19|20)$/);
  await page.getByRole("button", { name: "Match menu", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog", { name: "Match menu", exact: true })
    .getByRole("button", { name: "Leave match", exact: true })
    .click();
  await expect(page.locator(".match-notices")).toHaveCount(0);
});
