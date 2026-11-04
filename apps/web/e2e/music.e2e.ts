import { expect, test } from "@playwright/test";

const key = "open-neo-rts.audio.v1";
test("original menu and match music decodes after activation, follows navigation and honors music-only mute", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = { sources: [] as { source: AudioBufferSourceNode; ended: boolean }[], peak: 0 };
    Reflect.set(window, "musicProbe", probe);
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if ((this.buffer?.duration ?? 0) > 30) {
        const item = { source: this, ended: false };
        probe.sources.push(item);
        this.addEventListener(
          "ended",
          () => {
            item.ended = true;
          },
          { once: true },
        );
      }
      Reflect.apply(start, this, args);
    };
    const contexts = new Set<BaseAudioContext>();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: [AudioNode | AudioParam, number?, number?]
    ) {
      const result = Reflect.apply(connect, this, args);
      if (args[0] instanceof AudioDestinationNode && !contexts.has(this.context)) {
        contexts.add(this.context);
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        Reflect.apply(connect, this, [analyser]);
        const samples = new Float32Array(1024);
        setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          for (const sample of samples) probe.peak = Math.max(probe.peak, Math.abs(sample));
        }, 10);
      }
      return result;
    } as typeof connect;
  });
  await page.goto("/");
  await page.bringToFront();
  await expect(page.locator("#game")).toHaveAttribute("data-menu", "ready", { timeout: 30000 });
  const active = () =>
    page.evaluate(
      () =>
        Reflect.get(window, "musicProbe").sources.filter(
          (entry: { ended: boolean }) => !entry.ended,
        ).length,
    );
  expect(await active()).toBe(0);
  await page.mouse.click(5, 5);
  await expect.poll(active).toBe(1);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "musicProbe").peak))
    .toBeGreaterThan(0.001);
  await page.getByRole("button", { name: "Settings", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-panel", "settings");
  expect(await page.evaluate(() => Reflect.get(window, "musicProbe").sources.length)).toBe(1);
  await page.getByRole("button", { name: "Audio", exact: true }).press("Enter");
  await page.locator('select[name="bus"]').selectOption("music");
  await page.locator('select[name="volume"]').selectOption("0");
  await expect.poll(active).toBe(0);
  await page.locator('select[name="volume"]').selectOption("35");
  await expect.poll(active).toBe(1);
  await page.getByRole("button", { name: "Apply and save", exact: true }).press("Enter");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).volumes.music, key),
  ).toBe(35);
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Back", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Quick start local match", exact: true }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  await expect.poll(active).toBe(1);
  expect(await page.evaluate(() => Reflect.get(window, "musicProbe").sources.length)).toBe(3);
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Leave match", exact: true }).press("Enter");
  const prompt = page.getByRole("dialog", { name: "Leave match?", exact: true });
  await expect(prompt.locator("canvas")).toHaveAttribute("data-panel", "save-before-leave");
  const discard = prompt.getByRole("button", { name: "Leave without saving", exact: true });
  await expect(discard).toBeEnabled();
  await discard.press("Enter");
  await expect(page).toHaveURL(/\/skirmish$/);
  await expect.poll(active).toBe(1);
  expect(await page.evaluate(() => Reflect.get(window, "musicProbe").sources.length)).toBe(4);
});
