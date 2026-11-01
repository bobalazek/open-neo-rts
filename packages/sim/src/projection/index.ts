// Copied presentation data only. Fog and enemy visibility arrive in phase 2.
import { hasGrant } from "../commands";
import { Health, OwnerForce, Template, Transform } from "../features/entities";
import { MoveIntent } from "../features/movement";
import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";

export type ProjectionMode = "controlled" | "debug-no-fog";
export interface PresentedEntity {
  handle: string;
  definition: string;
  force: number;
  x: number;
  y: number;
  facing: number;
  health: number;
  maxHealth: number;
  order: { type: "move"; x: number; y: number } | null;
}
export interface SeatSnapshot {
  tick: number;
  mode: ProjectionMode;
  entities: PresentedEntity[];
}

/** Per-seat handles never contain ECS IDs. Keep this object inside the authoritative host. */
export function createProjection(setup: MatchSetup, seat: number, mode: ProjectionMode) {
  if (!setup.seats.includes(seat)) throw new Error("Unknown player seat");
  if (mode === "debug-no-fog" && !setup.debug) throw new Error("No-fog requires debug mode");
  const handles = new Map<number, string>();
  let nextHandle = 1;
  let visible = new Map<string, number>();
  return {
    snapshot(kernel: Kernel): SeatSnapshot {
      visible = new Map();
      const entities: PresentedEntity[] = [];
      for (const id of kernel.world.query(Template, OwnerForce, Transform, Health)) {
        const world = kernel.world;
        const force = world.get(id, OwnerForce, "force");
        // shortcut: no enemy vision before phase 2; expose only Forces this seat can command.
        if (
          mode !== "debug-no-fog" &&
          !hasGrant(setup.grants, seat, force, "unit.orders", kernel.tick)
        )
          continue;
        let handle = handles.get(id);
        if (!handle) {
          handle = `e${nextHandle++}`;
          handles.set(id, handle);
        }
        visible.set(handle, id);
        const definition = setup.definitions[world.get(id, Template, "definition")];
        if (!definition) throw new Error("Entity has no definition");
        entities.push({
          handle,
          definition: definition.id,
          force,
          x: world.get(id, Transform, "x"),
          y: world.get(id, Transform, "y"),
          facing: world.get(id, Transform, "facing"),
          health: world.get(id, Health, "current"),
          maxHealth: definition.health,
          order: world.has(id, MoveIntent)
            ? { type: "move", x: world.get(id, MoveIntent, "x"), y: world.get(id, MoveIntent, "y") }
            : null,
        });
      }
      return { tick: kernel.tick, mode, entities };
    },
    resolve(handle: unknown): number | undefined {
      return typeof handle === "string" ? visible.get(handle) : undefined;
    },
  };
}
