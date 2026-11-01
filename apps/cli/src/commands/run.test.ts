import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixture from "../../scenarios/smoke.json";

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
  const expected = "100 7328e7f340aea063\n200 61714c376b59450c\n";
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
  expect(execute(["run", file]).error).toContain("$.setup.map: unknown field");
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
