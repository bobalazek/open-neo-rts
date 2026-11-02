// First-playable instant, ballistic bullet and steering missile flight, contact and damage.
import { atan2, cos, divFloor, isqrt, nextInt, sin } from "@open-neo-rts/deterministic";
import { defineComponent } from "../../ecs";
import { type Kernel, register, stream } from "../../kernel";
import type { MatchSetup } from "../../match";
import { combatPoint } from "../../physics/fire-line";
import { type Contact, type Fraction, traceProjectile } from "../../physics/trace";
import { AttackOrder, clearAttackOrder, ShotIntent, WeaponState } from "../combat";
import { applyDamageWarhead, type DamageImpact } from "../combat/damage";
import { Health, OwnerForce, Template, Transform } from "../entities";
import type { GameplayWeapon } from "../entities/weapons";
import { emitCombatEvent } from "../events/combat";

export const MAX_ACTIVE_ROUNDS = 8192;
export const CombatMotion = defineComponent("CombatMotion", { x: "i32", y: "i32" });
export const Projectile = defineComponent("Projectile", {
  damageBonus: "i32",
  shooter: "u32",
  force: "u32",
  definition: "u32",
  weapon: "u8",
  target: "u32",
  air: "u8",
  level: "u8",
  ceiling: "u8",
  x: "i32",
  y: "i32",
  fromX: "i32",
  fromY: "i32",
  destinationX: "i32",
  destinationY: "i32",
  scatterX: "i32",
  scatterY: "i32",
  velocityX: "i32",
  velocityY: "i32",
  facing: "u16",
  speed: "u32",
  age: "u32",
  life: "u32",
  phase: "u8",
  fuseDue: "u32",
  born: "u32",
});
/** One row per impact, with one once-only bit per authored warhead. Delays are relative to impact. */
export const PendingImpact = defineComponent("PendingImpact", {
  damageBonus: "i32",
  shooter: "u32",
  force: "u32",
  definition: "u32",
  weapon: "u8",
  direct: "u32",
  air: "u8",
  ceiling: "u8",
  x: "i32",
  y: "i32",
  fromX: "i32",
  fromY: "i32",
  tick: "u32",
  remaining: "u32",
});
const live = (kernel: Kernel, id: number) =>
  kernel.world.isAlive(id) &&
  kernel.world.has(id, Transform) &&
  kernel.world.has(id, Health) &&
  kernel.world.get(id, Health, "current") > 0;
const angleDelta = (from: number, to: number) => ((to - from + 0x8000) & 0xffff) - 0x8000;
const velocity = (facing: number, speed: number) => ({
  x: divFloor(2 * cos(facing) * speed + 0x4000, 2 * 0x4000),
  y: divFloor(2 * sin(facing) * speed + 0x4000, 2 * 0x4000),
});
const supported = (weapon: GameplayWeapon | undefined): weapon is GameplayWeapon =>
  !!weapon &&
  ["instant", "bullet", "missile"].includes(weapon.projectile.kind) &&
  weapon.warheads.every((warhead) => warhead.type === "damage") &&
  (weapon.projectile.kind === "instant" ||
    ((weapon.projectile.speedSubcellsPerTick ?? 0) > 0 && weapon.projectile.flightTicks !== 0)) &&
  (weapon.projectile.kind !== "missile" ||
    (weapon.projectile.turnAnglePerTick !== undefined &&
      weapon.projectile.flightTicks !== undefined));

/** Bounded fixed-point intercept refinement from actual movement, never from an intended destination. */
function lead(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  movement: { x: number; y: number },
  speed: number,
  life: number,
  width: number,
  height: number,
) {
  let ticks = 0;
  const predicted = () => ({
    x: Math.max(0, Math.min(width * 1024 - 1, target.x + Math.floor((movement.x * ticks) / 1024))),
    y: Math.max(0, Math.min(height * 1024 - 1, target.y + Math.floor((movement.y * ticks) / 1024))),
  });
  for (let iteration = 0; iteration < 3; iteration++) {
    const point = predicted(),
      dx = point.x - origin.x,
      dy = point.y - origin.y;
    ticks = Math.min(life * 1024, Math.floor((isqrt(dx * dx + dy * dy) * 1024) / speed));
  }
  return predicted();
}

