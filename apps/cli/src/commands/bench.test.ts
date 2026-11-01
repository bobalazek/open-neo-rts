import { expect, test } from "bun:test";

const cli = new URL("../index.ts", import.meta.url).pathname;

function execute(args: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, "bench", ...args]);
  return {
    status: result.exitCode,
    out: result.stdout.toString(),
    error: result.stderr.toString(),
  };
}

test("bench runs moving units and prints tick statistics and both ECS stores", () => {
  const result = execute(["--units", "17", "--ticks", "201"]);
  expect(result.status).toBe(0);
  expect(result.error).toBe("");
  expect(result.out).toContain("17 units, 8 Forces, 201 ticks (100 warmup ticks)");
  expect(result.out).toMatch(/mean \d+\.\d+ ms \| p95 \d+\.\d+ ms \| max \d+\.\d+ ms/);
  expect(result.out).toContain("operation | ECS ms | sparse-set ms");
  for (const operation of ["create", "add", "query", "iterate"])
    expect(result.out).toMatch(new RegExp(`\\n${operation} \\| \\d+\\.\\d+ \\| \\d+\\.\\d+`));
});

for (const units of [1, 8001])
  test(`bench accepts ${units} units`, () => {
    expect(execute(["--units", String(units), "--ticks", "1"]).status).toBe(0);
  });

test("navigation benchmark validates routes and repeats fixed-work counters and checksum", () => {
  const args = ["--workload", "navigation", "--ticks", "2"];
  const first = execute(args);
  const second = execute(args);
  expect(first.status).toBe(0);
  expect(second.status).toBe(0);
  expect(first.error).toBe("");
  expect(second.error).toBe("");
  expect(first.out).toContain("300 unit request slots, 8 Forces, 2 ticks (100 warmup ticks)");
  expect(first.out).toContain("seed 1 | map:bench-river-256 256x256");
  expect(first.out).toContain("quota 4096 nodes/tick");
  expect(first.out).toMatch(/Cold compile: \d+\.\d+ ms/);
  expect(first.out).toMatch(/mean \d+\.\d+ ms \| p95 \d+\.\d+ ms \| max \d+\.\d+ ms/);
  const receipt = (out: string) =>
    out.split("\n").filter((line) => /^(Requests|Expansions):/.test(line));
  expect(receipt(first.out)).toHaveLength(2);
  expect(receipt(first.out)).toEqual(receipt(second.out));
  expect(first.out).toContain("Expansions: 8192 (4096.000/tick) | max 4096/tick | checksum");
  const invalid = execute(["--workload", "other"]);
  expect(invalid.status).toBe(1);
  expect(invalid.error).toContain("--workload requires flat or navigation");
});

for (const args of [
  ["--other", "1"],
  ["--units"],
  ["--ticks"],
  ["--units", "0"],
  ["--ticks", "0"],
  ["--units", "-1"],
  ["--ticks", "1.5"],
  ["--units", "2147483648"],
  ["--ticks", "2147483647"],
  ["--units", "1", "--units", "2"],
]) {
  test(`bench rejects invalid options: ${args.join(" ")}`, () => {
    const result = execute(args);
    expect(result.status).toBe(1);
    expect(result.out).toBe("");
    expect(result.error).not.toBe("");
  });
}
