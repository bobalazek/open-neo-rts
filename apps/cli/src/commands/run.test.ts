import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import placementGolden from "../../scenarios/__golden__/spawn-placement.json";
import { placementProof, spawnPlacementScenario } from "../../scenarios/generate-spawn-placement";
import fixture from "../../scenarios/smoke.json";
import placementFixture from "../../scenarios/spawn-placement.json";

const cli = new URL("../index.ts", import.meta.url).pathname;
const scenario = new URL("../../scenarios/smoke.json", import.meta.url).pathname;
const directory = mkdtempSync(join(tmpdir(), "neo-run-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function execute(args: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, ...args]);
  return {
    status: result.exitCode,
    out: result.stdout.toString(),
    error: result.stderr.toString(),
  };
}

test("runs a scenario through the CLI with expected checkpoints and a single final line", () => {
  const expected = "100 a0a03828a667cce1\n200 91ea3374c534f76a\n";
  const first = execute(["run", scenario]);
  expect(first).toEqual({ status: 0, out: expected, error: "" });
  expect(execute(["run", scenario])).toEqual(first);
  const extended = execute(["run", scenario, "--seed", "4294967295", "--ticks", "201"]);
  expect(extended.status).toBe(0);
  expect(
    extended.out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" ")[0]),
  ).toEqual(["100", "200", "201"]);
});

for (const [args, error] of [
  [[], "Usage: bun neo run"],
  [["--seed", "1"], "Usage: bun neo run"],
  [[scenario, "--other", "1"], "Unknown option: --other"],
  [[scenario, "extra.json"], "Unknown option: extra.json"],
  [[scenario, "--seed"], "--seed requires an integer"],
  [[scenario, "--seed", "-1"], "--seed requires an integer"],
  [[scenario, "--seed", "1.5"], "--seed requires an integer"],
  [[scenario, "--seed", "1e3"], "--seed requires an integer"],
  [[scenario, "--seed", "4294967296"], "--seed requires an integer"],
  [[scenario, "--seed", "1", "--seed", "2"], "Duplicate option: --seed"],
  [[scenario, "--ticks"], "--ticks requires an integer"],
  [[scenario, "--ticks", "NaN"], "--ticks requires an integer"],
  [[scenario, "--ticks", "1.5"], "--ticks requires an integer"],
  [[scenario, "--ticks", "2147483649"], "--ticks requires an integer"],
  [[scenario, "--ticks", "200", "--ticks", "201"], "Duplicate option: --ticks"],
  [[scenario, "--ticks", "199"], "all logged commands must execute"],
  [[scenario, "--ticks", "0"], "all logged commands must execute"],
] as [string[], string][]) {
  test(`rejects CLI options ${args.slice(1).join(" ") || "without a file"}`, () => {
    const result = execute(["run", ...args]);
    expect(result.status).toBe(1);
    expect(result.out).toBe("");
    expect(result.error).toContain(error);
  });
}

test("reports unreadable files, malformed JSON and incompatible scenarios", () => {
  const file = join(directory, "scenario.json");
  expect(execute(["run", file]).status).toBe(1);
  writeFileSync(file, "{");
  expect(execute(["run", file]).status).toBe(1);
  writeFileSync(file, JSON.stringify({ ...fixture, simVersion: 99 }));
  expect(execute(["run", file]).error).toContain("$.simVersion");
  writeFileSync(file, JSON.stringify({ ...fixture, setup: { ...fixture.setup, map: "future" } }));
  expect(execute(["run", file]).error).toContain("$.setup.map: must be an object");
});

test("empty logs end at zero and tick-zero commands require one step", () => {
  const file = join(directory, "empty.json");
  writeFileSync(file, JSON.stringify({ ...fixture, commands: [] }));
  expect(execute(["run", file, "--ticks", "0"]).out).toMatch(/^0 [0-9a-f]{16}\n$/);
  writeFileSync(file, JSON.stringify({ ...fixture, commands: [fixture.commands[0]] }));
  expect(execute(["run", file]).out).toMatch(/^1 [0-9a-f]{16}\n$/);
  expect(execute(["run", file, "--ticks", "0"]).status).toBe(1);
});

test("fails without printing hashes when two same-process runs differ", () => {
  const script = `
    import { mock } from "bun:test";
    let calls = 0;
    mock.module("@open-neo-rts/sim", () => ({
      parseScenario: value => value,
      compareTraces: () => null,
      parseTrace: value => value,
      traceScenario: () => ({}),
      runScenario: () => [{ tick: 1, hash: String(calls++) }],
    }));
    const { run } = await import(${JSON.stringify(new URL("./run.ts", import.meta.url).pathname)});
    process.exit(await run([${JSON.stringify(scenario)}]));
  `;
  const result = Bun.spawnSync([process.execPath, "--eval", script]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toContain("Scenario runs diverged in the same process");
});

test("writes portable traces and compares the first divergent command's entity and component", () => {
  const a = join(directory, "a.trace.json");
  const b = join(directory, "b.trace.json");
  const changed = join(directory, "changed.json");
  expect(execute(["run", scenario, "--trace", a]).status).toBe(0);
  const trace = JSON.parse(readFileSync(a, "utf8"));
  expect(trace.hashes).toHaveLength(201);
  expect(trace.events).toHaveLength(3);
  expect(execute(["run", "--compare", a, a])).toEqual({
    status: 0,
    out: "Traces match\n",
    error: "",
  });
  writeFileSync(
    changed,
    JSON.stringify({
      ...fixture,
      commands: fixture.commands.map((command) =>
        command.type === "unit.move"
          ? { ...command, payload: { entities: [1], x: 0, y: 1024 } }
          : command,
      ),
    }),
  );
  expect(execute(["run", changed, "--trace", b]).status).toBe(0);
  const comparison = execute(["run", "--compare", a, b]);
  expect(comparison.status).toBe(1);
  expect(comparison.error).toBe("");
  expect(comparison.out).toStartWith("First divergent tick: 2\n");
  const report = JSON.parse(comparison.out.slice(comparison.out.indexOf("{")));
  expect(report.events.a[0].tick).toBe(1);
  expect(report.events.b[0].tick).toBe(1);
  expect(report.state).toContainEqual({
    entity: 1,
    component: "Transform",
    field: "x",
    a: 92,
    b: 0,
  });
  writeFileSync(b, JSON.stringify({ ...trace, simVersion: 99 }));
  expect(execute(["run", "--compare", a, b]).error).toContain("$.simVersion");
  writeFileSync(b, "{");
  expect(execute(["run", "--compare", a, b]).status).toBe(1);
});

for (const args of [
  [scenario, "--trace"],
  [scenario, "--trace", "a", "--trace", "b"],
  ["--compare"],
  ["--compare", "a", "b", "extra"],
]) {
  test(`rejects malformed trace arguments ${args.join(" ")}`, () => {
    expect(execute(["run", ...args]).status).toBe(1);
  });
}

test("static spawn placement matches the checked-in scenario, Bun outcomes and CLI goldens", () => {
  expect<unknown>(spawnPlacementScenario()).toEqual(placementFixture);
  expect<unknown>(placementProof()).toEqual(placementGolden);
  expect(
    execute(["run", new URL("../../scenarios/spawn-placement.json", import.meta.url).pathname]),
  ).toEqual({
    status: 0,
    out: placementGolden.hashes.map(({ tick, hash }) => `${tick} ${hash}\n`).join(""),
    error: "",
  });
});