export function initializeProjectiles(
  kernel: Kernel,
  setup: Pick<MatchSetup, "definitions" | "normal">,
): void {
  if (kernel.canLaunch) throw new Error("Projectiles are already initialized");
  const { definitions } = setup;
  const friendlyFire = setup.normal?.settings.friendlyFire ?? true;
  const highGroundMiss = setup.normal?.settings.highGroundMissPerMille ?? 250;
  const { world } = kernel;
  const { width = 512, height = 512 } = kernel.map?.terrain ?? {};
  const weaponOf = (definition: number, weapon: number) =>
    definitions[definition]?.weapons?.[weapon];
  const movementOf = (target: number) => {
    if (!live(kernel, target) || !world.has(target, CombatMotion)) return { x: 0, y: 0 };
    return {
      x: world.get(target, Transform, "x") - world.get(target, CombatMotion, "x"),
      y: world.get(target, Transform, "y") - world.get(target, CombatMotion, "y"),
    };
  };
  const elevation = (point: { x: number; y: number }) => {
    const terrain = kernel.map?.terrain;
    return (
      terrain?.level[Math.floor(point.y / 1024) * terrain.width + Math.floor(point.x / 1024)] ?? 0
    );
  };
  const impactGeometry = new Map<number, DamageImpact["geometry"]>();
  const impact = (
    id: number,
    data: {
      damageBonus: number;
      shooter: number;
      force: number;
      definition: number;
      weapon: number;
      direct: number;
      air: number;
      ceiling: number;
      x: number;
      y: number;
      fromX: number;
      fromY: number;
    },
    delay = 0,
    geometry?: DamageImpact["geometry"],
  ) => {
    const weapon = weaponOf(data.definition, data.weapon);
    if (!weapon) {
      world.destroy(id);
      return;
    }
    if (!delay && geometry) impactGeometry.set(id, geometry);
    if (world.has(id, Projectile)) world.remove(id, Projectile);
    world.add(id, PendingImpact, {
      ...data,
      tick: kernel.tick + delay,
      remaining: weapon.warheads.length === 32 ? 0xffffffff : 2 ** weapon.warheads.length - 1,
    });
    emitCombatEvent(kernel, {
      type: "impact",
      x: data.x,
      y: data.y,
      force: data.force,
      round: id,
      projectile: weapon.projectile.kind as "instant" | "bullet" | "missile",
    });
  };
  const strike = (
    id: number,
    hit: Contact | { x: number; y: number; entity: number },
    from: { x: number; y: number },
    geometry?: DamageImpact["geometry"],
  ) => {
    const weapon = weaponOf(
      world.get(id, Projectile, "definition"),
      world.get(id, Projectile, "weapon"),
    );
    if (!weapon) {
      world.destroy(id);
      return;
    }
    world.set(id, Projectile, "x", hit.x);
    world.set(id, Projectile, "y", hit.y);
    world.set(id, Projectile, "fromX", from.x);
    world.set(id, Projectile, "fromY", from.y);
    world.set(id, Projectile, "target", hit.entity);
    if (weapon.projectile.fuseTicks) {
      world.set(id, Projectile, "phase", 1);
      world.set(id, Projectile, "fuseDue", kernel.tick + weapon.projectile.fuseTicks);
      return;
    }
    impact(
      id,
      {
        shooter: world.get(id, Projectile, "shooter"),
        damageBonus: world.get(id, Projectile, "damageBonus"),
        force: world.get(id, Projectile, "force"),
        definition: world.get(id, Projectile, "definition"),
        weapon: world.get(id, Projectile, "weapon"),
        direct: hit.entity,
        air: world.get(id, Projectile, "air"),
        ceiling: world.get(id, Projectile, "ceiling"),
        x: hit.x,
        y: hit.y,
        fromX: from.x,
        fromY: from.y,
      },
      0,
      geometry,
    );
  };
  register(kernel, {
    components: [CombatMotion, Projectile, PendingImpact],
    systems: {
      combat: [
        () => {
          kernel.combatEvents = [];
          impactGeometry.clear();
          for (const shot of world.query(ShotIntent)) {
            const definition = world.get(shot, ShotIntent, "definition"),
              index = world.get(shot, ShotIntent, "weapon"),
              weapon = weaponOf(definition, index);
            const shooter = world.get(shot, ShotIntent, "shooter"),
              force = world.get(shot, ShotIntent, "force"),
              damageBonus = world.get(shot, ShotIntent, "damageBonus");
            if (!supported(weapon)) {
              world.destroy(shot);
              continue;
            }
            const origin = {
              x: world.get(shot, ShotIntent, "originX"),
              y: world.get(shot, ShotIntent, "originY"),
            };
            const raw = {
              x: world.get(shot, ShotIntent, "targetX"),
              y: world.get(shot, ShotIntent, "targetY"),
            };
            const target = world.get(shot, ShotIntent, "target"),
              targetDefinition = live(kernel, target)
                ? definitions[world.get(target, Template, "definition")]
                : undefined;
            const air = targetDefinition?.domain === "air";
            const miss =
              !air &&
              elevation(raw) > elevation(origin) &&
              highGroundMiss > 0 &&
              nextInt(stream(kernel, "combat"), 1000) < highGroundMiss;
            const level = miss ? elevation(origin) : Math.max(elevation(origin), elevation(raw)),
              ceiling = miss ? elevation(origin) : 255;
            const speed = weapon.projectile.speedSubcellsPerTick ?? 0;
            const range = world.get(shot, ShotIntent, "rangeSubcells");
            const life =
              weapon.projectile.flightTicks ??
              Math.max(
                1,
                Math.floor(
                  (2 * (range + (weapon.scatterSubcells ?? 0)) + speed - 1) / Math.max(1, speed),
                ),
              );
            const offset = {
              x: world.get(shot, ShotIntent, "scatterX"),
              y: world.get(shot, ShotIntent, "scatterY"),
            };
            const predicted =
              weapon.projectile.kind === "instant"
                ? raw
                : lead(origin, raw, movementOf(target), speed, life, width, height);
            const destination = { x: predicted.x + offset.x, y: predicted.y + offset.y };
            world.remove(shot, ShotIntent);
            emitCombatEvent(kernel, {
              type: "launch",
              ...origin,
              force,
              round: shot,
              entity: shooter,
              projectile: weapon.projectile.kind as "instant" | "bullet" | "missile",
            });
            if (weapon.projectile.kind === "instant") {
              const traceWeapon = miss
                ? {
                    ...weapon,
                    projectile: {
                      ...weapon.projectile,
                      blockedBy: [...new Set([...(weapon.projectile.blockedBy ?? []), "terrain"])],
                    },
                  }
                : weapon;
              const hit = traceProjectile(kernel, definitions, {
                a: origin,
                b: destination,
                shooter,
                force,
                air,
                level,
                weapon: traceWeapon,
              });
              if (hit?.kind === "boundary") {
                world.destroy(shot);
                continue;
              }
              impact(
                shot,
                {
                  shooter,
                  damageBonus,
                  force,
                  definition,
                  weapon: index,
                  direct: hit?.entity ?? 0,
                  air: air ? 1 : 0,
                  ceiling,
                  x: hit?.x ?? destination.x,
                  y: hit?.y ?? destination.y,
                  fromX: origin.x,
                  fromY: origin.y,
                },
                weapon.projectile.fuseTicks ?? 0,
              );
            } else {
              const facing = atan2(destination.y - origin.y, destination.x - origin.x),
                v = velocity(facing, speed);
              world.add(shot, Projectile, {
                damageBonus,
                shooter,
                force,
                definition,
                weapon: index,
                target: live(kernel, target) ? target : 0,
                air: air ? 1 : 0,
                level,
                ceiling,
                x: origin.x,
                y: origin.y,
                destinationX: destination.x,
                destinationY: destination.y,
                scatterX: offset.x,
                scatterY: offset.y,
                facing,
                velocityX: v.x,
                velocityY: v.y,
                speed: weapon.projectile.kind === "missile" ? 0 : speed,
                life,
                born: kernel.tick,
              });
            }
          }
          const motion = new Map(
            world
              .query(CombatMotion)
              .map((id) => [
                id,
                { x: world.get(id, CombatMotion, "x"), y: world.get(id, CombatMotion, "y") },
              ]),
          );
          for (const id of world.query(Projectile)) {
            if (world.get(id, Projectile, "born") === kernel.tick) continue;
            const weapon = weaponOf(
              world.get(id, Projectile, "definition"),
              world.get(id, Projectile, "weapon"),
            );
            if (!weapon) {
              world.destroy(id);
              continue;
            }
            let target = world.get(id, Projectile, "target");
            if (!live(kernel, target)) {
              target = 0;
              world.set(id, Projectile, "target", 0);
            }
            const a = { x: world.get(id, Projectile, "x"), y: world.get(id, Projectile, "y") };
            if (world.get(id, Projectile, "phase") === 1) {
              if (kernel.tick >= world.get(id, Projectile, "fuseDue"))
                impact(id, {
                  damageBonus: world.get(id, Projectile, "damageBonus"),
                  shooter: world.get(id, Projectile, "shooter"),
                  force: world.get(id, Projectile, "force"),
                  definition: world.get(id, Projectile, "definition"),
                  weapon: world.get(id, Projectile, "weapon"),
                  direct: target,
                  air: world.get(id, Projectile, "air"),
                  ceiling: world.get(id, Projectile, "ceiling"),
                  ...a,
                  fromX: world.get(id, Projectile, "fromX"),
                  fromY: world.get(id, Projectile, "fromY"),
                });
              continue;
            }
            const age = world.get(id, Projectile, "age"),
              life = world.get(id, Projectile, "life");
            if (age >= life) {
              world.destroy(id);
              continue;
            }
            const maxSpeed = weapon.projectile.speedSubcellsPerTick as number;
            let speed = world.get(id, Projectile, "speed"),
              facing = world.get(id, Projectile, "facing");
            if (weapon.projectile.kind === "missile") {
              speed = Math.min(maxSpeed, speed + Math.max(1, Math.floor((maxSpeed + 3) / 4)));
              if (target) {
                const goal = lead(
                  a,
                  combatPoint(kernel, definitions, target),
                  movementOf(target),
                  maxSpeed,
                  life - age,
                  width,
                  height,
                );
                world.set(
                  id,
                  Projectile,
                  "destinationX",
                  goal.x + world.get(id, Projectile, "scatterX"),
                );
                world.set(
                  id,
                  Projectile,
                  "destinationY",
                  goal.y + world.get(id, Projectile, "scatterY"),
                );
              }
              const desired = atan2(
                  world.get(id, Projectile, "destinationY") - a.y,
                  world.get(id, Projectile, "destinationX") - a.x,
                ),
                delta = angleDelta(facing, desired),
                rate = weapon.projectile.turnAnglePerTick ?? 0;
              facing = (facing + Math.max(0 - rate, Math.min(rate, delta))) & 0xffff;
              const v = velocity(facing, speed);
              world.set(id, Projectile, "velocityX", v.x);
              world.set(id, Projectile, "velocityY", v.y);
            }
            world.set(id, Projectile, "speed", speed);
            world.set(id, Projectile, "facing", facing);
            const destination = {
              x: world.get(id, Projectile, "destinationX"),
              y: world.get(id, Projectile, "destinationY"),
            };
            let b = {
              x: a.x + world.get(id, Projectile, "velocityX"),
              y: a.y + world.get(id, Projectile, "velocityY"),
            };
            const close = (destination.x - a.x) ** 2 + (destination.y - a.y) ** 2 <= speed * speed;
            const shortened =
              close &&
              (weapon.projectile.kind === "bullet" ||
                facing === atan2(destination.y - a.y, destination.x - a.x));
            if (shortened) b = destination;
            const traceWeapon =
              world.get(id, Projectile, "ceiling") < 255
                ? {
                    ...weapon,
                    projectile: {
                      ...weapon.projectile,
                      blockedBy: [...new Set([...(weapon.projectile.blockedBy ?? []), "terrain"])],
                    },
                  }
                : weapon;
            const duration: Fraction = shortened
              ? {
                  n: BigInt(Math.min(speed, isqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2))),
                  d: BigInt(speed),
                }
              : { n: 1n, d: 1n };
            const hit = traceProjectile(kernel, definitions, {
              a,
              b,
              shooter: world.get(id, Projectile, "shooter"),
              force: world.get(id, Projectile, "force"),
              air: world.get(id, Projectile, "air") === 1,
              level: world.get(id, Projectile, "level"),
              weapon: traceWeapon,
              motion,
              // A final short segment reaches its aim point before the end of this movement tick.
              duration,
            });
            world.set(id, Projectile, "age", age + 1);
            if (hit?.kind === "boundary") {
              world.destroy(id);
              continue;
            }
            if (hit) {
              strike(id, hit, a, {
                at: { n: hit.at.n * duration.n, d: hit.at.d * duration.d },
                motion,
              });
              continue;
            }
            world.set(id, Projectile, "x", b.x);
            world.set(id, Projectile, "y", b.y);
            if (
              b.x === destination.x &&
              b.y === destination.y &&
              (weapon.projectile.kind === "bullet" || !target)
            ) {
              strike(id, { ...b, entity: 0 }, a, { at: duration, motion });
              continue;
            }
            emitCombatEvent(kernel, {
              type: "flight",
              ...b,
              force: world.get(id, Projectile, "force"),
              round: id,
              projectile: weapon.projectile.kind as "bullet" | "missile",
            });
          }
          for (const id of world.query(PendingImpact)) {
            const weapon = weaponOf(
              world.get(id, PendingImpact, "definition"),
              world.get(id, PendingImpact, "weapon"),
            );
            if (!weapon) {
              world.destroy(id);
              continue;
            }
            let remaining = world.get(id, PendingImpact, "remaining");
            const direct = world.get(id, PendingImpact, "direct");
            if (!live(kernel, direct)) world.set(id, PendingImpact, "direct", 0);
            for (const [index, warhead] of weapon.warheads.entries()) {
              const bit = 1 << index;
              if (
                !(remaining & bit) ||
                kernel.tick < world.get(id, PendingImpact, "tick") + (warhead.delayTicks ?? 0)
              )
                continue;
              applyDamageWarhead(
                kernel,
                definitions,
                weapon,
                warhead,
                {
                  force: world.get(id, PendingImpact, "force"),
                  damageBonus: world.get(id, PendingImpact, "damageBonus"),
                  direct: world.get(id, PendingImpact, "direct"),
                  x: world.get(id, PendingImpact, "x"),
                  y: world.get(id, PendingImpact, "y"),
                  fromX: world.get(id, PendingImpact, "fromX"),
                  fromY: world.get(id, PendingImpact, "fromY"),
                  air: world.get(id, PendingImpact, "air") === 1,
                  maxLevel: world.get(id, PendingImpact, "ceiling"),
                  ...(world.get(id, PendingImpact, "tick") === kernel.tick &&
                    !warhead.delayTicks && {
                      geometry: impactGeometry.get(id),
                    }),
                },
                friendlyFire,
              );
              remaining = (remaining & ~bit) >>> 0;
            }
            if (remaining) world.set(id, PendingImpact, "remaining", remaining);
            else world.destroy(id);
          }
        },
      ],
      destruction: [
        () => {
          const dead = world
            .query(Template, Transform, OwnerForce, Health)
            .filter(
              (id) =>
                world.get(id, Health, "current") === 0 &&
                (definitions[world.get(id, Template, "definition")]?.health ?? 0) > 0,
            );
          for (const id of dead) {
            emitCombatEvent(kernel, {
              type: "death",
              entity: id,
              ...combatPoint(kernel, definitions, id),
              force: world.get(id, OwnerForce, "force"),
            });
            kernel.movement?.cancel(id);
            for (const actor of world.query(AttackOrder))
              if (world.get(actor, AttackOrder, "target") === id) clearAttackOrder(kernel, actor);
            for (const state of world.query(WeaponState))
              if (world.get(state, WeaponState, "shooter") === id) world.destroy(state);
            for (const projectile of world.query(Projectile))
              if (world.get(projectile, Projectile, "target") === id)
                world.set(projectile, Projectile, "target", 0);
            for (const pending of world.query(PendingImpact))
              if (world.get(pending, PendingImpact, "direct") === id)
                world.set(pending, PendingImpact, "direct", 0);
            world.destroy(id);
          }
          if (dead.length) kernel.movement?.refreshOccupancy();
        },
      ],
    },
  });
  // Economy may spawn rally-moving units; capture before the first movement system.
  kernel.systems.movement.unshift(() => {
    for (const id of world.query(Template, Transform, Health)) {
      const point = { x: world.get(id, Transform, "x"), y: world.get(id, Transform, "y") };
      if (world.has(id, CombatMotion)) {
        world.set(id, CombatMotion, "x", point.x);
        world.set(id, CombatMotion, "y", point.y);
      } else world.add(id, CombatMotion, point);
    }
  });
  kernel.canLaunch = (definition, weapon) =>
    supported(weaponOf(definition, weapon)) &&
    world.query(Projectile).length +
      world.query(PendingImpact).length +
      world.query(ShotIntent).length <
      MAX_ACTIVE_ROUNDS;
}
