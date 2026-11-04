import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkpointHash,
  createMatch,
  createMatchKeyframe,
  parseScenario,
  runScenario,
  step,
} from "@open-neo-rts/sim";
import { aiMatchOptions, aiMatchScenario, aiMatchTrial, aiVsAi } from "./ai-vs-ai";

test("original bot economy and construction snapshots restore with identical future decisions", async () => {
  const { setup } = await aiMatchScenario(7);
  const kernel = createMatch(setup);
  for (const at of [0, 40, 400, 1000, 2000]) {
    while (kernel.tick < at) step(kernel, []);
    const restored = createMatchKeyframe(kernel, setup).restore(setup);
    expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
    for (let i = 0; i < 20; i++) {
      step(kernel, []);
      step(restored, []);
      expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
    }
  }
}, 30000);

test("AI match runner validates bounded distinct seeds, tick limit and required fresh output", () => {
  const defaults = aiMatchOptions(["--out", "evidence"]);
  expect(defaults.seeds).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(defaults.ticks).toBe(30000);
  expect(
    aiMatchOptions(["--out", "evidence", "--seeds", "0,4294967295", "--ticks", "1"]).seeds,
  ).toEqual([0, 4294967295]);
  for (const args of [
    [],
    ["--out"],
    ["--out", "x", "--out", "y"],
    ["--other", "x"],
    ["--out", "x", "--seeds", ""],
    ["--out", "x", "--seeds", "1,01"],
    ["--out", "x", "--seeds", "-1"],
    ["--out", "x", "--seeds", "1.5"],
    ["--out", "x", "--seeds", "4294967296"],
    ["--out", "x", "--ticks", "0"],
    ["--out", "x", "--ticks", "216001"],
    ["--out", "x", "--ticks", "1e3"],
  ])
    expect(() => aiMatchOptions(args)).toThrow();
});

test("original normal bot setup repeats, records honest tick caps and refuses to overwrite evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ai-runner-"));
  const out = join(directory, "evidence");
  try {
    expect(await aiVsAi(["--out", out, "--seeds", "7", "--ticks", "2"])).toBe(1);
    // Reuse the CLI's real input artifact instead of loading/hashing the same core pack twice.
    const scenario = parseScenario(
      JSON.parse(readFileSync(join(out, "seed-7.scenario.json"), "utf8")),
    );
    expect(scenario.setup.debug).toBe(false);
    expect(scenario.commands).toEqual([]);
    expect(scenario.setup.map.id).toBe("core.map:training-grounds");
    expect(scenario.setup.normal?.bots).toEqual([
      { seat: 1, kind: "basic-skirmish", force: 0 },
      { seat: 2, kind: "basic-skirmish", force: 1 },
    ]);
    expect(scenario.setup.definitions).toHaveLength(137);
    const first = aiMatchTrial(scenario, 2);
    expect(first).toEqual(JSON.parse(readFileSync(join(out, "seed-7.first.json"), "utf8")));
    expect(first.tick).toBe(2);
    expect(first.victory?.result).toBeNull();
    const summary = readFileSync(join(out, "summary.json"), "utf8");
    expect(JSON.parse(summary).results).toEqual([
      { seed: 7, tick: 2, hash: first.hash, completed: false, reproducible: true, winner: null },
    ]);
    expect(JSON.parse(readFileSync(join(out, "seed-7.scenario.json"), "utf8"))).toEqual(scenario);
    expect(
      runScenario(
        parseScenario(JSON.parse(readFileSync(join(out, "seed-7.scenario.json"), "utf8"))),
        { ticks: 2 },
      ).at(-1),
    ).toEqual({ tick: 2, hash: first.hash });
    expect(await aiVsAi(["--out", out, "--seeds", "7", "--ticks", "3"])).toBe(1);
    expect(readFileSync(join(out, "summary.json"), "utf8")).toBe(summary);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);
