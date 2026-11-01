import type { Issue } from "@open-neo-rts/content";
import type { Grant } from "./commands";
import { type Definition, entitiesFeature } from "./features/entities";
import { movementFeature } from "./features/movement";
import { createKernel, type Kernel, register } from "./kernel";
import { checkMatchMap, copyMatchMap, type MatchMap, matchMapSchema } from "./match-map";

export { type MatchMap, serializeMatchMap } from "./match-map";

/** Bump whenever simulation outcomes change. */
export const SIM_VERSION = 2;

/** Map-aware setup; definitions are an ordered table addressed by their unique IDs. */
export interface MatchSetup {
  map: MatchMap;
  seed: number;
  debug: boolean;
  forces: readonly { index: number; faction: string }[];
  /** Player/bot seats; 0 is reserved for system commands. */
  seats: readonly number[];
  grants: readonly Grant[];
  definitions: readonly Definition[];
}

/** Validates/copies static map input, then registers features in their fixed order. */
export function createMatch(setup: MatchSetup): Kernel {
  const issues: Issue[] = [];
  matchMapSchema.check(setup.map, "$.setup.map", issues);
  if (!issues.length) checkMatchMap(setup.map, setup.definitions, issues);
  if (issues.length)
    throw new Error(
      `Invalid match map:\n${issues.map(({ path, message }) => `${path}: ${message}`).join("\n")}`,
    );
  const kernel = createKernel({ ...setup, map: copyMatchMap(setup.map) });
  register(kernel, entitiesFeature(setup.definitions));
  register(kernel, movementFeature(setup));
  return kernel;
}
