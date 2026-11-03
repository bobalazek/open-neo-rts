import { sortCommands } from "../commands";
import { checkpointHash, type Kernel, step } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { createMatchKeyframe, type MatchKeyframe } from "./keyframe";
import { parseMatchRecord } from "./match-record";
import { MAX_SNAPSHOT_TICK } from "./match-snapshot";
import { canonicalJson } from "./schema";

/** One minute at 20 Hz; the two-hour import bound retains at most 121 owned frames. */
export const REPLAY_KEYFRAME_INTERVAL = 1200;

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
  const frames: MatchKeyframe[] = [createMatchKeyframe(kernel, setup)];

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
      if (!verified && kernel.tick % REPLAY_KEYFRAME_INTERVAL === 0)
        frames.push(createMatchKeyframe(kernel, setup));
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
    /** No unverified or partially sought host may be presented as a completed replay position. */
    get kernel(): Kernel {
      if (failure) throw failure;
      if (!verified || !settled) throw new Error("Replay verification or seek is unfinished");
      return kernel;
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
        if (kernel.tick > target || kernel.tick < frame.tick) {
          kernel = frame.restore(setup);
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
