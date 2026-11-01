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
