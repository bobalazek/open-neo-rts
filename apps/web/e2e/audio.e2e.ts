import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { clickNativeText, nativeFrame, nativeTextPoint, observeNativePaint } from "./native-paint";

const key = "open-neo-rts.audio.v1";
let output: string;
test.beforeAll(() => {
  output = mkdtempSync(resolve(tmpdir(), "neo-audio-proof-"));
  execFileSync("bun", [
    "build",
    resolve(import.meta.dirname, "audio-proof.ts"),
    "--target=browser",
    `--outfile=${resolve(output, "proof.js")}`,
  ]);
});
test.afterAll(() => rmSync(output, { recursive: true, force: true }));

test("native Audio previews actual output, saves independently, restores Back and recovers from storage failure", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await observeNativePaint(page);
  await page.addInitScript(() => {
    // Isolate the UI channel; music playback has its own end-to-end coverage.
    const key = "open-neo-rts.audio.v1";
    if (!localStorage.getItem(key))
      localStorage.setItem(
        key,
        JSON.stringify({
          format: 1,
          volumes: {
            master: 70,
            music: 0,
            effects: 80,
            voices: 80,
            announcer: 90,
            ui: 60,
            ambience: 50,
          },
          muted: false,
          muteUnfocused: true,
        }),
      );
    const probe = { peak: 0, starts: 0, fail: false, contexts: [] as BaseAudioContext[] };
    Reflect.set(window, "audioProbe", probe);
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: [AudioNode | AudioParam, number?, number?]
    ) {
      const result = Reflect.apply(connect, this, args);
      if (args[0] instanceof AudioDestinationNode && !probe.contexts.includes(this.context)) {
        probe.contexts.push(this.context);
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        Reflect.apply(connect, this, [analyser]);
        const values = new Float32Array(1024);
        setInterval(() => {
          analyser.getFloatTimeDomainData(values);
          for (const value of values) probe.peak = Math.max(probe.peak, Math.abs(value));
        }, 8);
      }
      return result;
    } as typeof connect;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      probe.starts++;
      Reflect.apply(start, this, args);
    };
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === "open-neo-rts.audio.v1" && probe.fail)
        throw new DOMException("quota", "QuotaExceededError");
      Reflect.apply(save, this, [name, value]);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await page.bringToFront();
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings");
  await clickNativeText(page, "Audio");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "audio");
  const channel = page.locator('select[name="bus"]'),
    volume = page.locator('select[name="volume"]');
  await expect(channel).toHaveAccessibleDescription(
    "Choose the channel to adjust. Master affects every channel.",
  );
  expect(
    await page.evaluate(() =>
      [...Reflect.get(window, "nativePaintText").keys()].some((t: string) =>
        t.includes("Preview this channel"),
      ),
    ),
  ).toBe(false);
  const volumePoint = await nativeTextPoint(page, "70%");
  await page.mouse.move(volumePoint.x, volumePoint.y);
  await nativeFrame(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...Reflect.get(window, "nativePaintText").keys()].some((t: string) =>
          t.includes("Preview this channel"),
        ),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath("audio-tooltip-desktop.png") });
  await page.mouse.move(5, 5);
  async function chooseMaximum(name: string) {
    const selected = `${await volume.inputValue()}%`;
    await clickNativeText(page, selected);
    await nativeFrame(page);
    const point = await nativeTextPoint(page, selected);
    await page.mouse.move(point.x, point.y);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 600);
      await nativeFrame(page);
    }
    await nativeFrame(page);
    const last = await nativeTextPoint(page, "100%");
    expect(last.y).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(page.viewportSize()!.height);
    await page.screenshot({ path: info.outputPath(name) });
    await clickNativeText(page, "100%");
    await expect(volume).toHaveValue("100");
  }
  await page.locator('[name="muteUnfocused"]').press("Space");
  await chooseMaximum("audio-dropdown-desktop.png");
  await channel.selectOption("ui");
  await volume.selectOption("100");
  await page.evaluate(() => {
    Reflect.get(window, "audioProbe").peak = 0;
  });
  await clickNativeText(page, "Test sound");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioProbe").peak))
    .toBeGreaterThan(0.005);
  expect(await page.evaluate(() => Reflect.get(window, "audioProbe").contexts.length)).toBe(1);
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("audio-desktop.png") });
  await volume.selectOption("0");
  // Wait out the previously requested 100ms cue before measuring the muted path.
  await page.waitForTimeout(180);
  const starts = await page.evaluate(() => {
    const p = Reflect.get(window, "audioProbe");
    p.peak = 0;
    return p.starts;
  });
  await clickNativeText(page, "Test sound");
  await page.waitForTimeout(140);
  expect(await page.evaluate(() => Reflect.get(window, "audioProbe").peak)).toBeLessThan(0.00001);
  expect(await page.evaluate(() => Reflect.get(window, "audioProbe").starts)).toBe(starts);
  await volume.selectOption("25");
  await clickNativeText(page, "Apply and save");
  await expect(page.getByRole("status")).toContainText("saved");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).volumes.ui, key)).toBe(
    25,
  );
  await volume.selectOption("90");
  await clickNativeText(page, "Back");
  await clickNativeText(page, "Audio");
  await channel.selectOption("ui");
  await expect(volume).toHaveValue("25");
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("audio-mobile.png") });
  await page.getByRole("button", { name: "Back", exact: true }).press("Tab");
  await expect(channel).toBeFocused();
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("audio-tooltip-mobile.png") });
  await chooseMaximum("audio-dropdown-mobile.png");
  await volume.selectOption("65");
  await page.evaluate(() => {
    Reflect.get(window, "audioProbe").fail = true;
  });
  await clickNativeText(page, "Apply and save");
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await page.screenshot({ path: info.outputPath("audio-error-mobile.png") });
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).volumes.ui, key)).toBe(
    25,
  );
  await clickNativeText(page, "Back");
  await page.evaluate(() => {
    Reflect.get(window, "audioProbe").fail = false;
  });
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings");
  await page.getByRole("button", { name: "Audio", exact: true }).focus();
  await nativeFrame(page);
  await clickNativeText(page, "Audio");
  await channel.selectOption("ui");
  await expect(volume).toHaveValue("25");
  expect(errors).toEqual([]);
});

