import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { Definition } from "../entities";
import type { GameplayWarhead } from "../entities/weapons";

/** The deadline is exclusive. Repeated hits refresh, never add durations together. */
export const Disabled = defineComponent("Disabled", { until: "u32" });

export function initializeDisable(kernel: Kernel, definitions: readonly Definition[]): void {
  if (
    !definitions.some((definition) =>
      definition.weapons?.some((weapon) =>
        weapon.warheads.some((warhead) => warhead.type === "disable"),
      ),
    )
  )
    return;
  kernel.disabled = (entity) =>
    kernel.world.isAlive(entity) &&
    kernel.world.has(entity, Disabled) &&
    kernel.world.get(entity, Disabled, "until") > kernel.tick;
  register(kernel, {
    components: [Disabled],
    systems: {
      validation: [
        (kernel) => {
          for (const entity of kernel.world.query(Disabled))
            if (!kernel.disabled?.(entity)) kernel.world.remove(entity, Disabled);
        },
      ],
    },
  });
}

export function applyDisable(
  kernel: Kernel,
  target: number,
  definition: Definition,
  warhead: GameplayWarhead,
  falloff: number,
): void {
  if (
    !kernel.disabled ||
    (!definition.footprint && (!definition.domain || definition.domain === "foot"))
  )
    return;
  let duration = BigInt(warhead.durationTicks ?? 0) * BigInt(falloff),
    denominator = 1000n;
  for (const tag of [...new Set(warhead.tags)].sort()) {
    duration *= BigInt(definition.resistPerMille?.[tag] ?? 1000);
    denominator *= 1000n;
  }
  const ticks = Number(duration / denominator);
  if (!ticks) return;
  const { world } = kernel;
  const until = Math.min(0xffffffff, kernel.tick + ticks);
  if (!world.has(target, Disabled)) world.add(target, Disabled, { until });
  else world.set(target, Disabled, "until", Math.max(until, world.get(target, Disabled, "until")));
}
