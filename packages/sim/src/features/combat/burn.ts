import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import { combatPoint } from "../../physics/fire-line";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import type { GameplayWarhead } from "../entities/weapons";
import { emitCombatEvent } from "../events/combat";
import { warheadDamage } from "./damage";

export const Burning = defineComponent("Burning", {
  source: "u32",
  force: "u32",
  until: "u32",
  whole: "u32",
  remainder: "u8",
  carry: "u8",
});

export function initializeBurn(kernel: Kernel, definitions: readonly Definition[]): void {
  if (
    !definitions.some((definition) =>
      definition.weapons?.some((weapon) =>
        weapon.warheads.some((warhead) => warhead.type === "burn"),
      ),
    )
  )
    return;
  const { world } = kernel;
  kernel.burning = (entity) =>
    world.isAlive(entity) &&
    world.has(entity, Burning) &&
    world.get(entity, Burning, "until") > kernel.tick;
  register(kernel, {
    components: [Burning],
    systems: {
      validation: [
        () => {
          for (const id of world.query(Burning))
            if (!kernel.burning?.(id)) world.remove(id, Burning);
        },
      ],
      combat: [
        () => {
          for (const id of world.query(Burning, Health, OwnerForce, Template)) {
            if (!kernel.burning?.(id) || world.get(id, Health, "current") === 0) continue;
            const progress = world.get(id, Burning, "carry") + world.get(id, Burning, "remainder");
            const amount = Math.min(
              world.get(id, Health, "current"),
              world.get(id, Burning, "whole") + Math.floor(progress / 20),
            );
            world.set(id, Burning, "carry", progress % 20);
            if (!amount) continue;
            world.set(id, Health, "current", world.get(id, Health, "current") - amount);
            kernel.veterancy?.damage(
              world.get(id, Burning, "source"),
              id,
              world.get(id, Burning, "force"),
              amount,
            );
            const force = world.get(id, OwnerForce, "force");
            kernel.statistics?.damage(
              world.get(id, Burning, "force"),
              force,
              world.get(id, Template, "definition"),
              amount,
              world.get(id, Health, "current") === 0,
            );
            if (world.has(id, Transform))
              emitCombatEvent(kernel, {
                type: "damage",
                entity: id,
                force,
                amount,
                ...combatPoint(kernel, definitions, id),
              });
          }
        },
      ],
    },
  });
}

export function applyBurn(
  kernel: Kernel,
  target: number,
  definition: Definition,
  warhead: GameplayWarhead,
  falloff: number,
  force: number,
  bonus: number,
  source = 0,
): void {
  if (!kernel.burning || !warhead.durationTicks || !warhead.amountPerSecond) return;
  // Snapshot the impact's effective rate; splitting whole/fraction avoids overflowing a u32 DPS field.
  const rate = Math.min(
    (kernel.veterancy?.maxHealth(target, definition.health) ?? definition.health) * 20,
    warheadDamage(
      { ...warhead, amount: warhead.amountPerSecond },
      definition,
      falloff,
      1000,
      bonus,
      kernel.unitModes?.armor(target) ?? 1000,
    ),
  );
  if (!rate) return;
  const { world } = kernel;
  const until = Math.min(0xffffffff, kernel.tick + warhead.durationTicks);
  const whole = Math.floor(rate / 20),
    remainder = rate % 20;
  // shortcut: one strongest burn per actor; add independent sources if authored stacking is required.
  if (kernel.burning(target)) {
    const previous =
      world.get(target, Burning, "whole") * 20 + world.get(target, Burning, "remainder");
    if (rate < previous) return;
    if (rate === previous) {
      world.set(target, Burning, "until", Math.max(until, world.get(target, Burning, "until")));
      return;
    }
    world.set(target, Burning, "force", force);
    world.set(target, Burning, "source", source);
    world.set(target, Burning, "until", until);
    world.set(target, Burning, "whole", whole);
    world.set(target, Burning, "remainder", remainder);
  } else {
    if (world.has(target, Burning)) world.remove(target, Burning);
    world.add(target, Burning, { source, force, until, whole, remainder, carry: 0 });
  }
}
