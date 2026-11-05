import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";
import { restoreCanonicalState } from "./canonical-state";
import { createMatchSnapshot, type MatchSnapshot } from "./match-snapshot";
import { canonicalJson } from "./schema";

/** One minute at 20 Hz; a two-hour replay retains at most 121 frames. */
export const REPLAY_KEYFRAME_INTERVAL = 1200;
/** The enclosing record supplies the shared setup and accepted command prefix. */
export type ReplayKeyframe = Omit<MatchSnapshot, "scenario">;

/** Owned by a running/replayed host, never deserialized from a file or sent as a seat update. */
export interface MatchKeyframe {
  readonly tick: number;
  readonly hash: string;
  serialize(): ReplayKeyframe;
  restore(installedSetup: MatchSetup): Kernel;
}

/** Keep a private immutable capture for seeking; callers cannot mutate its bytes or input history. */
export function createMatchKeyframe(kernel: Kernel, setup: MatchSetup): MatchKeyframe {
  const captured = createMatchSnapshot(kernel, setup);
  const identity = canonicalJson(captured.scenario.setup);
  return Object.freeze({
    tick: captured.tick,
    hash: captured.hash,
    serialize() {
      const { scenario: _scenario, ...frame } = captured;
      return JSON.parse(canonicalJson(frame)) as ReplayKeyframe;
    },
    restore(installedSetup: MatchSetup) {
      if (canonicalJson(installedSetup) !== identity)
        throw new Error("Keyframe setup does not match installed match");
      return restoreCanonicalState(captured, installedSetup);
    },
  });
}
