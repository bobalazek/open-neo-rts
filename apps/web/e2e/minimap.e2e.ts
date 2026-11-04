import { expect, type Page, test } from "@playwright/test";
import type { SeatSnapshot } from "../../../packages/sim/src";
import { clickNativeIcon, nativeFrame, nativeMapPoint, observeNativePaint } from "./native-paint";

async function clickMap(
  page: Page,
  x: number,
  y: number,
  options: { button?: "left" | "right"; alt?: boolean } = {},
) {
  const point = await nativeMapPoint(page, x, y);
  if (options.alt) await page.keyboard.down("Alt");
  try {
    await page.mouse.click(point.x, point.y, { button: options.button ?? "left" });
  } finally {
    if (options.alt) await page.keyboard.up("Alt");
  }
}

test("normal minimap masks shroud, pans locally, returns Home and submits owned orders through the worker", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Normal minimap WebGL smoke runs in Chromium");
  test.setTimeout(90_000);
  await observeNativePaint(page);
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
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
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
  await clickMap(page, 0.75, 0.75);
  await expect(minimap).toHaveAttribute("data-camera-cell", /^9[56],9[56]$/);
  const panned = await minimap.getAttribute("data-camera-cell");
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-minimap [role=status]")).toHaveText(
    "No recent notices. No camera jump was made.",
  );
  await expect(minimap).toHaveAttribute("data-camera-cell", panned ?? "");
  await page.keyboard.press("Home");
  await expect(minimap).toHaveAttribute("data-camera-cell", /^(19|20),(19|20)$/);
  await page.setViewportSize({ width: 1280, height: 820 });
  await nativeFrame(page);
  // The world now uses the full viewport; the native station blocks only its actual regions.
  await page.mouse.move(1020, 810);
  await page.mouse.down();
  await page.mouse.move(10, 50, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 7");
  await page.screenshot({ path: info.outputPath("mixed-desktop.png") });
  const truck = page.locator("[data-types] button").filter({ hasText: "Supply Truck" });
  await clickNativeIcon(page, truck);
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await expect(page.locator("[data-details]")).toContainText("Supply Truck");
  await page.keyboard.press("Escape");
  const centre = 410;
  await page.mouse.move(632, centre - 8);
  await page.mouse.down();
  await page.mouse.move(648, centre + 8, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await expect(page.locator("[data-details]")).toContainText("Command Center");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Idle builders 2/ }).press("Enter");
  await expect(page.locator("[data-details]")).toContainText("Field Technician");
  async function orderCell(x: number, y: number) {
    await clickMap(page, (x + 0.5) / 128, (y + 0.5) / 128, { button: "right" });
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
  await nativeFrame(page);
  await expect(minimap).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("minimap-mobile.png") });
  await page.getByRole("button", { name: "Leave match", exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Leave without saving", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Leave without saving", exact: true }).press("Enter");
  await expect(world).not.toHaveAttribute("data-session", "ready");
  await expect(world).toHaveAttribute("data-setup", "ready");
  await expect(minimap).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("local minimap pings refuse shroud and support keyboard placement and Space", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded offline minimap ping journey");
  test.setTimeout(90_000);
  await observeNativePaint(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const minimap = page.locator(".hud-minimap canvas");
  await clickMap(page, 0.9, 0.9, { alt: true });
  await expect(page.locator(".hud-minimap [role=status]")).toHaveText(
    "Explore this location before placing a ping.",
  );
  const refusedAt = Number(await page.locator("#game").getAttribute("data-tick"));
  await page.waitForFunction(
    (tick) => Number(document.querySelector("#game")?.getAttribute("data-tick")) >= tick + 3,
    refusedAt,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(window, "nativePaintText").has("Explore this location before placing a ping."),
      ),
    )
    .toBe(true);
  await expect(page.locator(".match-notices li")).toHaveCount(0);
  await clickMap(page, 0.06, 0.02, { alt: true });
  await minimap.focus();
  await page.keyboard.press("Home");
  await page
    .getByLabel("Local ping type (Alt-click minimap)", { exact: true })
    .selectOption("danger");
  await page.getByRole("button", { name: "Ping camera location", exact: true }).press("Enter");
  await expect(page.locator(".match-notices button")).toHaveText(/^Danger · (19|20), (19|20)$/);
  await expect(page.locator(".hud-minimap [role=status]")).toContainText(
    "offline match does not send",
  );
  await clickMap(page, 0.75, 0.75);
  await minimap.focus();
  await page.keyboard.press("Space");
  await expect(minimap).toHaveAttribute("data-camera-cell", /^(19|20),(19|20)$/);
  await page.getByRole("button", { name: "Match menu", exact: true }).press("Enter");
  await expect(
    page
      .getByRole("dialog", { name: "Match menu", exact: true })
      .getByRole("button", { name: "Leave match", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("dialog", { name: "Match menu", exact: true })
    .getByRole("button", { name: "Leave match", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Leave without saving", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Leave without saving", exact: true }).press("Enter");
  await expect(page.locator(".match-notices")).toHaveCount(0);
});
