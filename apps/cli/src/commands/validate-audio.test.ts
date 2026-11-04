import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateAssets } from "./validate-assets";
import { validateAudio } from "./validate-audio";

const root = mkdtempSync(join(tmpdir(), "neo-audio-validation-"));
const original = resolve(
  import.meta.dir,
  "../../../../content/core/factions/eastern-collective/units/dragon-tank/dragon-tank.fire.ogg",
);
afterAll(() => rmSync(root, { recursive: true, force: true }));
function encode(name: string, args: string[]) {
  const file = join(root, name);
  const result = spawnSync(
    "ffmpeg",
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", original, ...args, "-f", "ogg", file],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return file;
}

test("original Vorbis and encoded Opus decode; stereo is allowed only outside mono effects", () => {
  expect(validateAudio(original, true)).toEqual([]);
  expect(validateAudio(encode("opus.ogg", ["-c:a", "libopus"]), true)).toEqual([]);
  const stereo = encode("stereo.ogg", ["-ac", "2", "-c:a", "libvorbis"]);
  expect(validateAudio(stereo, false)).toEqual([]);
  expect(validateAudio(stereo, true)).toContain(
    "unit, structure and prop sound effects must be mono",
  );
  const music = join(root, "music");
  mkdirSync(music);
  copyFileSync(original, join(music, "mono.ogg"));
  expect(validateAudio(join(music, "mono.ogg"), false)).toEqual(["music tracks must be stereo"]);
  copyFileSync(stereo, join(music, "stereo.ogg"));
  expect(validateAudio(join(music, "stereo.ogg"), false)).toEqual([]);
});

test("decoded peaks and silent exports fail rather than passing on an Ogg extension", () => {
  const loud = encode("loud.ogg", ["-af", "volume=10", "-c:a", "libvorbis"]);
  expect(validateAudio(loud, true).join(" ")).toContain("true peak");
  const silent = encode("silent.ogg", ["-af", "volume=0", "-c:a", "libvorbis"]);
  expect(validateAudio(silent, true).join(" ")).toContain("silent");
  const flac = encode("flac.ogg", ["-c:a", "flac"]);
  expect(validateAudio(flac, true).join(" ")).toContain("Vorbis/Opus");
});

test("corrupt, truncated, missing-EOS and chained containers fail without altering source bytes", () => {
  const bytes = readFileSync(original);
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1]! ^= 1;
  const cases: [string, Buffer, string][] = [
    ["corrupt", corrupt, "checksum"],
    ["truncated", bytes.subarray(0, bytes.length - 10), "truncated"],
    ["missing-eos", bytes.subarray(0, bytes.lastIndexOf("OggS")), "end-of-stream"],
    ["chained", Buffer.concat([bytes, bytes]), "chained"],
    ["fake", Buffer.from("OggSnot audio"), "header"],
  ];
  for (const [name, data, message] of cases) {
    const file = join(root, `${name}.ogg`);
    writeFileSync(file, data);
    expect(validateAudio(file, true).join(" ")).toContain(message);
    expect(readFileSync(file).equals(data)).toBe(true);
  }
});

test("the asset command validates runtime audio, skips source originals and reports a missing decoder", async () => {
  const folder = join(root, "pack", "units", "test");
  mkdirSync(join(folder, "source"), { recursive: true });
  writeFileSync(join(folder, "unit.json"), "{}");
  copyFileSync(original, join(folder, "test.fire.ogg"));
  writeFileSync(join(folder, "source", "unconverted.ogg"), "editable upstream source placeholder");
  writeFileSync(
    join(folder, "assets.json"),
    JSON.stringify({
      files: {
        "test.fire.ogg": { author: "Borut Balazek", source: "source/unconverted.ogg" },
      },
    }),
  );
  expect(await validateAssets([join(root, "pack")])).toBe(0);
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dir, "../index.ts"), "validate-assets", join(root, "pack")],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: root },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("FFmpeg on PATH");
  for (const ancestor of ["source", "schemas"]) {
    const nested = join(root, ancestor, "pack", "units", "test");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "bad.ogg"), "not an Ogg export");
    expect(await validateAssets([join(root, ancestor, "pack")])).toBe(1);
  }
});

test("checksummed packet-continuation, unfinished EOS and invalid granule claims fail", () => {
  const originalBytes = readFileSync(original);
  const last = originalBytes.lastIndexOf("OggS");
  function checksum(bytes: Buffer) {
    let crc = 0;
    for (let i = last; i < bytes.length; i++) {
      crc ^= (i >= last + 22 && i < last + 26 ? 0 : bytes[i]!) << 24;
      for (let bit = 0; bit < 8; bit++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
    }
    bytes.writeUInt32LE(crc >>> 0, last + 22);
    return bytes;
  }
  expect(checksum(Buffer.from(originalBytes)).equals(originalBytes)).toBe(true);
  const continuation = Buffer.from(originalBytes);
  continuation[last + 5]! |= 1;
  const partial = Buffer.from(originalBytes);
  const lace = last + 26 + partial[last + 26]!;
  const padding = 255 - partial[lace]!;
  partial[lace] = 255;
  const granule = Buffer.from(originalBytes);
  granule.writeBigUInt64LE(0xffffffffffffffffn, last + 6);
  const negative = Buffer.from(originalBytes);
  negative.writeBigInt64LE(-2n, last + 6);
  for (const [name, bytes, message] of [
    ["continuation", continuation, "packet continuation"],
    ["partial", Buffer.concat([partial, Buffer.alloc(padding)]), "incomplete Ogg packet"],
    ["granule", granule, "granule position"],
    ["negative", negative, "negative Ogg granule"],
  ] as const) {
    const file = join(root, `${name}.ogg`);
    writeFileSync(file, checksum(bytes));
    expect(validateAudio(file, true).join(" ")).toContain(message);
  }
});
