import type { Component } from "../../ecs";
import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { Template, Transform } from "../entities";
import { CombatMotion, MAX_ACTIVE_ROUNDS, PendingImpact, Projectile } from "../projectiles";
import { AreaReveal, MAX_AREA_REVEALS } from "../vision/reveal";
import { AttackMoveOrder, AttackOrder, HoldPosition, ShotIntent, WeaponState } from ".";
import { Burning } from "./burn";
import { Disabled } from "./disable";
import { GroundFire, MAX_GROUND_FIRES } from "./ground-fire";
import { Slowed } from "./slow";

export function validateCombatState(context: CanonicalValidation): void {
  const { world, rows, has, actor, forces, kernel, point, setup } = context;
  const reference = (id: number) => id === 0 || world.wasAllocated(id);
  const weapons = setup.definitions.flatMap((definition) => definition.weapons ?? []);
  const warheads = weapons.flatMap((weapon) => weapon.warheads);
  const duration = (type: string) =>
    warheads.reduce(
      (maximum, warhead) =>
        warhead.type === type ? Math.max(maximum, warhead.durationTicks ?? 0) : maximum,
      0,
    );
  const deadline = (ticks: number) => Math.min(0xffffffff, kernel.tick + ticks);
  const weaponOf = (id: number, component: Component) => {
    check(
      !has(id, Template) && forces.has(world.get(id, component, "force")),
      `${component.name} ${id} has an invalid kind or Force`,
    );
    const definition = context.definition(world.get(id, component, "definition"));
    const weapon = definition.weapons?.[world.get(id, component, "weapon")];
    check(weapon, `${component.name} ${id} references an unknown weapon`);
    return weapon;
  };
  for (const id of rows(AttackOrder)) {
    actor(id);
    check(
      world.wasAllocated(world.get(id, AttackOrder, "target")) &&
        world.get(id, AttackOrder, "planned") <= 2,
      `attack order ${id} is invalid`,
    );
    for (const field of ["x", "y"] as const) {
      const value = world.get(id, AttackOrder, field);
      check(value >= 0 && value < 1 << 19, `attack order ${id} has invalid target coordinates`);
    }
  }
  for (const id of rows(AttackMoveOrder)) {
    actor(id);
    check(world.get(id, AttackMoveOrder, "paused") <= 1, `attack-move order ${id} is invalid`);
    for (const field of ["x", "y"] as const) {
      const value = world.get(id, AttackMoveOrder, field);
      check(value >= 0 && value < 1 << 19, `attack-move order ${id} exceeds command coordinates`);
    }
  }
  for (const id of rows(HoldPosition)) actor(id);
  const clocks = new Set<string>();
  for (const id of rows(WeaponState)) {
    const shooter = world.get(id, WeaponState, "shooter"),
      index = world.get(id, WeaponState, "weapon"),
      key = `${shooter}:${index}`;
    check(
      !has(id, Template) && world.wasAllocated(shooter) && !clocks.has(key),
      `weapon clock ${id} has an invalid or duplicate shooter`,
    );
    clocks.add(key);
    check(
      reference(world.get(id, WeaponState, "target")),
      `weapon clock ${id} names a future target`,
    );
    let burst = 20,
      reload = weapons.reduce((maximum, weapon) => Math.max(maximum, weapon.reloadTicks, 1), 0),
      delay = weapons.reduce(
        (maximum, weapon) => Math.max(maximum, weapon.burst?.delayTicks ?? 0),
        0,
      );
    if (world.isAlive(shooter)) {
      const weapon = actor(shooter).weapons?.[index];
      check(weapon, `weapon clock ${id} has an unknown weapon`);
      burst = weapon.burst?.count ?? 1;
      reload = Math.max(1, weapon.reloadTicks);
      delay = weapon.burst?.delayTicks ?? 0;
    }
    check(world.get(id, WeaponState, "remaining") <= burst, `weapon clock ${id} exceeds its burst`);
    check(
      world.get(id, WeaponState, "reloadAt") <= deadline(reload) &&
        world.get(id, WeaponState, "nextShot") <= deadline(delay),
      `weapon clock ${id} exceeds its authored deadline`,
    );
  }
  check(rows(ShotIntent).length === 0, "shot handoffs must finish before a tick-boundary capture");
  for (const id of rows(CombatMotion)) {
    actor(id);
    check(
      has(id, Transform) &&
        point(world.get(id, CombatMotion, "x"), world.get(id, CombatMotion, "y")),
      `combat motion ${id} has an invalid pose`,
    );
  }
  const projectiles = rows(Projectile),
    impacts = rows(PendingImpact);
  check(
    projectiles.length + impacts.length <= MAX_ACTIVE_ROUNDS,
    "active rounds exceed their shared cap",
  );
  for (const id of projectiles) {
    const weapon = weaponOf(id, Projectile),
      flight = weapon.projectile;
    check(
      flight.kind === "bullet" || flight.kind === "missile",
      `projectile ${id} has a non-flight weapon`,
    );
    const bonus = world.get(id, Projectile, "damageBonus");
    check(bonus >= -1000 && bonus <= 1000, `projectile ${id} has an invalid damage bonus`);
    check(
      reference(world.get(id, Projectile, "source")) &&
        world.wasAllocated(world.get(id, Projectile, "shooter")) &&
        reference(world.get(id, Projectile, "target")),
      `projectile ${id} names a future actor`,
    );
    const phase = world.get(id, Projectile, "phase"),
      life = world.get(id, Projectile, "life");
    check(
      phase <= 1 &&
        world.get(id, Projectile, "air") <= 1 &&
        life > 0 &&
        world.get(id, Projectile, "age") <= life,
      `projectile ${id} has an invalid lifecycle`,
    );
    check(
      world.get(id, Projectile, "born") <= kernel.tick &&
        point(world.get(id, Projectile, "x"), world.get(id, Projectile, "y")),
      `projectile ${id} has an invalid birth or pose`,
    );
    check(
      flight.flightTicks === undefined || life === flight.flightTicks,
      `projectile ${id} changed its flight duration`,
    );
    const speed = world.get(id, Projectile, "speed");
    check(
      flight.speedSubcellsPerTick &&
        speed <= flight.speedSubcellsPerTick &&
        (flight.kind === "missile" || speed === flight.speedSubcellsPerTick),
      `projectile ${id} changed its speed`,
    );
    for (const field of ["velocityX", "velocityY"] as const)
      check(
        Math.abs(world.get(id, Projectile, field)) <= flight.speedSubcellsPerTick,
        `projectile ${id} exceeds its authored velocity`,
      );
    const due = world.get(id, Projectile, "fuseDue");
    check(
      phase === 0 ? due === 0 : !!flight.fuseTicks && due <= kernel.tick + flight.fuseTicks,
      `projectile ${id} has an invalid fuse`,
    );
  }
  for (const id of impacts) {
    const weapon = weaponOf(id, PendingImpact);
    const bonus = world.get(id, PendingImpact, "damageBonus");
    check(bonus >= -1000 && bonus <= 1000, `impact ${id} has an invalid damage bonus`);
    check(
      reference(world.get(id, PendingImpact, "source")) &&
        world.wasAllocated(world.get(id, PendingImpact, "shooter")) &&
        reference(world.get(id, PendingImpact, "direct")),
      `impact ${id} names a future actor`,
    );
    const mask = world.get(id, PendingImpact, "remaining"),
      allowed = 0xffffffff >>> (32 - weapon.warheads.length);
    check(
      mask !== 0 && (mask & ~allowed) === 0 && world.get(id, PendingImpact, "air") <= 1,
      `impact ${id} has an invalid warhead mask or air flag`,
    );
    check(
      world.get(id, PendingImpact, "tick") <= kernel.tick + (weapon.projectile.fuseTicks ?? 0) &&
        point(world.get(id, PendingImpact, "x"), world.get(id, PendingImpact, "y")),
      `impact ${id} has an invalid delay or pose`,
    );
  }
  for (const id of rows(Disabled)) {
    const definition = actor(id);
    let maximum = 0;
    for (const warhead of warheads) {
      if (warhead.type !== "disable") continue;
      let numerator = BigInt(warhead.durationTicks ?? 0),
        denominator = 1n;
      for (const tag of [...new Set(warhead.tags)].sort()) {
        numerator *= BigInt(definition.resistPerMille?.[tag] ?? 1000);
        denominator *= 1000n;
      }
      maximum = Math.max(maximum, Number(numerator / denominator));
    }
    check(
      (definition.footprint || (definition.domain && definition.domain !== "foot")) &&
        world.get(id, Disabled, "until") >= kernel.tick &&
        world.get(id, Disabled, "until") <= deadline(maximum),
      `disabled actor ${id} is invalid`,
    );
  }
  for (const id of rows(Slowed)) {
    const definition = actor(id),
      strength = world.get(id, Slowed, "strength");
    check(
      definition.domain &&
        definition.domain !== "air" &&
        strength > 0 &&
        strength <= 1000 &&
        world.get(id, Slowed, "until") >= kernel.tick &&
        world.get(id, Slowed, "until") <= deadline(duration("slow")),
      `slowed actor ${id} is invalid`,
    );
  }
  for (const id of rows(Burning)) {
    const definition = actor(id);
    check(
      forces.has(world.get(id, Burning, "force")) &&
        reference(world.get(id, Burning, "source")) &&
        world.get(id, Burning, "until") >= kernel.tick &&
        world.get(id, Burning, "until") <= deadline(duration("burn")),
      `burning actor ${id} has an invalid source or expiry`,
    );
    check(
      world.get(id, Burning, "carry") < 20 &&
        world.get(id, Burning, "remainder") < 20 &&
        world.get(id, Burning, "whole") * 20 + world.get(id, Burning, "remainder") <=
          (kernel.veterancy?.maxHealth(id, definition.health) ?? definition.health) * 20 &&
        (world.get(id, Burning, "whole") > 0 || world.get(id, Burning, "remainder") > 0),
      `burning actor ${id} has invalid work`,
    );
  }
  const fires = rows(GroundFire);
  check(fires.length <= MAX_GROUND_FIRES, "ground fires exceed their cap");
  for (const id of fires) {
    const weapon = weaponOf(id, GroundFire),
      warhead = weapon.warheads[world.get(id, GroundFire, "warhead")];
    check(
      warhead?.type === "burn" &&
        warhead.radiusSubcells &&
        warhead.durationTicks &&
        warhead.amountPerSecond,
      `ground fire ${id} has no area burn warhead`,
    );
    check(
      reference(world.get(id, GroundFire, "source")) &&
        world.get(id, GroundFire, "friendlyFire") <= 1 &&
        world.get(id, GroundFire, "until") >= kernel.tick &&
        world.get(id, GroundFire, "until") <= deadline(warhead.durationTicks) &&
        point(world.get(id, GroundFire, "x"), world.get(id, GroundFire, "y")),
      `ground fire ${id} has invalid source, flags, expiry or pose`,
    );
  }
  const reveals = rows(AreaReveal);
  check(reveals.length <= MAX_AREA_REVEALS, "area reveals exceed their cap");
  for (const id of reveals) {
    const from = world.get(id, AreaReveal, "from"),
      until = world.get(id, AreaReveal, "until"),
      radius = world.get(id, AreaReveal, "radius");
    check(
      !has(id, Template) &&
        forces.has(world.get(id, AreaReveal, "force")) &&
        point(world.get(id, AreaReveal, "x"), world.get(id, AreaReveal, "y")),
      `area reveal ${id} has an invalid owner or pose`,
    );
    check(
      radius > 0 &&
        radius <= (setup.map.terrain.width + setup.map.terrain.height) * 1024 &&
        from <= kernel.tick + 1 &&
        until > from &&
        until >= kernel.tick,
      `area reveal ${id} has invalid geometry or duration`,
    );
  }
}
