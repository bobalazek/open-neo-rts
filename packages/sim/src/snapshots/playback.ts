import { sortCommands } from "../commands";
import { checkpointHash, type Kernel, step } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { createReplayProjection } from "../projection";
import { createMatchKeyframe, type MatchKeyframe, REPLAY_KEYFRAME_INTERVAL } from "./keyframe";
import { type MatchRecord, parseMatchRecord } from "./match-record";
import { MAX_SNAPSHOT_TICK } from "./match-snapshot";
import { replayScenario } from "./replay";
import { createReplayEvents } from "./replay-events";
import { canonicalJson } from "./schema";

/**
 * Host-only playback, separate from any live match. Prepare in bounded worker batches before
 * publishing a view. The host owns the returned kernel; never send it across the seat boundary.
 */
export function createMatchPlayback(value: unknown, installedSetup: MatchSetup) {
  const record = parseMatchRecord(JSON.parse(canonicalJson(value)));
  if (record.tick > MAX_SNAPSHOT_TICK || record.scenario.commands.length > 100000)
    throw new Error("Replay exceeds the two-hour or 100,000-command playback limit");
  const setup = record.scenario.setup;
  if (canonicalJson(setup) !== canonicalJson(installedSetup))
    throw new Error("Replay setup does not match installed match");
  const commands = sortCommands(record.scenario.commands);
  let kernel = createMatch(setup),
    cursor = 0,
    verified = false,
    settled = false;
  let failure: unknown;
  const frames: MatchKeyframe[] = [];
  const events = createReplayEvents(setup);
  const views = new Map<number | "all", ReturnType<typeof createReplayProjection>>();

  function captureFrame() {
    const frame = createMatchKeyframe(kernel, setup);
    if (
      record.format === 2 &&
      canonicalJson(frame.serialize()) !== canonicalJson(record.keyframes[frames.length])
    )
      throw new Error(
        `Replay keyframe at tick ${kernel.tick} does not reproduce its input history`,
      );
    frames.push(frame);
  }
  captureFrame();

  function checkBudget(maxTicks: number) {
    if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 1000)
      throw new RangeError("Replay batch must be an integer from 1 to 1000 ticks");
    if (failure) throw failure;
  }
  function advance(target: number, maxTicks: number) {
    for (let count = 0; count < maxTicks && kernel.tick < target; count++) {
      if (kernel.victory?.ended)
        throw new Error("Match record did not reproduce its terminal tick and hash");
      const start = cursor;
      while (commands[cursor]?.tick === kernel.tick) cursor++;
      const entries = step(kernel, commands.slice(start, cursor));
      if (entries.some((entry) => entry.source === "input" && entry.result !== "accepted"))
        throw new Error("Match record contains refused external commands");
      if (!verified) events.capture(kernel);
      if (!verified && kernel.tick % REPLAY_KEYFRAME_INTERVAL === 0) captureFrame();
    }
  }
  return {
    get tick() {
      return kernel.tick;
    },
    get duration() {
      return record.tick;
    },
    get verified() {
      return verified && !failure;
    },
    get keyframeTicks() {
      return frames.map((frame) => frame.tick);
    },
    markers(vision: number | "all") {
      if (failure) throw failure;
      if (!verified) throw new Error("Verify the replay before reading events");
      return events.markers(vision);
    },
    /** Export only private captures whose complete state has reproduced the input history. */
    exportRecord(): MatchRecord & { format: 2 } {
      if (failure) throw failure;
      if (!verified) throw new Error("Verify the replay before exporting keyframes");
      return {
        format: 2 as const,
        scenario: JSON.parse(canonicalJson(record.scenario)),
        tick: record.tick,
        hash: record.hash,
        keyframes: frames.map((frame) => frame.serialize()),
      };
    },
    /** No unverified or partially sought host may be presented as a completed replay position. */
    get kernel(): Kernel {
      if (failure) throw failure;
      if (!verified || !settled) throw new Error("Replay verification or seek is unfinished");
      return kernel;
    },
    /** Explicit terminal-replay permission; ordinary live workers never receive this API. */
    snapshot(vision: number | "all", reset = false) {
      if (failure) throw failure;
      if (!verified || !settled) throw new Error("Replay verification or seek is unfinished");
      if (reset) views.clear();
      let view = views.get(vision);
      if (!view) {
        view = createReplayProjection(setup, vision);
        views.set(vision, view);
      }
      return view.snapshot(kernel);
    },
    /** Returns true only after all accepted inputs reproduce the exact declared terminal result. */
    prepare(maxTicks = 20): boolean {
      checkBudget(maxTicks);
      if (verified) return true;
      try {
        advance(record.tick, maxTicks);
        if (kernel.tick !== record.tick) return false;
        if (!kernel.victory?.ended || checkpointHash(kernel) !== record.hash)
          throw new Error("Match record did not reproduce its terminal tick and hash");
        verified = true;
        settled = true;
        return true;
      } catch (error) {
        failure = error;
        throw error;
      }
    },
    /** Call again with the target until true; a newer target supersedes an unfinished seek. */
    seek(target: number, maxTicks = 20): boolean {
      checkBudget(maxTicks);
      if (!verified) throw new Error("Verify the replay before seeking");
      if (!Number.isInteger(target) || target < 0 || target > record.tick)
        throw new RangeError(`Replay target must be an integer from 0 to ${record.tick}`);
      try {
        const frame = frames[Math.floor(target / REPLAY_KEYFRAME_INTERVAL)]!;
        if (kernel.tick > target || (kernel.tick < frame.tick && target - kernel.tick > maxTicks)) {
          kernel = frame.restore(setup);
          views.clear();
          // First command whose tick has not run in the restored host.
          let low = 0,
            high = commands.length;
          while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (commands[middle]!.tick < kernel.tick) low = middle + 1;
            else high = middle;
          }
          cursor = low;
        }
        settled = false;
        advance(target, maxTicks);
        settled = kernel.tick === target;
        return settled;
      } catch (error) {
        failure = error;
        throw error;
      }
    },
  };
}

/** Headless verification preserves legacy records and checks portable frames against real history. */
export function verifyMatchRecord(value: unknown) {
  const record = parseMatchRecord(value);
  let kernel: Kernel;
  if (record.format === 2) {
    const playback = createMatchPlayback(record, record.scenario.setup);
    while (!playback.prepare(1000)) {}
    kernel = playback.kernel;
  } else kernel = replayScenario(record.scenario, record.tick);
  if (kernel.log.some((entry) => entry.source === "input" && entry.result !== "accepted"))
    throw new Error("Match record contains refused external commands");
  const hash = checkpointHash(kernel);
  if (!kernel.victory?.ended || kernel.tick !== record.tick || hash !== record.hash)
    throw new Error("Match record did not reproduce its terminal tick and hash");
  return { tick: kernel.tick, hash, victory: kernel.victory.snapshot() };
}
