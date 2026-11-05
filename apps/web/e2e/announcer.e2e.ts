import { expect, test } from "@playwright/test";
import cues from "../../../content/core/announcer/source/cues.json" with { type: "json" };
import { nativeFrame, observeNativePaint } from "./native-paint";

test.afterEach(async ({ page }, info) => {
  if (!page.isClosed())
    await info.attach("announcer-audio-probe", {
      body: JSON.stringify(await page.evaluate(() => Reflect.get(window, "announcerProbe"))),
      contentType: "application/json",
    });
});

test("announcer presentation uses real clipped audio, native captions, pause and mute, then a real surrender outcome", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await observeNativePaint(page);
  page.on("dialog", (dialog) => dialog.accept());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const settings = {
      format: 1,
      muted: false,
      muteUnfocused: false,
      volumes: { master: 100, announcer: 100, music: 0, effects: 0, voices: 0, ui: 0, ambience: 0 },
    };
    localStorage.setItem("open-neo-rts.audio.v1", JSON.stringify(settings));
    const probe = {
      power: false,
      harvester: false,
      starts: [] as { offset: number; duration: number | null; bufferDuration: number }[],
      decodes: [] as { duration?: number; error?: string; elapsed: number }[],
      events: [] as { stage: string; at: number; state?: string; error?: string }[],
    };
    Reflect.set(window, "announcerProbe", probe);
    const event = (stage: string, context?: BaseAudioContext, error?: unknown) =>
      probe.events.push({
        stage,
        at: performance.now(),
        ...(context && { state: context.state }),
        ...(error !== undefined && { error: String(error) }),
      });
    const contexts = new Set<BaseAudioContext>();
    const monitor = (context: BaseAudioContext) => {
      if (contexts.has(context)) return;
      contexts.add(context);
      event("context", context);
      context.addEventListener("statechange", () => event("statechange", context));
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: Parameters<typeof connect>) {
      monitor(this.context);
      try {
        const result = Reflect.apply(connect, this, args);
        event(`connect:${this.constructor.name}`, this.context);
        return result;
      } catch (error) {
        event("connect-error", this.context, error);
        throw error;
      }
    } as typeof connect;
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (
      this: BaseAudioContext,
      ...args: Parameters<typeof decode>
    ) {
      const started = performance.now();
      monitor(this);
      event("decode-start", this);
      return Reflect.apply(decode, this, args).then(
        (buffer: AudioBuffer) => {
          event("decode-end", this);
          probe.decodes.push({ duration: buffer.duration, elapsed: performance.now() - started });
          return buffer;
        },
        (error: unknown) => {
          event("decode-error", this, error);
          probe.decodes.push({ error: String(error), elapsed: performance.now() - started });
          throw error;
        },
      );
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      this: AudioBufferSourceNode,
      ...args: Parameters<typeof start>
    ) {
      event("start-attempt", this.context);
      try {
        Reflect.apply(start, this, args);
      } catch (error) {
        event("start-error", this.context, error);
        throw error;
      }
      event("start-success", this.context);
      if (this.buffer)
        probe.starts.push({
          offset: args[1] ?? 0,
          duration: args[2] ?? null,
          bufferDuration: this.buffer.duration,
        });
    };
    let caption = "";
    new MutationObserver(() => {
      const current = document.querySelector("[data-announcer]")?.textContent ?? "";
      if (current !== caption) {
        caption = current;
        event(`caption:${caption}`);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
    document.addEventListener("visibilitychange", () => event(`hidden:${document.hidden}`));
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          const snapshot = data.state?.snapshot;
          if (!snapshot || snapshot.mode !== "controlled") return;
          // Presentation fixture only: copied permitted values change; the actual worker/simulation does not.
          if (probe.power)
            for (const power of snapshot.power ?? [])
              if (power.force === 0) {
                power.brownout = true;
                power.used = power.produced + 10;
              }
          if (probe.harvester)
            for (const entity of snapshot.entities)
              if (entity.force === 0 && entity.definition.endsWith("/supply-truck"))
                entity.health--;
        });
      }
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick start local match" }).press("Enter");
  await expect(page.locator("#game")).toHaveAttribute("data-session", "ready", { timeout: 60000 });
  const subtitle = page.locator("[data-announcer]");
  await expect(subtitle).toBeEmpty();
  await page.evaluate(() => (Reflect.get(window, "announcerProbe").power = true));
  await expect(subtitle).toHaveText("Low power.");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "announcerProbe").starts.length))
    .toBe(1);
  const segment = await page.evaluate(
    () =>
      Reflect.get(window, "announcerProbe").starts[0] as {
        offset: number;
        duration: number | null;
        bufferDuration: number;
      },
  );
  expect(segment.offset).toBeCloseTo(cues.power.start, 3);
  expect(segment.duration).toBeCloseTo(cues.power.duration, 3);
  expect(segment.bufferDuration).toBeGreaterThan(cues.defeat.start + cues.defeat.duration);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...Reflect.get(window, "nativePaintText").keys()].some((value: string) =>
          value.includes("Low power."),
        ),
      ),
    )
    .toBe(true);
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("announcer-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFrame(page);
  await page.screenshot({ path: info.outputPath("announcer-mobile.png") });
  await page.getByRole("button", { name: "Pause", exact: true }).press("Enter");
  await expect(subtitle).toBeEmpty();
  await page.getByRole("button", { name: "Resume", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  const before = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("open-neo-rts.audio.v1")!);
    settings.volumes.announcer = 0;
    window.dispatchEvent(new CustomEvent("open-neo-rts.audio-preview", { detail: settings }));
    const probe = Reflect.get(window, "announcerProbe");
    probe.harvester = true;
    return probe.starts.length as number;
  });
  await expect(subtitle).toHaveText("Harvester under attack.");
  await expect(
    page.locator(".match-notices button").filter({ hasText: "Harvester under attack." }),
  ).toHaveCount(1);
  await nativeFrame(page);
  expect(await page.evaluate(() => Reflect.get(window, "announcerProbe").starts.length)).toBe(
    before,
  );
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("open-neo-rts.audio.v1")!);
    window.dispatchEvent(new CustomEvent("open-neo-rts.audio-preview", { detail: settings }));
    const probe = Reflect.get(window, "announcerProbe");
    probe.power = probe.harvester = false;
  });
  await page.getByRole("button", { name: "Surrender", exact: true }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Defeat", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "announcerProbe").starts.length))
    .toBe(before + 1);
  const last = await page.evaluate(
    () => Reflect.get(window, "announcerProbe").starts.at(-1) as { offset: number },
  );
  expect(last.offset).toBeCloseTo(cues.defeat.start, 3);
  expect(errors).toEqual([]);
});
