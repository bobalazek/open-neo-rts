import { safeEditorPath } from "./definition-pack";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** Stored ZIP entries preserve the selected pack's relative folders without a codec dependency. */
export function definitionArchive(files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>) {
  if (!files.size || files.size > 10000) throw new Error("Invalid archive file count");
  const local: BlobPart[] = [],
    central: BlobPart[] = [];
  let offset = 0,
    directorySize = 0;
  for (const [path, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    safeEditorPath(path);
    if (path.includes(":") || [...path].some((letter) => letter.charCodeAt(0) < 32))
      throw new Error("Invalid archive path");
    const name = new TextEncoder().encode(path);
    if (name.length > 65535 || offset + bytes.length > 256 * 1024 * 1024)
      throw new Error("Creation archive exceeds its size limit");
    const checksum = crc32(bytes);
    const header = new Uint8Array(30 + name.length),
      view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      record = new DataView(entry.buffer);
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x800, true);
    record.setUint16(14, 33, true);
    record.setUint32(16, checksum, true);
    record.setUint32(20, bytes.length, true);
    record.setUint32(24, bytes.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    entry.set(name, 46);
    local.push(header, bytes);
    central.push(entry);
    offset += header.length + bytes.length;
    directorySize += entry.length;
  }
  const end = new Uint8Array(22),
    record = new DataView(end.buffer);
  record.setUint32(0, 0x06054b50, true);
  record.setUint16(8, files.size, true);
  record.setUint16(10, files.size, true);
  record.setUint32(12, directorySize, true);
  record.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}
