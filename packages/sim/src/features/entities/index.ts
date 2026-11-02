// IDs, lifecycle, owner, health, transform. Phase 1a.
// Entities spawn from the match's definitions table; `debug.spawn`, `debug.setHealth` and `debug.remove` act on them.

import type { DebugSpawn } from "../../commands";
import { defineComponent } from "../../ecs";
import type { Feature, Kernel } from "../../kernel";

import type { Definition } from "./definitions";
import { checkSpawnPlacement } from "./placement";

export * from "./content";
export * from "./definitions";
export {
  debugSpawnPlacement,
  type SpawnCell,
  type SpawnPlacement,
  type SpawnPlacementFailure,
} from "./placement";

/** Index of the entity's definition in the match's table. */
export const Template = defineComponent("Template", { definition: "u32" });
export const OwnerForce = defineComponent("OwnerForce", { force: "u32" });
/** Position in subcells; facing in binary angle units, 0 along +x, a quarter turn along +y. */
export const Transform = defineComponent("Transform", { x: "i32", y: "i32", facing: "u16" });
export const Health = defineComponent("Health", { current: "u32" });

/** Shared allocation after the caller validates definition, ownership and placement. */
export function spawnEntity(
  kernel: Kernel,
  index: number,
  definition: Definition,
  { force, x, y, facing }: DebugSpawn,
): number {
  const { world } = kernel;
  const id = world.create();
  world.add(id, Template, { definition: index });
  world.add(id, OwnerForce, { force });
  world.add(id, Transform, { x, y, facing });
  world.add(id, Health, { current: definition.health });
  kernel.power?.attach(id, definition);
  return id;
}

/** Spawning and removal for a match created with `definitions`. */
export function entitiesFeature(
  definitions: readonly Definition[],
  forces?: readonly number[],
): Feature {
  return {
    components: [Template, OwnerForce, Transform, Health],
    handlers: {
      "debug.spawn": (kernel, { payload }) => {
        const { definition, force } = payload;
        if (forces && !forces.includes(force)) return "bad_payload";
        const index = definitions.findIndex((d) => d.id === definition);
        const found = definitions[index];
        if (!found) return "bad_payload";
        if (kernel.map && !checkSpawnPlacement(kernel, definitions, payload).ok)
          return "placement_failed";
        spawnEntity(kernel, index, found, payload);
      },
      "debug.setHealth": ({ world }, { payload: { entity, health } }) => {
        if (!world.isAlive(entity) || !world.has(entity, Health)) return "bad_payload";
        const definition = definitions[world.get(entity, Template, "definition")];
        if (definition?.health === 0) return "bad_payload";
        // ponytail: health 0 deletes until salvage (phase 3) leaves wrecks.
        if (health === 0) world.destroy(entity);
        else world.set(entity, Health, "current", health);
      },
      "debug.remove": ({ world }, { payload: { entity } }) => {
        if (!world.isAlive(entity)) return "bad_payload";
        world.destroy(entity);
      },
    },
  };
}
