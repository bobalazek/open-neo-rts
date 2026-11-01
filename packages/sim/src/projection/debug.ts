import type { GroundDomain } from "@open-neo-rts/content";
import type { MatchMap } from "../match-map";

/** Opt-in copied debug diagnostics, never normal seat vision. */
export interface DebugOverlayOptions {
  terrain: boolean;
  navigation: GroundDomain | null;
  paths: boolean;
}
export interface DebugOverlayData {
  tick: number;
  /** Immutable map layers are sent once per worker lifetime, when first requested. */
  terrain?: MatchMap["terrain"];
  /** Sent only when the requested profile or live static occupancy changes. */
  navigation?: {
    revision: number;
    width: number;
    height: number;
    domain: GroundDomain;
    radiusSubcells: number;
    cost: number[];
    connections: number[];
    speedPercent: number[];
  };
  paths?: {
    handle: string;
    points: { x: number; y: number }[];
    target: { x: number; y: number };
    searching: boolean;
  }[];
}
