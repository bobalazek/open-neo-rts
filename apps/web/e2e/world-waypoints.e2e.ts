import { expect, type Page, test } from "@playwright/test";
import type { SeatSnapshot } from "../../../packages/sim/src";
import { nativeFrame } from "./native-paint";

async function actor(page: Page, handle: string) {
  return page.evaluate((handle) => {
    const snapshot = Reflect.get(window, "waypointProbe").snapshot as SeatSnapshot;
    return snapshot.entities.find((row) => row.handle === handle);
  }, handle);
}

test("real world markers drag and remove pending moves and shared builds without replacing Hold or changing selection", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      "open-neo-rts.settings.v1",
      JSON.stringify({
        format: 1,
        quality: "medium",
        uiScale: 100,
        cameraSpeed: 100,
        edgeScroll: false,
        reducedMotion: true,
      }),
    );
    const probe = {
      snapshot: undefined as SeatSnapshot | undefined,
      worker: undefined as Worker | undefined,
      commands: [] as { type: string; payload: { entities?: string[] } }[],
    };
    Reflect.set(window, "waypointProbe", probe);
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      ...args: [message: unknown, transfer?: Transferable[] | StructuredSerializeOptions]
    ) {
      const request = args[0] as {
        type?: string;
        command?: { type: string; payload: { entities?: string[] } };
      };
      if (request.type === "command" && request.command)
        probe.commands.push(structuredClone(request.command));
      return Reflect.apply(post, this, args);
    };
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes("sim-worker")) return;
        probe.worker = this;
        this.addEventListener("message", ({ data }) => {
          if (data.state?.snapshot) probe.snapshot = data.state.snapshot;
        });
      }
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  const world = page.locator("#game");
  await expect(world).toHaveAttribute("data-session", "ready", { timeout: 60_000 });
  const idle = page.getByRole("button", { name: /^Idle builders / });
  await expect(idle).toBeEnabled();
  await idle.press("Enter");
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
  await world.focus();
  await page.keyboard.press("h");
  let handle = "";
  await expect
    .poll(async () => {
      handle = await page.evaluate(
        () =>
          Reflect.get(window, "waypointProbe").commands.find(
            (row: { type: string }) => row.type === "unit.hold",
          )?.payload.entities[0] ?? "",
      );
      return handle;
    })
    .not.toBe("");
  await expect.poll(async () => (await actor(page, handle))?.holdPosition).toBe(true);
  await page.keyboard.press("Home");

  async function queue(x: number, y: number) {
    await world.focus();
    await page.keyboard.press("q");
    await expect(world).toHaveAttribute("data-command-mode", "unit.move");
    await page.keyboard.down("Shift");
    await page.mouse.click(x, y);
    await page.keyboard.up("Shift");
    await page.keyboard.press("Escape");
    await expect(world).not.toHaveAttribute("data-command-mode", "unit.move");
    await expect.poll(async () => (await actor(page, handle))?.queuedOrders?.length).toBe(1);
  }
  async function hover(x: number, y: number) {
    // Cell centres and build origins project beside the unsnapped click. Aim by actual hover feedback.
    for (const radius of [0, 8, 16, 24]) {
      for (let dx = -radius; dx <= radius; dx += 8) {
        for (let dy = -radius; dy <= radius; dy += 8) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          await page.mouse.move(x + dx, y + dy);
          await nativeFrame(page);
          if (await world.evaluate((canvas) => getComputedStyle(canvas).cursor === "grab"))
            return { x: x + dx, y: y + dy };
        }
      }
    }
    throw new Error(`No editable rendered marker near ${x},${y}`);
  }
  async function drag(x: number, y: number, toX: number, toY: number, cancel = false) {
    await hover(x, y);
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 8 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  }

  for (const layout of [
    { name: "desktop", width: 1440, height: 900, x: 620, y: 420, toX: 710, toY: 450 },
    { name: "narrow", width: 390, height: 844, x: 165, y: 340, toX: 220, toY: 400 },
  ]) {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await nativeFrame(page);
    await queue(layout.x, layout.y);
    const before = (await actor(page, handle))!.queuedOrders![0]!;
    await hover(layout.x, layout.y);
    await page.screenshot({ path: info.outputPath(`${layout.name}-hover.png`) });
    await page.mouse.down();
    await page.mouse.move(layout.toX, layout.toY, { steps: 8 });
    await nativeFrame(page);
    // Preview changes rendering only; the authoritative queue changes on release.
    expect((await actor(page, handle))?.queuedOrders?.[0]).toEqual(before);
    await page.screenshot({ path: info.outputPath(`${layout.name}-preview.png`) });
    await page.mouse.up();
    await expect
      .poll(async () => (await actor(page, handle))?.queuedOrders?.[0]?.x)
      .not.toBe(before.x);
    const moved = (await actor(page, handle))!;
    const pending = moved.queuedOrders![0]!;
    expect(moved.queuedOrders?.[0]?.handle).toBe(before.handle);
    expect(pending.x! % 1024).toBe(512);
    expect(pending.y! % 1024).toBe(512);
    expect(moved.holdPosition).toBe(true);
    expect(moved.order).toBeNull();
    await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
    await drag(layout.toX, layout.toY, layout.x, layout.y, true);
    expect((await actor(page, handle))?.queuedOrders).toEqual(moved.queuedOrders);
    await expect(page.getByRole("dialog", { name: "Match menu", exact: true })).not.toBeVisible();
    // A drag released over the command station is canceled, not sent through its controls.
    await drag(layout.toX, layout.toY, layout.width - 20, layout.height - 20);
    expect((await actor(page, handle))?.queuedOrders).toEqual(moved.queuedOrders);
    const remove = await hover(layout.toX, layout.toY);
    await page.mouse.click(remove.x, remove.y, { button: "right" });
    await expect.poll(async () => (await actor(page, handle))?.queuedOrders?.length ?? 0).toBe(0);
    expect((await actor(page, handle))?.holdPosition).toBe(true);
    expect((await actor(page, handle))?.order).toBeNull();
    await expect(page.locator("[data-summary]")).toHaveText("Selected: 1");
    await nativeFrame(page);
    await page.screenshot({ path: info.outputPath(`${layout.name}-removed.png`) });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await nativeFrame(page);
  await queue(620, 420);
  const destination = (await actor(page, handle))!.queuedOrders![0]!;
  const shared = await page.evaluate(
    async ({ handle, destination }) => {
      const probe = Reflect.get(window, "waypointProbe") as {
        worker: Worker;
        snapshot: SeatSnapshot;
      };
      let next = 9_100_000;
      const command = (type: string, payload: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          const id = next++;
          const listener = ({ data }: MessageEvent) => {
            if (data.id !== id) return;
            probe.worker.removeEventListener("message", listener);
            if (data.error) reject(new Error(data.error));
            else resolve(data.result);
          };
          probe.worker.addEventListener("message", listener);
          probe.worker.postMessage({ id, type: "command", command: { type, payload } });
        });
      const builders = probe.snapshot.entities
        .filter((row) => row.force === 0 && row.definition.endsWith("/field-technician"))
        .map((row) => row.handle);
      if (!builders.includes(handle) || builders.length !== 2)
        throw new Error("Missing actual starter builders");
      if ((await command("unit.hold", { entities: builders })) !== "accepted")
        throw new Error("Hold refused");
      if (
        (await command("economy.build", {
          force: 0,
          definition: "core.structure:eastern-collective/industrial-reactor",
          builders,
          x: Math.floor(destination.x! / 1024) * 1024,
          y: Math.floor(destination.y! / 1024) * 1024,
          facing: 16384,
          append: 1,
        })) !== "accepted"
      )
        throw new Error("Queued shared build refused");
      return {
        builders,
        spent: probe.snapshot.statistics?.find((row) => row.force === 0)?.counters.creditsSpent,
      };
    },
    { handle, destination },
  );
  await expect
    .poll(async () => (await actor(page, handle))?.queuedOrders?.[0]?.type)
    .toBe("economy.build");
  expect(shared.spent).toBe(0);
  const sharedBefore = (await actor(page, handle))!.queuedOrders![0]!.x;
  await drag(620, 420, 710, 450);
  await expect
    .poll(async () => (await actor(page, handle))?.queuedOrders?.[0]?.x)
    .not.toBe(sharedBefore);
  const rows = await Promise.all(shared.builders.map((builder) => actor(page, builder)));
  const sharedPoint = rows[0]!.queuedOrders![0]!;
  expect(rows[0]?.queuedOrders?.[0]?.x).toBe(rows[1]?.queuedOrders?.[0]?.x);
  expect(sharedPoint.x! % 1024).toBe(0);
  expect(sharedPoint.y! % 1024).toBe(0);
  expect(rows.every((row) => row?.holdPosition)).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (Reflect.get(window, "waypointProbe").snapshot as SeatSnapshot).statistics?.find(
          (row) => row.force === 0,
        )?.counters.creditsSpent,
    ),
  ).toBe(shared.spent);
  await hover(710, 450);
  const camera = page.locator("[data-camera-cell]");
  const priorCamera = await camera.getAttribute("data-camera-cell");
  await page.mouse.down({ button: "right" });
  await page.mouse.move(770, 480, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await expect(camera).not.toHaveAttribute("data-camera-cell", priorCamera!);
  expect((await actor(page, handle))?.queuedOrders).toHaveLength(1);
  await world.focus();
  await page.keyboard.press("Home");
  await expect(camera).toHaveAttribute("data-camera-cell", priorCamera!);
  const remove = await hover(710, 450);
  await page.mouse.click(remove.x, remove.y, { button: "right" });
  await expect
    .poll(async () => {
      const rows = await Promise.all(shared.builders.map((builder) => actor(page, builder)));
      return rows.map((row) => row?.queuedOrders?.length ?? 0);
    })
    .toEqual([0, 0]);
  await world.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-summary]")).toHaveText("Selected: 0");
  await page.mouse.move(710, 450);
  await expect(world).not.toHaveCSS("cursor", "grab");
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("desktop-empty.png") });
  expect(errors).toEqual([]);
});