test("Babylon audio bounds voices, prioritizes independently positioned sources and cancels pending scoped playback", async ({
  page,
}) => {
  await page.route("**/audio-proof", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<button disabled>Loading</button><script src="/audio-proof.js"></script>',
    }),
  );
  await page.route("**/audio-proof.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: readFileSync(resolve(output, "proof.js")),
    }),
  );
  await page.goto("/audio-proof");
  await page.getByRole("button", { name: "Start audio proof" }).click();
  await expect(page.getByRole("button", { name: "Audio proof ready" })).toBeVisible();
  const result = await page.evaluate(async () => {
    const f = Reflect.get(window, "audioFixture"),
      scope = f.mixer.scope();
    const distant = await Promise.all(
      Array.from({ length: 6 }, () =>
        scope.play(f.cue, { bus: "effects", position: { x: 10000, y: 0, z: 0 } }),
      ),
    );
    const first = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        scope.play(f.cue, { bus: "effects", position: { x: i, y: 0, z: 0 } }),
      ),
    );
    const refused = await scope.play(f.cue, { bus: "effects" });
    const priority = await scope.play(f.cue, {
      bus: "effects",
      priority: 1,
      position: { x: 20, y: 0, z: 0 },
    });
    const positions = f.engine.sounds
      .filter((s: { activeInstancesCount: number }) => s.activeInstancesCount)
      .map((s: { spatial: { position: { x: number } } }) => s.spatial.position.x)
      .sort((a: number, b: number) => a - b);
    scope.retain((p: { x: number } | undefined) => !p || p.x < 3);
    const retained = f.engine.sounds.filter(
      (s: { activeInstancesCount: number }) => s.activeInstancesCount,
    ).length;
    scope.stop();
    const looping = await scope.play(f.cue, {
      bus: "effects",
      loop: true,
      position: { x: 1, y: 0, z: 0 },
    });
    const following = scope.move({ x: 40, y: 0, z: 0 });
    const loop = f.engine.sounds.find(
      (s: { loop: boolean; activeInstancesCount: number }) => s.loop && s.activeInstancesCount,
    );
    const loopPosition = loop?.spatial.position.x;
    const culledLoop = scope.move({ x: 10000, y: 0, z: 0 });
    const loopsAfterCull = f.engine.sounds.filter(
      (s: { loop: boolean; activeInstancesCount: number }) => s.loop && s.activeInstancesCount,
    ).length;
    const originalDecode = f.engine.createSoundBufferAsync.bind(f.engine);
    let release: () => void = () => {};
    f.engine.createSoundBufferAsync = async (source: AudioBuffer) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return originalDecode(source);
    };
    const pendingCue = new AudioBuffer({ sampleRate: 44100, length: 44100, numberOfChannels: 1 });
    const mutedPending = scope.play(pendingCue, { bus: "effects" });
    await Promise.resolve();
    await Promise.resolve();
    f.mixer.apply(f.volumes, true);
    f.mixer.apply(f.volumes, false);
    release();
    const mutedCanceled = await mutedPending;
    f.engine.createSoundBufferAsync = originalDecode;
    const pending = scope.play(f.cue, { bus: "effects" });
    scope.dispose();
    const canceled = await pending;
    const after = f.engine.sounds.filter(
      (s: { activeInstancesCount: number }) => s.activeInstancesCount,
    ).length;
    const music = f.mixer.scope(),
      announcer = f.mixer.scope();
    await music.play(f.cue, { bus: "music", loop: true });
    const musicBus = f.engine.sounds.find(
      (sound: { outBus?: { name: string } }) => sound.outBus?.name === "music",
    ).outBus;
    const brief = new AudioBuffer({ sampleRate: 44100, length: 44100, numberOfChannels: 1 });
    brief.copyToChannel(f.cue.getChannelData(0).slice(0, 44100), 0);
    const level = async (target: number) => {
      const deadline = performance.now() + 3000;
      while (Math.abs(musicBus.volume - target) > 0.005) {
        if (performance.now() > deadline) throw new Error(`Music gain did not reach ${target}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return musicBus.volume;
    };
    let completed = 0;
    let finish: () => void = () => {};
    const ended = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await announcer.play(brief, {
      bus: "announcer",
      onEnded: () => {
        completed++;
        finish();
      },
    });
    const ducked = await level(0.35);
    await ended;
    const restoredMusic = await level(1);
    await announcer.play(f.cue, { bus: "announcer", onEnded: () => completed++ });
    f.mixer.apply({ ...f.volumes, music: 50 }, false);
    const previewDucked = await level(0.175);
    announcer.stop();
    const previewRestored = await level(0.5);
    music.dispose();
    announcer.dispose();
    f.mixer.dispose();
    return {
      distant,
      first,
      refused,
      priority,
      positions,
      retained,
      canceled,
      mutedCanceled,
      after,
      looping,
      following,
      loopPosition,
      culledLoop,
      loopsAfterCull,
      ducked,
      restoredMusic,
      previewDucked,
      previewRestored,
      completed,
    };
  });
  expect(result.ducked).toBeCloseTo(0.35);
  expect(result.restoredMusic).toBeCloseTo(1);
  expect(result.previewDucked).toBeCloseTo(0.175);
  expect(result.previewRestored).toBeCloseTo(0.5);
  expect(result.completed).toBe(1);
  expect(result).toMatchObject({
    distant: [false, false, false, false, false, false],
    first: [true, true, true, true, true, true],
    refused: false,
    priority: true,
    positions: [1, 2, 3, 4, 5, 20],
    retained: 2,
    canceled: false,
    mutedCanceled: false,
    after: 0,
    looping: true,
    following: true,
    loopPosition: 40,
    culledLoop: false,
    loopsAfterCull: 0,
  });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioFixture").engine.state))
    .toBe("closed");
});

test("unavailable browser audio leaves native settings usable and reports a recoverable error", async ({
  page,
}) => {
  await observeNativePaint(page);
  await page.addInitScript(() => {
    Reflect.set(window, "AudioContext", undefined);
  });
  await page.goto("/settings");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings");
  await clickNativeText(page, "Audio");
  await clickNativeText(page, "Test sound");
  await expect(page.getByRole("alert")).toContainText("could not start");
  await expect(page.getByRole("button", { name: "Test sound", exact: true })).toBeEnabled();
  await clickNativeText(page, "Back");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings");
});
