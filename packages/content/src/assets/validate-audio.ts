/** Runtime clips are one complete logical stream; decoders also accept truncated/chained streams. */
function framingError(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
      String.fromCharCode(...bytes.subarray(offset, offset + 4)) !== "OggS" ||
      bytes[offset + 4] !== 0
    )
      return "invalid/truncated Ogg page header";
    const flags = bytes[offset + 5]!;
    if (flags & ~7 || (sequence === 0 ? !(flags & 2) || flags & 1 : flags & 2))
      return "invalid Ogg beginning/continuation flags";
    if (!!(flags & 1) !== continued) return "invalid Ogg packet continuation";
    const id = view.getUint32(offset + 14, true);
    serial ??= id;
    if (id !== serial) return "runtime Ogg must contain exactly one logical stream";
    if (view.getUint32(offset + 18, true) !== sequence++) return "missing/out-of-order Ogg page";
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
    const position = view.getBigInt64(offset + 6, true);
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
    if (crc >>> 0 !== view.getUint32(offset + 22, true)) return "Ogg page checksum mismatch";
    ended = !!(flags & 4);
    offset = end;
  }
  if (!ended) return "missing Ogg end-of-stream";
}

/** Shared read-only runtime container gate; codec decoding and loudness are separate checks. */
export function validateAudioContainer(bytes: Uint8Array, mono: boolean, music = false): string[] {
  const issue = framingError(bytes);
  if (issue) return [issue];
  const header = 27 + bytes[26]!;
  const signature = String.fromCharCode(...bytes.subarray(header, header + 8));
  let channels: number;
  if (signature === "OpusHead" && bytes[27]! >= 19) channels = bytes[header + 9]!;
  else if (bytes[header] === 1 && signature.slice(1, 7) === "vorbis" && bytes[27]! >= 30)
    channels = bytes[header + 11]!;
  else return ["runtime Ogg requires a Vorbis/Opus identification packet on its first page"];
  if (channels < 1 || channels > 2) return ["runtime audio requires one or two channels"];
  if (mono && channels !== 1) return ["unit, structure and prop sound effects must be mono"];
  if (music && channels !== 2) return ["music tracks must be stereo"];
  return [];
}
