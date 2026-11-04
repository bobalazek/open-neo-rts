import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { validateAudioContainer } from "@open-neo-rts/content/audio-validation";

/** Decode the whole runtime clip, without allowing playlists, URLs or external protocols. */
export function validateAudio(file: string, mono: boolean): string[] {
  try {
    const issues = validateAudioContainer(
      readFileSync(file),
      mono,
      basename(dirname(file)) === "music",
    );
    if (issues.length) return issues;
  } catch (error) {
    return [`audio cannot be read: ${error instanceof Error ? error.message : String(error)}`];
  }
  const executable = Bun.which("ffmpeg");
  if (!executable)
    return ["audio validation requires FFmpeg on PATH (brew install ffmpeg / apt install ffmpeg)"];
  const result = spawnSync(
    executable,
    [
      "-nostdin",
      "-hide_banner",
      "-nostats",
      "-xerror",
      "-err_detect",
      "crccheck+explode",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "ogg",
      "-codec_whitelist",
      "vorbis,opus",
      "-f",
      "ogg",
      "-i",
      resolve(file),
      "-map",
      "0:a",
      "-vn",
      "-sn",
      "-dn",
      "-af",
      "ebur128=peak=true:framelog=verbose",
      "-f",
      "null",
      "-",
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    },
  );
  if (result.error || result.status !== 0)
    return [`audio decoding failed: ${result.error?.message ?? result.stderr.trim().slice(-1000)}`];
  const errors: string[] = [];
  const peak = Number([...result.stderr.matchAll(/True peak:\s+Peak:\s+(\S+) dBFS/g)].at(-1)?.[1]);
  if (!Number.isFinite(peak))
    errors.push("audio is silent or its decoded true peak could not be measured");
  // FFmpeg's summary rounds to 0.1 dB; reserve that much headroom at the -1 dBTP limit.
  else if (peak > -1.1)
    errors.push(
      `true peak reads ${peak} dBTP; export at -1.1 dBTP or lower to meet the -1 dBTP limit with meter headroom`,
    );
  return errors;
}
