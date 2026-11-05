import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMatch, createMatchPlayback, createMatchRecord, step } from "@open-neo-rts/sim";
import { aiMatchScenario } from "./ai-vs-ai";

test("headless replay adapter verifies bare and wrapped frames and fails malformed files", async () => {
  const { setup } = await aiMatchScenario(7);
  setup.normal = { ...setup.normal!, bots: setup.normal!.bots!.filter((bot) => bot.seat !== 1) };
  setup.grants = [...setup.grants, { seat: 1, force: 0, scopes: ["surrender"], grantedAtTick: 0 }];
  const kernel = createMatch(setup);
  step(kernel, [{ tick: 0, seat: 1, sequence: 0, type: "match.surrender", payload: { force: 0 } }]);
  const playback = createMatchPlayback(createMatchRecord(kernel, setup), setup);
  playback.prepare();
  const portable = playback.exportRecord();
  const directory = mkdtempSync(join(tmpdir(), "neo-verify-replay-"));
  const file = join(directory, "record.json");
  const cli = new URL("../index.ts", import.meta.url).pathname;
  const execute = (args: string[]) =>
    Bun.spawnSync([process.execPath, cli, "verify-replay", ...args]);
  try {
    for (const value of [portable, { record: portable }]) {
      writeFileSync(file, JSON.stringify(value));
      const result = execute([file]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(`1 ${portable.hash}`);
      expect(result.stdout.toString()).toContain("header identity were not checked");
    }
    writeFileSync(file, JSON.stringify({ ...portable, hash: "0000000000000000" }));
    expect(execute([file]).exitCode).toBe(1);
    const { keyframes: _keyframes, ...legacy } = portable;
    writeFileSync(file, JSON.stringify({ ...legacy, format: 1, tick: 144001 }));
    const excessive = execute([file]);
    expect(excessive.exitCode).toBe(1);
    expect(excessive.stderr.toString()).toContain("two-hour");
    writeFileSync(file, "{");
    expect(execute([file]).exitCode).toBe(1);
    expect(execute([]).exitCode).toBe(1);
    expect(execute([file, "--extra"]).exitCode).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
