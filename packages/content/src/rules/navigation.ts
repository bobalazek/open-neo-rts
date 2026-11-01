import type { DOMAINS } from "../schemas/definitions";
import type { Surface } from "./terrain";

export type MovementDomain = (typeof DOMAINS)[number];
export type GroundDomain = Exclude<MovementDomain, "air">;

/** Land, shallow, deep; owner decision 2026-11-01-movement-water-table.md. */
export const WATER_PASSABLE: Record<GroundDomain, readonly [boolean, boolean, boolean]> = {
  foot: [true, true, false],
  wheeled: [true, true, false],
  tracked: [true, false, false],
  hover: [true, true, true],
  amphibious: [true, true, true],
  naval: [false, false, true],
};

/** Addition: first-pass route preferences, not physical speed or final terrain balance. */
export const SURFACE_ROUTE_COST: Record<Surface, number> = {
  grass: 2,
  dirt: 2,
  sand: 2,
  rock: 2,
  snow: 2,
  ice: 2,
  road: 1,
  rubble: 3,
};
