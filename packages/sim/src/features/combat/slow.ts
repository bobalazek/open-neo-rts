import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { Definition } from "../entities";
import type { GameplayWarhead } from "../entities/weapons";

export const Slowed = defineComponent("Slowed", { until: "u32", strength: "u16" });

export function initializeSlow(kernel: Kernel, definitions: readonly Definition[]): void {
  if (
    !definitions.some((definition) =>
      definition.weapons?.some((weapon) =>
        weapon.warheads.some((warhead) => warhead.type === "slow"),
      ),
    )
  )
    return;
  const { world } = kernel;
  kernel.slowPerMille = (entity) =>
    world.isAlive(entity) &&
    world.has(entity, Slowed) &&
    world.get(entity, Slowed, "until") > kernel.tick
      ? world.get(entity, Slowed, "strength")
      : 0;
  register(kernel, {
    components: [Slowed],
    systems: {
      validation: [
        () => {
          for (const id of world.query(Slowed))
            if (!kernel.slowPerMille?.(id)) world.remove(id, Slowed);
        },
      ],
    },
  });
}

export function applySlow(
  kernel: Kernel,
  target: number,
  definition: Definition,
  warhead: GameplayWarhead,
  falloff: number,
): void {
  if (
    !kernel.slowPerMille ||
    !definition.speed ||
    definition.footprint ||
    !warhead.durationTicks ||
    !warhead.perMille
  )
    return;
  let numerator = BigInt(warhead.perMille) * BigInt(falloff),
    denominator = 1000n;
  for (const tag of [...new Set(warhead.tags)].sort()) {
    numerator *= BigInt(definition.resistPerMille?.[tag] ?? 1000);
    denominator *= 1000n;
  }
  const strength = Math.min(1000, Number(numerator / denominator));
  if (!strength) return;
  const { world } = kernel;
  const until = Math.min(0xffffffff, kernel.tick + warhead.durationTicks);
  // shortcut: one strongest slow per actor; add independent sources when content requires stacking.
  if (kernel.slowPerMille(target)) {
    const previous = world.get(target, Slowed, "strength");
    if (strength < previous) return;
    if (strength === previous) {
      world.set(target, Slowed, "until", Math.max(until, world.get(target, Slowed, "until")));
      return;
    }
    world.set(target, Slowed, "strength", strength);
    world.set(target, Slowed, "until", until);
  } else {
    if (world.has(target, Slowed)) world.remove(target, Slowed);
    world.add(target, Slowed, { until, strength });
  }
}
