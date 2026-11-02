// Weapon targeting and canonical launch intents. Projectile contact/damage are separate features.
import { atan2, cos, isqrt, mulDiv, nextInt, sin } from "@open-neo-rts/deterministic";
import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Feature, type Kernel, stream } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearFireLine, combatPoint } from "../../physics/fire-line";
import { BuilderConstruction, ConstructionSite, clearConstructionOrder } from "../construction";
import { suspendRepair } from "../construction/repair";
import { suspendHarvesting } from "../economy/harvesting";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import { Cargo } from "../entities/transport";
import type { GameplayWeapon } from "../entities/weapons";
import { MoveIntent } from "../movement";

export const MAX_SHOT_INTENTS = 4096;
export { Burning } from "./burn";
export { Disabled } from "./disable";
export const AttackOrder = defineComponent("AttackOrder", { target: "u32" });
export const WeaponState = defineComponent("WeaponState", {
  shooter: "u32",
  weapon: "u8",
  target: "u32",
  facing: "u16",
  reloadAt: "u32",
  nextShot: "u32",
  remaining: "u8",
});
/** Internal one-tick handoff. Never project these authoritative IDs or hidden firing origins. */
export const ShotIntent = defineComponent("ShotIntent", {
  rangeSubcells: "u32",
  damageBonus: "i32",
  source: "u32",
  tick: "u32",
  shooter: "u32",
  force: "u32",
  definition: "u32",
  weapon: "u8",
  target: "u32",
  originX: "i32",
  originY: "i32",
  targetX: "i32",
  targetY: "i32",
  scatterX: "i32",
  scatterY: "i32",
});
const kind = (definition: Definition | undefined) =>
  definition?.id.split(":")[0]?.split(".").at(-1);
const actorAlive = (kernel: Kernel, id: number) =>
  kernel.world.isAlive(id) &&
  kernel.world.has(id, Template) &&
  kernel.world.has(id, OwnerForce) &&
  kernel.world.has(id, Health) &&
  kernel.world.get(id, Health, "current") > 0;
const live = (kernel: Kernel, id: number) =>
  actorAlive(kernel, id) && kernel.world.has(id, Transform);
const shooterAlive = (kernel: Kernel, id: number) =>
  actorAlive(kernel, id) &&
  (kernel.world.has(id, Transform) || (!!kernel.transport && kernel.world.has(id, Cargo)));
const angleDelta = (from: number, to: number) => ((to - from + 0x8000) & 0xffff) - 0x8000;

export function clearAttackOrder(kernel: Kernel, actor: number): void {
  const world = kernel.world;
  const shooters = new Set([actor, ...(kernel.transport?.passengers(actor) ?? [])]);
  if (world.has(actor, AttackOrder)) world.remove(actor, AttackOrder);
  for (const state of world.query(WeaponState))
    if (shooters.has(world.get(state, WeaponState, "shooter"))) {
      world.set(state, WeaponState, "remaining", 0);
      world.set(state, WeaponState, "target", 0);
    }
}

/** Domain eligibility is shared by player orders, automatic acquisition and retaliation priority. */
export function weaponTargets(weapon: GameplayWeapon, target: Definition): boolean {
  if (kind(target) === "structure")
    return weapon.targets.includes("structure") || weapon.targets.includes("ground");
  if (kind(target) !== "unit") return false;
  return weapon.targets.includes(
    target.domain === "air" ? "air" : target.domain === "naval" ? "naval" : "ground",
  );
}
function versus(weapon: GameplayWeapon, target: Definition): number {
  return Math.max(
    0,
    ...weapon.warheads.map((warhead) =>
      warhead.type === "damage"
        ? ((target.armor && warhead.versusPerMille?.[target.armor]) ??
          warhead.versusPerMille?.default ??
          1000)
        : 1000,
    ),
  );
}
function scatter(kernel: Kernel, radius: number): { x: number; y: number } {
  if (!radius) return { x: 0, y: 0 };
  const random = stream(kernel, "combat");
  const angle = nextInt(random, 0x10000),
    length = isqrt(nextInt(random, radius * radius + 1));
  let x = mulDiv(cos(angle), length, 0x4000),
    y = mulDiv(sin(angle), length, 0x4000);
  if (x * x + y * y > radius * radius) {
    const bound = isqrt(x * x + y * y) + 1;
    x = mulDiv(x, radius, bound);
    y = mulDiv(y, radius, bound);
  }
  return { x, y };
}

