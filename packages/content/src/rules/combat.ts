// Combat vocabulary the engine understands. The numbers (damage, versus percentages, splash) live in each
// unit's or structure's weapons; see docs/design/combat-and-balance.md.

export const ARMOR_CLASSES = [
  "infantry",
  "light",
  "medium",
  "heavy",
  "aircraft",
  "naval",
  "structure",
] as const;
export type ArmorClass = (typeof ARMOR_CLASSES)[number];

export const TARGETS = ["ground", "air", "naval", "structure", "projectile"] as const;

/** How a shot travels. */
export const PROJECTILE_KINDS = [
  "instant",
  "bullet",
  "arc",
  "grenade",
  "missile",
  "beam",
  "dropped",
] as const;

/** What happens on impact. */
export const WARHEAD_TYPES = ["damage", "burn", "disable", "slow", "reveal", "spawn"] as const;

/** What blocks a projectile's path (arcing and dropped projectiles ignore blockers). */
export const BLOCKERS = ["terrain", "structures", "units"] as const;

/** Tags a warhead can carry, so upgrades and abilities can resist them. */
export const WARHEAD_TAGS = ["emp", "fire", "explosive", "energy", "nanite"] as const;
