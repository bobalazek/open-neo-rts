// One original score to stereo PCM WAV on stdout; the caller encodes exactly one runtime clip.
import { readFileSync, writeSync } from "node:fs";

const score = JSON.parse(readFileSync(new URL("./score.json", import.meta.url), "utf8"));
const track = score.tracks[process.argv[2]];
if (!track) throw new Error(`Choose one track: ${Object.keys(score.tracks).join(", ")}`);
const rate = 48000,
  beat = 60 / track.bpm,
  length = Math.round(track.bars * 4 * beat * rate);
const left = new Float64Array(length),
  right = new Float64Array(length);
let seed = track.seed;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
function note(start, duration, midi, gain, pan, tone) {
  const from = Math.round(start * rate),
    count = Math.round(duration * rate),
    f = hz(midi);
  for (let sample = 0; sample < count && from + sample < length; sample++) {
    const t = sample / rate,
      phase = 2 * Math.PI * f * t;
    const envelope =
      tone === "pad"
        ? Math.min(1, t / 0.35) * Math.min(1, (duration - t) / 0.6)
        : Math.min(1, t / 0.008) * Math.exp(-t * (tone === "bass" ? 7 : 4));
    const signal =
      tone === "bell"
        ? Math.sin(phase + 1.4 * Math.sin(2 * phase) * Math.exp(-5 * t))
        : Math.sin(phase) + 0.24 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 3);
    left[from + sample] += signal * envelope * gain * Math.sqrt((1 - pan) / 2);
    right[from + sample] += signal * envelope * gain * Math.sqrt((1 + pan) / 2);
  }
}
function drum(start, kind, gain, pan = 0) {
  const duration = kind === "kick" ? 0.35 : kind === "snare" ? 0.19 : 0.065;
  const from = Math.round(start * rate);
  let previous = 0;
  for (let sample = 0; sample < duration * rate && from + sample < length; sample++) {
    const t = sample / rate,
      n = noise(),
      high = n - previous;
    previous = n;
    const signal =
      kind === "kick"
        ? Math.sin(2 * Math.PI * (46 * t + 1.8 * (1 - Math.exp(-35 * t)))) * Math.exp(-18 * t)
        : kind === "snare"
          ? (0.55 * n + 0.2 * Math.sin(2 * Math.PI * 184 * t)) * Math.exp(-32 * t)
          : high * Math.exp(-90 * t) * 0.18;
    left[from + sample] += signal * gain * (1 - pan * 0.5);
    right[from + sample] += signal * gain * (1 + pan * 0.5);
  }
}
for (let bar = 0; bar < track.bars; bar++) {
  const chord = Math.floor(bar / 2) % track.chords.length,
    start = bar * 4 * beat;
  const phrase = bar % 8;
  for (const [index, midi] of track.chords[chord].entries())
    note(start, 4 * beat + 0.5, midi, 0.045, (index - 1) * 0.65, "pad");
  for (let step = 0; step < 8; step++) {
    const at = start + (step * beat) / 2;
    if (step % 2 === 0 || (phrase >= 4 && step === 7))
      note(at, beat * 0.45, track.roots[chord] - 12, 0.12 * track.drive, 0, "bass");
    if ((step + bar) % 2 === 0)
      note(
        at,
        beat * 1.5,
        track.chords[chord][step % 3] + (phrase >= 6 ? 12 : 0),
        0.035,
        step % 2 ? -0.4 : 0.4,
        "bell",
      );
    if (track.role === "match" || bar >= 4) {
      drum(at, "hat", track.drive * 0.055, step % 2 ? -0.5 : 0.5);
      if (step === 0 || step === 4 || (phrase === 7 && step === 7))
        drum(at, "kick", 0.12 * track.drive);
      if (step === 2 || step === 6) drum(at, "snare", 0.06 * track.drive, 0.1);
    }
  }
  if (phrase >= 4)
    note(
      start + beat * 0.5,
      beat * 3,
      track.chords[chord][0] + track.motif[bar % track.motif.length],
      0.035,
      bar % 2 ? -0.25 : 0.25,
      "bell",
    );
}
const wav = Buffer.alloc(44 + length * 4);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 4, 40);
for (let sample = 0; sample < length; sample++) {
  const fade = Math.min(1, sample / (rate * 0.8), (length - sample) / (rate * 1.2));
  for (const [channel, values] of [left, right].entries()) {
    const value = values[sample] * fade;
    if (!Number.isFinite(value) || Math.abs(value) >= 1)
      throw new Error("Score clips before export");
    wav.writeInt16LE(Math.round(value * 32767), 44 + sample * 4 + channel * 2);
  }
}
writeSync(1, wav);
