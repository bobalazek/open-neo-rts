import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Runtime clips are one complete logical stream; decoders also accept truncated/chained streams. */
function framingError(bytes: Buffer): string | undefined {
  let offset = 0,
    serial: number | undefined,
    sequence = 0,
    ended = false,
    continued = false,
    granule = 0n;
  while (offset < bytes.length) {
    if (ended) return "trailing/chained data after Ogg end-of-stream";
    if (
      offset + 27 > bytes.length ||
      bytes.toString("latin1", offset, offset + 4) !== "OggS" ||
      bytes[offset + 4] !== 0
    )
      return "invalid/truncated Ogg page header";
    const flags = bytes[offset + 5]!;
    if (flags & ~7 || (sequence === 0 ? !(flags & 2) || flags & 1 : flags & 2))
      return "invalid Ogg beginning/continuation flags";
    if (!!(flags & 1) !== continued) return "invalid Ogg packet continuation";
    const id = bytes.readUInt32LE(offset + 14);
    serial ??= id;
    if (id !== serial) return "runtime Ogg must contain exactly one logical stream";
    if (bytes.readUInt32LE(offset + 18) !== sequence++) return "missing/out-of-order Ogg page";
    const header = offset + 27 + bytes[offset + 26]!;
    if (header > bytes.length) return "truncated Ogg segment table";
    let end = header,
      completed = false;
    for (let i = offset + 27; i < header; i++) {
      end += bytes[i]!;
      if (bytes[i]! < 255) completed = true;
    }
    if (end > bytes.length) return "truncated Ogg page body";
    if (header > offset + 27) continued = bytes[header - 1] === 255;
    if (flags & 4 && continued) return "incomplete Ogg packet at end-of-stream";
    const position = bytes.readBigInt64LE(offset + 6);
    if (position < -1n) return "invalid negative Ogg granule position";
    if (completed && position === -1n) return "completed Ogg packets require a granule position";
    if (!completed && position !== -1n)
      return "Ogg page without completed packets requires an unset granule position";
    if (completed) {
      if (position < granule) return "decreasing Ogg granule position";
      granule = position;
    }
    // Ogg uses a different polynomial and initial/final values from the PNG writer's CRC.
    let crc = 0;
    for (let i = offset; i < end; i++) {
      crc ^= (i >= offset + 22 && i < offset + 26 ? 0 : bytes[i]!) << 24;
      for (let bit = 0; bit < 8; bit++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
    }
    if (crc >>> 0 !== bytes.readUInt32LE(offset + 22)) return "Ogg page checksum mismatch";
    ended = !!(flags & 4);
    offset = end;
  }
  if (!ended) return "missing Ogg end-of-stream";
}

/** Decode the whole runtime clip, without allowing playlists, URLs or external protocols. */
export function validateAudio(file: string, mono: boolean): string[] {
  let channels: number;
  try {
    const bytes = readFileSync(file);
    const issue = framingError(bytes);
    if (issue) return [issue];
    const header = 27 + bytes[26]!;
    if (bytes.toString("latin1", header, header + 8) === "OpusHead" && bytes[27]! >= 19)
      channels = bytes[header + 9]!;
    else if (
      bytes[header] === 1 &&
      bytes.toString("latin1", header + 1, header + 7) === "vorbis" &&
      bytes[27]! >= 30
    )
      channels = bytes[header + 11]!;
    else return ["runtime Ogg requires a Vorbis/Opus identification packet on its first page"];
  } catch (error) {
    return [`audio cannot be read: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (channels < 1 || channels > 2) return ["runtime audio requires one or two channels"];
  if (mono && channels !== 1) return ["unit, structure and prop sound effects must be mono"];
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
