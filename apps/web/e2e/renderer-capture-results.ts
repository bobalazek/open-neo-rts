import type { Command } from "../../../packages/sim/src/commands";

/** Freeze authored commands independently of the live scene builder. */
export function originalSceneCommands(commands: readonly Command[]) {
  return (
    commands.length === 400 &&
    Array.from({ length: 200 }, (_, i) => {
      const group = Math.floor(i / 50),
        x = (group % 2 ? 94 : 12) + (i % 10) * 2,
        y = (group < 2 ? 12 : 94) + Math.floor((i % 50) / 10) * 2;
      const spawn = commands[i],
        move = commands[200 + i];
      return (
        spawn?.type === "debug.spawn" &&
        spawn.tick === 0 &&
        spawn.seat === 1 &&
        spawn.sequence === i &&
        spawn.payload.definition === "core.unit:eastern-collective/dragon-tank" &&
        spawn.payload.force === 0 &&
        spawn.payload.facing === 16384 &&
        spawn.payload.x === x * 1024 + 512 &&
        spawn.payload.y === y * 1024 + 512 &&
        move?.type === "unit.move" &&
        move.tick === 1 &&
        move.seat === 1 &&
        move.sequence === 200 + i &&
        move.payload.entities.length === 1 &&
        move.payload.entities[0] === i + 1 &&
        move.payload.x === (127 - x) * 1024 + 512 &&
        move.payload.y === (127 - y) * 1024 + 512
      );
    }).every(Boolean)
  );
}

export interface CapturePose {
  handle: string;
  x: number;
  y: number;
}
export interface CaptureSamples {
  begin: number;
  nominalEnd: number;
  firstTick: number;
  lastTick: number;
  first: CapturePose[];
  last: CapturePose[];
  frames: { at: number; frameMs: number; drawCalls: number; tick: number; focused: boolean }[];
  workers: {
    at: number;
    tick: number;
    tickMs: number;
    count: number;
    orders: number;
    paused: boolean;
    speed: number;
  }[];
  frustums: { at: number; roots: number; contained: number; parts: number; maxClipXY: number }[];
  focusLosses: number[];
}

export function distribution(values: number[]) {
  if (!values.length || values.some((v) => !Number.isFinite(v) || v < 0))
    throw new Error("Missing or invalid measurement samples");
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1] as number,
    max: sorted.at(-1) as number,
  };
}

/** A completed baseline frame starts the common window; observations after its final frame are excluded. */
export function summarizeCapture(data: CaptureSamples) {
  const frames = data.frames.filter((f) => f.at > data.begin && f.at <= data.nominalEnd);
  const end = frames.at(-1)?.at;
  if (end === undefined || end <= data.begin) throw new Error("No completed-frame window");
  const inside = (at: number) => at >= data.begin && at <= end;
  const workers = data.workers.filter((w) => inside(w.at));
  const frustums = data.frustums.filter((v) => inside(v.at));
  const first = new Map(data.first.map((p) => [p.handle, p]));
  const last = new Map(data.last.map((p) => [p.handle, p]));
  const unmoved = [...first]
    .filter(([id, p]) => {
      const q = last.get(id);
      return !q || (p.x === q.x && p.y === q.y);
    })
    .map(([id]) => id);
  const reasons: string[] = [];
  if (
    first.size !== 200 ||
    last.size !== 200 ||
    data.first.length !== 200 ||
    data.last.length !== 200 ||
    [...last.keys()].some((id) => !first.has(id))
  )
    reasons.push("Original 200 handles were not retained");
  if (unmoved.length) reasons.push("Some units did not displace during the measured window");
  if (
    data.lastTick <= data.firstTick ||
    frames.at(-1)?.tick !== data.lastTick ||
    workers.length < 2
  )
    reasons.push("Missing logical progress or final-frame state");
  if (workers.some((w) => w.count !== 200 || w.orders !== 200 || w.paused || w.speed !== 1))
    reasons.push("The measured 200-unit moving workload changed");
  if (
    !frustums.length ||
    frustums.some((v) => v.roots !== 200 || v.contained !== 200 || v.parts === 0)
  )
    reasons.push("Sampled model frustum containment failed");
  if (frames.some((f) => !f.focused) || data.focusLosses.some(inside))
    reasons.push("The page lost foreground focus");
  if (frames.some((f) => f.drawCalls <= 0 || f.frameMs <= 0))
    reasons.push("Invalid completed-render counters");
  const frame = distribution(frames.map((f) => f.frameMs));
  return {
    reasons,
    window: {
      begin: data.begin,
      end,
      durationMs: end - data.begin,
      nominalEnd: data.nominalEnd,
      boundary: "completed baseline frame, then completed frames through nominal end",
    },
    frame,
    observedFps: 1000 / frame.mean,
    workerStep: distribution(workers.map((w) => w.tickMs)),
    workerHz: ((data.lastTick - data.firstTick) * 1000) / (end - data.begin),
    draws: distribution(frames.map((f) => f.drawCalls)),
    firstTick: data.firstTick,
    lastTick: data.lastTick,
    displaced: 200 - unmoved.length,
    unmoved,
    frustumSamplingMs: 1000,
    containedModelsMin: Math.min(...frustums.map((v) => v.contained)),
    frames,
    workers,
    frustums,
  };
}
