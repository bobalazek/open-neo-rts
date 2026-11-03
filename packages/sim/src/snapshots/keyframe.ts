import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";
import { restoreCanonicalState } from "./canonical-state";
import { createMatchSnapshot } from "./match-snapshot";
import { canonicalJson } from "./schema";

/** Owned by a running/replayed host, never deserialized from a file or sent as a seat update. */
export interface MatchKeyframe {
  readonly tick: number;
  readonly hash: string;
  restore(installedSetup: MatchSetup): Kernel;
}

/** Keep a private immutable capture for seeking; callers cannot mutate its bytes or input history. */
export function createMatchKeyframe(kernel: Kernel, setup: MatchSetup): MatchKeyframe {
  const captured = createMatchSnapshot(kernel, setup);
  const identity = canonicalJson(captured.scenario.setup);
  return Object.freeze({
    tick: captured.tick,
    hash: captured.hash,
    restore(installedSetup: MatchSetup) {
      if (canonicalJson(installedSetup) !== identity)
        throw new Error("Keyframe setup does not match installed match");
      return restoreCanonicalState(captured, installedSetup);
    },
  });
}
