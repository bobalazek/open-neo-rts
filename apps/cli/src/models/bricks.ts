// Brick-model source format: `source/<name>.bricks.json` next to each definition, the editable original of its
// models. `bun neo build-models` turns it into `<name>.glb`, the wreck or rubble model and the icon, following
// docs/contributing/assets.md (Y-up, front +Z, origin at ground centre, named nodes, material slots, sockets).

/** Metres per brick unit, on every axis. Provisional until the art direction sign-off. */
export const BRICK = 0.25;

export type Vec3 = [x: number, y: number, z: number];

/** Material slots from assets.md; `team*` follow the owner's colour. */
export type Slot =
  | "palette"
  | "team"
  | "team_dark"
  | "team_light"
  | "team_emissive"
  | "metal"
  | "glass"
  | "emissive";

/** One box, in brick units relative to its node's origin: `at` is its minimum corner, `size` its extent. */
export interface Brick {
  at: Vec3;
  size: Vec3;
  slot: Slot;
  /** sRGB hex for `palette` bricks, e.g. "#5a5f66"; team and other slots ignore it. */
  color?: string;
  /** Studs on the top face (default true). Studs covered by another brick of the same node are left out. */
  studs?: boolean;
  /** Shape filling the box (default "box"): a slope whose top falls toward that side, or an octagonal cylinder along that axis. */
  shape?: "box" | "slope+x" | "slope-x" | "slope+z" | "slope-z" | "cyl-x" | "cyl-y" | "cyl-z";
  /** Also add a copy mirrored across the node's x = 0. */
  mirror?: boolean;
}

/**
 * A named node. Parts the sim drives use fixed names (`hull`, `turret`, `barrel`, `rotor`, `legs`); sockets are
 * nodes named `socket_<name>` without bricks; `state_damaged` and `state_critical` are optional hidden nodes.
 */
export interface BrickNode {
  name: string;
  parent?: string;
  /** The node's origin (its pivot), in brick units relative to the parent's origin. */
  at?: Vec3;
  /** Rest rotation in degrees around the pivot, applied X, then Y, then Z. */
  rotation?: Vec3;
  bricks?: Brick[];
}

/**
 * Keyframes for one node: `[time in seconds, value]`, rotations in degrees around the node's pivot.
 * rotation: absolute, applied X, then Y, then Z (it replaces the rest rotation). translation: offset in brick units
 * from the node's `at`. scale: absolute factors. Channels a clip leaves out are held at rest during that clip.
 */
export interface Track {
  node: string;
  rotation?: [t: number, degrees: Vec3][];
  translation?: [t: number, bricks: Vec3][];
  scale?: [t: number, factor: Vec3][];
}

export interface Clip {
  /** Seconds. */
  duration: number;
  loop?: boolean;
  tracks: Track[];
}

export interface BrickModel {
  /** Who made the model, copied into assets.json. Required by build-models; never invented. */
  author?: string;
  /** Every node, parents before children. The root node is the one without `parent`. */
  nodes: BrickNode[];
  /** Clip name (snake_case, as listed in `presentation.animations`) → keyframes. */
  animations?: Record<string, Clip>;
  /** How to derive the wreck (vehicles) or rubble (structures) model: nodes to drop, and a darkening factor. */
  destroyed?: { drop?: string[]; darken?: number };
}
