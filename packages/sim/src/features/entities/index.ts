// IDs, lifecycle, owner, health, transform. Phase 1a.
// Entities spawn from the match's definitions table; `debug.spawn`, `debug.setHealth` and `debug.remove` act on them.

import { defineComponent } from "../../ecs";
import type { Feature } from "../../kernel";

const SUBCELLS_PER_CELL = 1024;
const TICKS_PER_SECOND = 20;
const TURN = 0x10000;

/** A spawnable definition in sim units. A match is created with a table of them. */
export interface Definition {
  /** As `debug.spawn` names it: `unit:eastern-collective/dragon-tank`, `core.structure:…`. */
  id: string;
  health: number;
  /** Subcells per tick; 0 can't move. */
  speed: number;
  /** Binary angle units per tick. */
  turnRate: number;
}

/**
 * Converts a unit or structure from content units (cells and degrees per second) to sim units, once, at match
 * setup (numerics.md#content-units). Without a turn rate a unit turns any amount within a tick.
 */
// ponytail: here until the content loader converts units (phase 2); then the loader builds the table.
export function toDefinition(content: {
  id: string;
  health: number;
  movement?: { speed: number; turnRate?: number };
}): Definition {
  const { speed = 0, turnRate = 360 * TICKS_PER_SECOND } = content.movement ?? {};
  return {
    id: content.id,
    health: content.health,
    speed: Math.round((speed * SUBCELLS_PER_CELL) / TICKS_PER_SECOND),
    turnRate: Math.round((turnRate * TURN) / (360 * TICKS_PER_SECOND)),
  };
}

/** Index of the entity's definition in the match's table. */
export const Template = defineComponent("Template", { definition: "u32" });
export const OwnerForce = defineComponent("OwnerForce", { force: "u32" });
/** Position in subcells; facing in binary angle units, 0 along +x, a quarter turn along +y. */
export const Transform = defineComponent("Transform", { x: "i32", y: "i32", facing: "u16" });
export const Health = defineComponent("Health", { current: "u32" });

/** Spawning and removal for a match created with `definitions`. */
export function entitiesFeature(definitions: readonly Definition[]): Feature {
  return {
    components: [Template, OwnerForce, Transform, Health],
    handlers: {
      "debug.spawn": ({ world }, { payload: { definition, force, x, y, facing } }) => {
        const index = definitions.findIndex((d) => d.id === definition);
        const found = definitions[index];
        if (!found) return "bad_payload";
        // ponytail: no placement rules on the flat grid; check construction's checkPlacement once maps load.
        const id = world.create();
        world.add(id, Template, { definition: index });
        world.add(id, OwnerForce, { force });
        world.add(id, Transform, { x, y, facing });
        world.add(id, Health, { current: found.health });
      },
      "debug.setHealth": ({ world }, { payload: { entity, health } }) => {
        if (!world.isAlive(entity) || !world.has(entity, Health)) return "bad_payload";
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
