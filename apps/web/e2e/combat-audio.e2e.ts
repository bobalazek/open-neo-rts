import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { MatchSetup } from "../../../packages/sim/src";
import { flatMap } from "../../../packages/sim/src/testing/maps";

const root = resolve(import.meta.dirname, "../../..");
let output: string, setup: MatchSetup;
test.beforeAll(() => {
  output = mkdtempSync(resolve(tmpdir(), "neo-combat-audio-"));
  execFileSync(
    "bun",
    [
      "-e",
      `
    import plugin from "./apps/web/catalog-plugin.ts";
    const result = await Bun.build({
      entrypoints: ["./apps/web/e2e/combat-audio-proof.ts", "./packages/client/src/worker/entry.ts"],
      target: "browser", outdir: ${JSON.stringify(output)}, naming: "[name].[ext]", plugins: [plugin],
    });
    if (!result.success) throw new Error(result.logs.join("\\n"));
  `,
    ],
    { cwd: root },
  );
  setup = JSON.parse(
    execFileSync(
      "bun",
      [
        "-e",
        `
    import { aiMatchScenario } from "./apps/cli/src/commands/ai-vs-ai.ts";
    process.stdout.write(JSON.stringify((await aiMatchScenario(42)).setup));
  `,
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    ),
  );
});
test.afterAll(() => rmSync(output, { recursive: true, force: true }));

test("original rifle and cannon clips play from real normal-worker launches, impacts and deaths", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = { peak: 0, decoded: 0 };
    Reflect.set(window, "combatAudioProbe", probe);
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = async function (
      this: BaseAudioContext,
      ...args: Parameters<typeof decode>
    ) {
      const buffer = await Reflect.apply(decode, this, args);
      if (buffer.numberOfChannels !== 1 || buffer.sampleRate !== this.sampleRate)
        throw new Error("Invalid decoded effect format");
      probe.decoded++;
      return buffer;
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: [AudioNode | AudioParam, number?, number?]
    ) {
      const result = Reflect.apply(connect, this, args);
      if (args[0] instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        Reflect.apply(connect, this, [analyser]);
        const samples = new Float32Array(1024);
        setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          for (const sample of samples) probe.peak = Math.max(probe.peak, Math.abs(sample));
        }, 8);
      }
      return result;
    } as typeof connect;
  });
  await page.route("http://combat-audio.test/**", (route) => {
    const name = basename(new URL(route.request().url()).pathname);
    return route.fulfill(
      name
        ? {
            contentType: name.endsWith(".ogg") ? "audio/ogg" : "text/javascript",
            body: readFileSync(resolve(output, name === "sim-worker.js" ? "entry.js" : name)),
          }
        : { contentType: "text/html", body: "<!doctype html><title>Combat audio proof</title>" },
    );
  });
  for (const unit of ["collective-soldier", "dragon-tank"]) {
    const candidate = structuredClone(setup);
    if (!candidate.normal) throw new Error("Missing original normal setup");
    // Keep this audio-only fixture's battle inside the default listener's culling range.
    candidate.map = {
      ...flatMap(48),
      spawns: [
        { id: "north-west", position: [12 * 1024, 12 * 1024], facing: 16384 },
        { id: "south-east", position: [30 * 1024, 12 * 1024], facing: 49152 },
      ],
    };
    candidate.normal = {
      ...candidate.normal,
      bots: [],
      settings: { ...candidate.normal.settings, fog: "off", highGroundMissPerMille: 0 },
      forces: candidate.normal.forces.map((force) => ({
        ...force,
        start: {
          ...force.start,
          units: [
            {
              unit: `core.unit:eastern-collective/${unit}`,
              count: 1,
              pop: unit === "dragon-tank" ? 3 : 1,
              role: "combat",
            },
          ],
        },
      })),
    };
    candidate.grants = [
      ...candidate.grants,
      {
        seat: 1,
        force: 1,
        scopes: ["economy.build"],
        grantedAtTick: 0,
      },
    ];
    await page.goto("http://combat-audio.test/");
    await page.evaluate(async (setup) => {
      const url = "/combat-audio-proof.js";
      const { mount } = (await import(url)) as {
        mount: typeof import("./combat-audio-proof").mount;
      };
      mount(setup);
    }, candidate);
    await page.getByRole("button", { name: "Start combat audio" }).click();
    await expect(page.getByRole("button", { name: "Combat audio ready" })).toBeVisible();
    const result = await page.evaluate(async (unit) => {
      type Fixture = {
        played: string[];
        state: () => import("../../../packages/client/src/worker").OfflineState;
        command: (type: string, payload: unknown) => Promise<unknown>;
        step: () => Promise<void>;
      };
      const fixture = Reflect.get(window, "combatAudio") as Fixture;
      const rows = fixture.state().snapshot.entities;
      const actor = rows.find((e) => e.force === 0 && e.definition.endsWith(`/${unit}`))!;
      const target = rows.find((e) => e.force === 1 && e.definition.endsWith(`/${unit}`))!;
      for (const base of rows.filter((e) => e.definition.endsWith("/command-center")))
        await fixture.command("economy.power", { entity: base.handle, enabled: 0 });
      const accepted = await fixture.command("unit.attack", {
        entities: [actor.handle],
        entity: target.handle,
      });
      if (accepted !== "accepted") throw new Error(`Attack refused: ${accepted}`);
      const fighting = () =>
        [actor.handle, target.handle].every((handle) =>
          fixture.state().snapshot.entities.some((e) => e.handle === handle),
        );
      for (let tick = 0; tick < 3500 && fighting(); tick++) await fixture.step();
      return {
        accepted,
        dead: !fighting(),
      };
    }, unit);
    expect(result).toEqual({ accepted: "accepted", dead: true });
    for (const event of ["fire", "impact", "death"])
      await expect
        .poll(() => page.evaluate(() => Reflect.get(window, "combatAudio").played))
        .toEqual(expect.arrayContaining([expect.stringContaining(`${unit}.${event}`)]));
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "combatAudioProbe").peak))
      .toBeGreaterThan(0.0001);
    expect(await page.evaluate(() => Reflect.get(window, "combatAudioProbe").decoded)).toBe(3);
    await page.evaluate(() => Reflect.get(window, "combatAudio").dispose());
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "combatAudio").engine.state))
      .toBe("closed");
  }
  expect(errors).toEqual([]);
});