export function combatFeature(setup: Pick<MatchSetup, "definitions" | "grants">): Feature {
  const { definitions, grants } = setup;
  const definitionOf = (kernel: Kernel, id: number) =>
    definitions[kernel.world.get(id, Template, "definition")];
  const platformOf = (kernel: Kernel, shooter: number) =>
    live(kernel, shooter) ? shooter : kernel.transport?.firingPlatform(shooter);
  const lineOf = (kernel: Kernel, shooter: number, target: number, weapon: GameplayWeapon) => {
    const platform = platformOf(kernel, shooter);
    return platform !== undefined && clearFireLine(kernel, definitions, platform, target, weapon);
  };
  const eligible = (kernel: Kernel, shooter: number, target: number, weapon: GameplayWeapon) => {
    if (platformOf(kernel, shooter) === undefined || !live(kernel, target) || shooter === target)
      return false;
    const world = kernel.world;
    const force = world.get(shooter, OwnerForce, "force"),
      other = world.get(target, OwnerForce, "force");
    const ownGroup = kernel.vision?.groupForForce(force),
      otherGroup = kernel.vision?.groupForForce(other);
    const definition = definitionOf(kernel, target);
    return (
      ownGroup !== undefined &&
      otherGroup !== undefined &&
      ownGroup !== otherGroup &&
      !!definition &&
      weaponTargets(weapon, definition) &&
      kernel.vision?.canSeeEntity(force, target) === true
    );
  };
  const canAttack = (kernel: Kernel, actor: number, target: number) =>
    [actor, ...(kernel.transport?.firingPassengers(actor) ?? [])].some((shooter) =>
      definitionOf(kernel, shooter)?.weapons?.some((weapon) =>
        eligible(kernel, shooter, target, weapon),
      ),
    );
  const inRange = (kernel: Kernel, shooter: number, target: number, weapon: GameplayWeapon) => {
    const platform = platformOf(kernel, shooter);
    if (platform === undefined) return false;
    const a = combatPoint(kernel, definitions, platform),
      b = combatPoint(kernel, definitions, target);
    const squared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const maximum =
      kernel.unitModes?.range(shooter, weapon.rangeSubcells[1]) ?? weapon.rangeSubcells[1];
    return squared >= weapon.rangeSubcells[0] ** 2 && squared <= maximum ** 2;
  };
  const choose = (kernel: Kernel, shooter: number, weapon: GameplayWeapon) => {
    const world = kernel.world;
    const platform = platformOf(kernel, shooter);
    if (platform === undefined) return;
    if (world.has(platform, AttackOrder)) {
      const explicit = world.get(platform, AttackOrder, "target");
      return eligible(kernel, shooter, explicit, weapon) &&
        inRange(kernel, shooter, explicit, weapon) &&
        lineOf(kernel, shooter, explicit, weapon)
        ? explicit
        : undefined;
    }
    const actor = definitionOf(kernel, platform) as Definition;
    const origin = combatPoint(kernel, definitions, platform);
    const rank = (target: number) => {
      const definition = definitionOf(kernel, target) as Definition;
      const point = combatPoint(kernel, definitions, target);
      const threat = definition.weapons?.some(
        (other) => weaponTargets(other, actor) && versus(other, actor) > 0,
      );
      return {
        tier: threat ? 0 : kind(definition) === "unit" ? 1 : 2,
        versus: versus(weapon, definition),
        distance: (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2,
      };
    };
    return world
      .query(Template, Transform, OwnerForce, Health)
      .filter(
        (target) =>
          eligible(kernel, shooter, target, weapon) &&
          inRange(kernel, shooter, target, weapon) &&
          lineOf(kernel, shooter, target, weapon),
      )
      .sort((a, b) => {
        const x = rank(a),
          y = rank(b);
        return x.tier - y.tier || y.versus - x.versus || x.distance - y.distance || a - b;
      })[0];
  };
  return {
    components: [AttackOrder, WeaponState, ShotIntent],
    handlers: {
      "unit.attack": (kernel, { seat, payload: { entities, entity } }) => {
        const world = kernel.world;
        const actors = [...new Set(entities.filter((id) => live(kernel, id)))].sort(
          (a, b) => a - b,
        );
        if (!actors.length || !live(kernel, entity)) return "bad_payload";
        if (
          !actors.every((id) =>
            hasGrant(grants, seat, world.get(id, OwnerForce, "force"), "unit.orders", kernel.tick),
          )
        )
          return "no_grant";
        const armed = actors.filter((id) => canAttack(kernel, id, entity));
        if (!armed.length) return "bad_payload";
        for (const actor of armed) {
          kernel.transport?.cancel(actor);
          suspendHarvesting(kernel, actor);
          suspendRepair(kernel, actor);
          clearAttackOrder(kernel, actor);
          if (world.has(actor, BuilderConstruction)) clearConstructionOrder(kernel, actor);
          kernel.movement?.cancel(actor);
          if (world.has(actor, MoveIntent)) world.remove(actor, MoveIntent);
          world.add(actor, AttackOrder, { target: entity });
        }
      },
    },
    systems: {
      combat: [
        (kernel) => {
          const world = kernel.world;
          for (const shot of world.query(ShotIntent)) world.destroy(shot);
          // Movement has completed. Fire against current Force sight, not the bot's previous observation.
          kernel.vision?.update();
          for (const actor of world.query(AttackOrder))
            if (
              !live(kernel, actor) ||
              !canAttack(kernel, actor, world.get(actor, AttackOrder, "target"))
            )
              clearAttackOrder(kernel, actor);
          for (const state of world.query(WeaponState))
            if (!shooterAlive(kernel, world.get(state, WeaponState, "shooter")))
              world.destroy(state);
          for (const shooter of world.query(Template, OwnerForce, Health)) {
            const definition = definitionOf(kernel, shooter);
            if (!shooterAlive(kernel, shooter) || !definition?.weapons?.length) continue;
            for (const [weapon] of definition.weapons.entries())
              if (
                !world
                  .query(WeaponState)
                  .some(
                    (state) =>
                      world.get(state, WeaponState, "shooter") === shooter &&
                      world.get(state, WeaponState, "weapon") === weapon,
                  )
              ) {
                const state = world.create();
                world.add(state, WeaponState, {
                  shooter,
                  weapon,
                  facing: world.has(shooter, Transform)
                    ? world.get(shooter, Transform, "facing")
                    : world.get(shooter, Cargo, "facing"),
                });
              }
          }
          let emitted = 0;
          const states = world
            .query(WeaponState)
            .sort(
              (a, b) =>
                world.get(a, WeaponState, "shooter") - world.get(b, WeaponState, "shooter") ||
                world.get(a, WeaponState, "weapon") - world.get(b, WeaponState, "weapon"),
            );
          for (const state of states) {
            const shooter = world.get(state, WeaponState, "shooter");
            const platform = platformOf(kernel, shooter);
            if (platform === undefined || kernel.disabled?.(platform)) {
              world.set(state, WeaponState, "remaining", 0);
              world.set(state, WeaponState, "target", 0);
              continue;
            }
            const definition = definitionOf(kernel, shooter);
            const weapon = definition?.weapons?.[world.get(state, WeaponState, "weapon")];
            if (
              !definition ||
              !weapon ||
              world.has(shooter, ConstructionSite) ||
              (kind(definition) === "structure" &&
                definition.power !== undefined &&
                !kernel.power?.powered(shooter))
            )
              continue;
            let remaining = world.get(state, WeaponState, "remaining");
            const previous = world.get(state, WeaponState, "target");
            if (
              remaining &&
              (!eligible(kernel, shooter, previous, weapon) ||
                !inRange(kernel, shooter, previous, weapon) ||
                !lineOf(kernel, shooter, previous, weapon))
            ) {
              remaining = 0;
              world.set(state, WeaponState, "remaining", 0);
            }
            const target = remaining ? previous : choose(kernel, shooter, weapon);
            world.set(state, WeaponState, "target", target ?? 0);
            if (target === undefined) continue;
            const origin = combatPoint(kernel, definitions, platform),
              aim = combatPoint(kernel, definitions, target);
            const desired = atan2(aim.y - origin.y, aim.x - origin.x);
            if (weapon.aim === "turret") {
              const facing = world.get(state, WeaponState, "facing"),
                difference = angleDelta(facing, desired),
                rate = definition.turretTurnAnglePerTick ?? 0;
              const next = (facing + Math.max(0 - rate, Math.min(rate, difference))) & 0xffff;
              world.set(state, WeaponState, "facing", next);
              if (next !== desired) continue;
            } else if (weapon.aim === "forward") {
              let facing =
                platform === shooter
                  ? world.get(shooter, Transform, "facing")
                  : world.get(state, WeaponState, "facing");
              if (
                (platform !== shooter || !world.has(shooter, MoveIntent)) &&
                kind(definition) === "unit"
              ) {
                const difference = angleDelta(facing, desired),
                  rate = definition.turnRate;
                facing = (facing + Math.max(0 - rate, Math.min(rate, difference))) & 0xffff;
                if (platform === shooter) world.set(shooter, Transform, "facing", facing);
                else world.set(state, WeaponState, "facing", facing);
              }
              if (Math.abs(angleDelta(facing, desired)) > (weapon.arcAngle ?? 0)) continue;
            }
            const due = remaining
              ? world.get(state, WeaponState, "nextShot")
              : world.get(state, WeaponState, "reloadAt");
            if (kernel.tick < due || emitted >= MAX_SHOT_INTENTS) continue;
            let shots = remaining || weapon.burst?.count || 1;
            while (
              shots > 0 &&
              emitted < MAX_SHOT_INTENTS &&
              (kernel.canLaunch?.(
                world.get(shooter, Template, "definition"),
                world.get(state, WeaponState, "weapon"),
              ) ??
                true)
            ) {
              const maximum =
                kernel.unitModes?.range(shooter, weapon.rangeSubcells[1]) ??
                weapon.rangeSubcells[1];
              const radius = maximum
                ? mulDiv(
                    weapon.scatterSubcells ?? 0,
                    isqrt((aim.x - origin.x) ** 2 + (aim.y - origin.y) ** 2),
                    maximum,
                  )
                : 0;
              const offset = scatter(kernel, radius);
              const shot = world.create();
              world.add(shot, ShotIntent, {
                rangeSubcells: maximum,
                damageBonus: Math.min(
                  1000,
                  (kernel.unitModes?.damageBonus(shooter) ?? 0) +
                    (kernel.veterancy?.damageBonus(shooter) ?? 0),
                ),
                source: shooter,
                tick: kernel.tick,
                shooter: platform,
                force: world.get(shooter, OwnerForce, "force"),
                definition: world.get(shooter, Template, "definition"),
                weapon: world.get(state, WeaponState, "weapon"),
                target,
                originX: origin.x,
                originY: origin.y,
                targetX: aim.x,
                targetY: aim.y,
                scatterX: offset.x,
                scatterY: offset.y,
              });
              emitted++;
              shots--;
              world.set(state, WeaponState, "remaining", shots);
              world.set(
                state,
                WeaponState,
                "reloadAt",
                kernel.tick + Math.max(1, weapon.reloadTicks),
              );
              world.set(
                state,
                WeaponState,
                "nextShot",
                kernel.tick + (weapon.burst?.delayTicks ?? 0),
              );
              if (weapon.burst?.delayTicks) break;
            }
          }
        },
      ],
    },
  };
}
