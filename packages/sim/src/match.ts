import type { Grant } from "./commands";
import { type Definition, entitiesFeature } from "./features/entities";
import { movementFeature } from "./features/movement";
import { createKernel, type Kernel, register } from "./kernel";

/** Bump whenever simulation outcomes change. */
export const SIM_VERSION = 1;

/** Flat-world setup; definitions are an ordered table addressed by their unique IDs. */
export interface MatchSetup {
  seed: number;
  debug: boolean;
  forces: readonly { index: number; faction: string }[];
  /** Player/bot seats; 0 is reserved for system commands. */
  seats: readonly number[];
  grants: readonly Grant[];
  definitions: readonly Definition[];
}

/** Registers the phase-1a features in the simulation's fixed order. */
export function createMatch(setup: MatchSetup): Kernel {
  const kernel = createKernel(setup);
  register(kernel, entitiesFeature(setup.definitions));
  register(kernel, movementFeature(setup));
  return kernel;
}
