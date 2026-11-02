import { atan2, isqrt } from "@open-neo-rts/deterministic";
import type { Kernel } from "../../kernel";
import { combatPoint } from "../../physics/fire-line";
import { entityBounds } from "../../physics/trace";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import type { GameplayWarhead, GameplayWeapon } from "../entities/weapons";
import { emitCombatEvent } from "../events/combat";
import { weaponTargets } from ".";

export interface DamageImpact {
  readonly force: number;
  readonly direct: number;
  readonly x: number;
  readonly y: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly air: boolean;
  readonly maxLevel: number;
}

function distance(
  kernel: Kernel,
  definitions: readonly Definition[],
  target: number,
  point: { x: number; y: number },
): number {
  const bounds = entityBounds(kernel, definitions, target);
  if (bounds) {
    const x = point.x - Math.max(bounds[0], Math.min(bounds[2], point.x));
    const y = point.y - Math.max(bounds[1], Math.min(bounds[3], point.y));
    return isqrt(x * x + y * y);
  }
  const centre = combatPoint(kernel, definitions, target),
    definition = definitions[kernel.world.get(target, Template, "definition")];
  return Math.max(
    0,
    isqrt((point.x - centre.x) ** 2 + (point.y - centre.y) ** 2) -
      (definition?.radiusSubcells ?? 0),
  );
}

/** One exact product, one final floor. Explicit zero factors remain zero rather than minimum damage. */
export function warheadDamage(
  warhead: GameplayWarhead,
  target: Definition,
  falloff: number,
  facing = 1000,
): number {
  const amount = warhead.amount ?? 0;
  const versus =
    (target.armor && warhead.versusPerMille?.[target.armor]) ??
    warhead.versusPerMille?.default ??
    1000;
  const tags = [...new Set(warhead.tags)].sort();
  let numerator = BigInt(amount) * BigInt(versus) * BigInt(falloff) * BigInt(facing),
    denominator = 1000n ** 3n;
  for (const tag of tags) {
    numerator *= BigInt(target.resistPerMille?.[tag] ?? 1000);
    denominator *= 1000n;
  }
  return numerator === 0n ? 0 : Math.max(1, Number(numerator / denominator));
}

export function applyDamageWarhead(
  kernel: Kernel,
  definitions: readonly Definition[],
  weapon: GameplayWeapon,
  warhead: GameplayWarhead,
  impact: DamageImpact,
  friendlyFire: boolean,
): void {
  if (warhead.type !== "damage") return;
  const { world } = kernel;
  const radius = warhead.radiusSubcells ?? 0;
  const targets =
    radius > 0
      ? world.query(Template, Transform, OwnerForce, Health)
      : world.isAlive(impact.direct)
        ? [impact.direct]
        : [];
  for (const target of targets) {
    if (
      !world.has(target, Health) ||
      !world.has(target, OwnerForce) ||
      world.get(target, Health, "current") === 0
    )
      continue;
    const definition = definitions[world.get(target, Template, "definition")];
    if (
      !definition ||
      !weaponTargets(weapon, definition) ||
      (definition.domain === "air") !== impact.air
    )
      continue;
    const centre = combatPoint(kernel, definitions, target),
      terrain = kernel.map?.terrain;
    if (
      terrain &&
      (terrain.level[Math.floor(centre.y / 1024) * terrain.width + Math.floor(centre.x / 1024)] ??
        0) > impact.maxLevel
    )
      continue;
    const force = world.get(target, OwnerForce, "force");
    const allied =
      force === impact.force ||
      kernel.vision?.groupForForce(force) === kernel.vision?.groupForForce(impact.force);
    if (allied && (radius === 0 || !(warhead.friendlyFire ?? friendlyFire))) continue;
    const range = radius > 0 ? distance(kernel, definitions, target, impact) : 0;
    if (range > radius) continue;
    const rings = warhead.falloffPerMille ?? [1000];
    const falloff =
      radius > 0
        ? (rings[Math.min(rings.length - 1, Math.floor((range * rings.length) / radius))] ?? 1000)
        : 1000;
    let facing = 1000;
    if (
      ["light", "medium", "heavy", "naval"].includes(definition.armor ?? "") &&
      !definition.footprint
    ) {
      const centre = combatPoint(kernel, definitions, target);
      const incoming = atan2(impact.fromY - centre.y, impact.fromX - centre.x);
      const difference = Math.abs(
        ((incoming - world.get(target, Transform, "facing") + 0x8000) & 0xffff) - 0x8000,
      );
      facing = difference > 0x6000 ? 1500 : difference > 0x2000 ? 1250 : 1000;
    }
    const amount = Math.min(
      world.get(target, Health, "current"),
      warheadDamage(warhead, definition, falloff, facing),
    );
    if (!amount) continue;
    world.set(target, Health, "current", world.get(target, Health, "current") - amount);
    const point = combatPoint(kernel, definitions, target);
    emitCombatEvent(kernel, { type: "damage", ...point, force, amount, entity: target });
  }
}
