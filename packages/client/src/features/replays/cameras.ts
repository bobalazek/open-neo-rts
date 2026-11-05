import type { CameraPose } from "@open-neo-rts/render";
import { isRecord } from "../../worker/protocol";

export type ReplayCameraSample = CameraPose & { tick: number };
export interface ReplayCameraTrack {
  seat: number;
  samples: readonly ReplayCameraSample[];
}
const MAX_SAMPLES = 144001;
const fields = ["tick", "x", "y", "z", "alpha", "beta", "radius"];

/** Camera annotations are bounded presentation data, never verified simulation inputs. */
export function parseReplayCameras(value: unknown, duration: number, seats: readonly number[]) {
  if (!Array.isArray(value) || !value.length || value.length > seats.length)
    throw new Error("Invalid replay cameras");
  const seen = new Set<number>();
  let count = 0;
  for (const track of value) {
    if (
      !isRecord(track) ||
      Object.keys(track).length !== 2 ||
      !seats.includes(Number(track.seat)) ||
      !Number.isSafeInteger(track.seat) ||
      seen.has(Number(track.seat)) ||
      !Array.isArray(track.samples) ||
      !track.samples.length
    )
      throw new Error("Invalid replay camera track");
    count += track.samples.length;
    if (count > MAX_SAMPLES) throw new Error("Replay cameras exceed the sample limit");
    seen.add(Number(track.seat));
    let previous = -1;
    for (const sample of track.samples) {
      if (
        !isRecord(sample) ||
        Object.keys(sample).length !== fields.length ||
        fields.some(
          (field) => typeof sample[field] !== "number" || !Number.isFinite(sample[field]),
        ) ||
        !Number.isSafeInteger(sample.tick) ||
        Number(sample.tick) <= previous ||
        Number(sample.tick) > duration ||
        [sample.x, sample.y, sample.z].some((n) => Math.abs(Number(n)) > 1000000) ||
        Math.abs(Number(sample.alpha)) > Math.PI ||
        Number(sample.beta) < 0.1 ||
        Number(sample.beta) > Math.PI / 2 ||
        Number(sample.radius) < 14 ||
        Number(sample.radius) > 110
      )
        throw new Error("Invalid replay camera sample");
      previous = Number(sample.tick);
    }
  }
  return value as ReplayCameraTrack[];
}

/** The latest pose per observed tick also captures camera jumps made while paused. */
export function createCameraRecording(seat: number) {
  const samples: ReplayCameraSample[] = [];
  return {
    capture(tick: number, pose: CameraPose) {
      const last = samples.at(-1);
      if (tick < (last?.tick ?? 0) || tick >= MAX_SAMPLES) return;
      const sample = { tick, ...pose };
      if (last?.tick === tick) samples[samples.length - 1] = sample;
      else samples.push(sample);
    },
    snapshot(): ReplayCameraTrack[] {
      return samples.length ? [{ seat, samples: samples.map((sample) => ({ ...sample })) }] : [];
    },
  };
}

export function replayCameraPose(track: ReplayCameraTrack, tick: number): CameraPose | undefined {
  const samples = track.samples;
  if (!samples[0] || tick < samples[0].tick) return;
  let lo = 0,
    hi = samples.length;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid]!.tick <= tick) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!,
    b = samples[lo + 1] ?? a;
  const t = a === b ? 0 : Math.min(1, (tick - a.tick) / (b.tick - a.tick));
  const mix = (x: number, y: number) => x + (y - x) * t;
  const turn = Math.atan2(Math.sin(b.alpha - a.alpha), Math.cos(b.alpha - a.alpha));
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    alpha: a.alpha + turn * t,
    beta: mix(a.beta, b.beta),
    radius: mix(a.radius, b.radius),
  };
}
