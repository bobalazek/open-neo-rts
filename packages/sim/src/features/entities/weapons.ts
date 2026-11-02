import {
  ARMOR_CLASSES,
  type ArmorClass,
  arr,
  BLOCKERS,
  bool,
  int,
  oneOf,
  opt,
  PROJECTILE_KINDS,
  rec,
  str,
  TARGETS,
  WARHEAD_TAGS,
  WARHEAD_TYPES,
} from "@open-neo-rts/content";
import { strictObject } from "../../snapshots/schema";

export interface GameplayWarhead {
  readonly type: string;
  readonly amount?: number;
  readonly amountPerSecond?: number;
  readonly versusPerMille?: Readonly<Partial<Record<ArmorClass | "default", number>>>;
  readonly radiusSubcells?: number;
  readonly falloffPerMille?: readonly number[];
  readonly delayTicks?: number;
  readonly durationTicks?: number;
  readonly perMille?: number;
  readonly unit?: string;
  readonly count?: number;
  readonly friendlyFire?: boolean;
  readonly tags: readonly string[];
}
export interface GameplayWeapon {
  readonly id: string;
  readonly targets: readonly string[];
  readonly rangeSubcells: readonly [number, number];
  readonly reloadTicks: number;
  readonly burst?: { readonly count: number; readonly delayTicks: number };
  readonly scatterSubcells?: number;
  readonly aim?: string;
  readonly arcAngle?: number;
  readonly socket?: string;
  readonly projectile: {
    readonly kind: string;
    readonly speedSubcellsPerTick?: number;
    readonly gravityPerMille?: number;
    readonly turnAnglePerTick?: number;
    readonly flightTicks?: number;
    readonly fuseTicks?: number;
    readonly blockedBy?: readonly string[];
    readonly interceptable?: boolean;
  };
  readonly warheads: readonly GameplayWarhead[];
}

export const weaponSchema = strictObject({
  id: str(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  targets: arr(oneOf(TARGETS), 1, TARGETS.length),
  rangeSubcells: arr(int(0, 60 * 1024), 2, 2),
  reloadTicks: int(0, 120 * 20),
  burst: opt(strictObject({ count: int(1, 20), delayTicks: int(0, 10 * 20) })),
  scatterSubcells: opt(int(0, 10 * 1024)),
  aim: opt(oneOf(["turret", "forward", "omni"])),
  arcAngle: opt(int(0, 0x10000)),
  socket: opt(str(/^socket_[a-z]+$/)),
  projectile: strictObject({
    kind: oneOf(PROJECTILE_KINDS),
    speedSubcellsPerTick: opt(int(0, 10 * 1024)),
    gravityPerMille: opt(int(0, 100 * 1000)),
    turnAnglePerTick: opt(int(0, 0x10000)),
    flightTicks: opt(int(0, 60 * 20)),
    fuseTicks: opt(int(0, 30 * 20)),
    blockedBy: opt(arr(oneOf(BLOCKERS), 0, BLOCKERS.length)),
    interceptable: opt(bool()),
  }),
  warheads: arr(
    strictObject({
      type: oneOf(WARHEAD_TYPES),
      amount: opt(int(0, 100000)),
      amountPerSecond: opt(int(0, 100000)),
      versusPerMille: opt(rec(int(0, 10000), new RegExp(`^(default|${ARMOR_CLASSES.join("|")})$`))),
      radiusSubcells: opt(int(0, 20 * 1024)),
      falloffPerMille: opt(arr(int(0, 1000), 1, 8)),
      delayTicks: opt(int(0, 30 * 20)),
      durationTicks: opt(int(0, 120 * 20)),
      perMille: opt(int(0, 1000)),
      unit: opt(str(/^([a-z0-9-]+\.)?unit:[a-z0-9-]+(\/[a-z0-9-]+)?$/)),
      count: opt(int(1, 20)),
      friendlyFire: opt(bool()),
      tags: arr(oneOf(WARHEAD_TAGS), 0, WARHEAD_TAGS.length),
    }),
    1,
    32,
  ),
});

/** Match-owned deeply immutable combat metadata; never freeze the caller's catalog. */
export function copyWeapons(weapons: readonly GameplayWeapon[]): readonly GameplayWeapon[] {
  return Object.freeze(
    weapons.map((weapon) =>
      Object.freeze({
        ...weapon,
        targets: Object.freeze([...weapon.targets]),
        rangeSubcells: Object.freeze([...weapon.rangeSubcells]) as readonly [number, number],
        ...(weapon.burst && { burst: Object.freeze({ ...weapon.burst }) }),
        projectile: Object.freeze({
          ...weapon.projectile,
          ...(weapon.projectile.blockedBy && {
            blockedBy: Object.freeze([...weapon.projectile.blockedBy]),
          }),
        }),
        warheads: Object.freeze(
          weapon.warheads.map((warhead) =>
            Object.freeze({
              ...warhead,
              tags: Object.freeze([...warhead.tags]),
              ...(warhead.versusPerMille && {
                versusPerMille: Object.freeze({ ...warhead.versusPerMille }),
              }),
              ...(warhead.falloffPerMille && {
                falloffPerMille: Object.freeze([...warhead.falloffPerMille]),
              }),
            }),
          ),
        ),
      }),
    ),
  );
}
