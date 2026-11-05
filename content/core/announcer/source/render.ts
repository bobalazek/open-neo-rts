// One original formant-speech atlas; requires eSpeak NG 1.52.0 and FFmpeg, never shipped as runtime dependencies.
import phrases from "./phrases.json";

const sampleRate = 22050;
const samples: Int16Array[] = [];
const cues: Record<
  string,
  { text: string; priority: number; cooldown: number; start: number; duration: number }
> = {};
let frames = 0;
for (const [key, phrase] of Object.entries(phrases)) {
  const process = Bun.spawnSync([
    "espeak-ng",
    "-v",
    "en-us+klatt",
    "-s",
    "160",
    "-p",
    "35",
    "--stdout",
    phrase.text,
  ]);
  if (process.exitCode !== 0) throw new Error(process.stderr.toString());
  const wave = process.stdout;
  const view = new DataView(wave.buffer, wave.byteOffset, wave.byteLength);
  if (
    wave.toString("ascii", 0, 4) !== "RIFF" ||
    wave.toString("ascii", 36, 40) !== "data" ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== sampleRate ||
    view.getUint16(34, true) !== 16 ||
    (wave.length - 44) % 2
  )
    throw new Error("Unexpected eSpeak PCM header");
  const pcm = new Int16Array((wave.length - 44) / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(44 + i * 2, true);
  cues[key] = { ...phrase, start: frames / sampleRate, duration: pcm.length / sampleRate };
  samples.push(pcm, new Int16Array(2205));
  frames += pcm.length + 2205;
}
const pcm = new Int16Array(frames);
let cursor = 0,
  peak = 0;
for (const part of samples) {
  pcm.set(part, cursor);
  cursor += part.length;
  for (const sample of part) peak = Math.max(peak, Math.abs(sample));
}
if (!peak) throw new Error("Silent speech");
for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round((pcm[i]! * 16384) / peak);
const encoded = Bun.spawnSync(
  [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "s16le",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-i",
    "pipe:0",
    "-c:a",
    "libopus",
    "-b:a",
    "48k",
    "-ar",
    "48000",
    "-f",
    "ogg",
    "pipe:1",
  ],
  { stdin: pcm },
);
if (encoded.exitCode !== 0) throw new Error(encoded.stderr.toString());
await Bun.write(new URL("../announcer.ogg", import.meta.url), encoded.stdout);
await Bun.write(new URL("./cues.json", import.meta.url), `${JSON.stringify(cues, null, 2)}\n`);
console.log(
  `${Object.keys(cues).length} original lines, ${(frames / sampleRate).toFixed(2)} seconds`,
);
