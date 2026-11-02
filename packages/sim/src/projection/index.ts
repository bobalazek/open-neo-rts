// Copied presentation data only. Fog and enemy visibility arrive in phase 2.
import { hasGrant } from "../commands";
import { type BankSnapshot, type PowerSnapshot, StructurePower } from "../features/economy";
import { Health, OwnerForce, Template, Transform } from "../features/entities";
import { MoveIntent } from "../features/movement";
import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";

export type { DebugOverlayData, DebugOverlayOptions } from "./debug";

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
  order: { type: "move" | "attackMove"; x: number; y: number } | null;
  power?: { amount: number; enabled: boolean; powered: boolean };
}
export interface SeatSnapshot {
  tick: number;
  mode: ProjectionMode;
  entities: PresentedEntity[];
  /** Present only for normal matches, with economic grants checked at this tick. */
  banks?: BankSnapshot[];
  power?: PowerSnapshot[];
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
        const inspectPower = kernel.power?.canInspect(seat, force) && world.has(id, StructurePower);
        // shortcut: no enemy vision before phase 2; expose only Forces this seat can command.
        if (
          mode !== "debug-no-fog" &&
          !hasGrant(setup.grants, seat, force, "unit.orders", kernel.tick) &&
          !inspectPower
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
            ? {
                type: world.get(id, MoveIntent, "attackMove") === 1 ? "attackMove" : "move",
                x: world.get(id, MoveIntent, "x"),
                y: world.get(id, MoveIntent, "y"),
              }
            : null,
          ...(kernel.power &&
            inspectPower && {
              power: {
                amount: world.get(id, StructurePower, "amount"),
                enabled: world.get(id, StructurePower, "enabled") === 1,
                powered: kernel.power.powered(id),
              },
            }),
        });
      }
      return {
        tick: kernel.tick,
        mode,
        entities,
        ...(kernel.economy && { banks: kernel.economy.snapshot(seat) }),
        ...(kernel.power && { power: kernel.power.snapshot(seat) }),
      };
    },
    resolve(handle: unknown): number | undefined {
      return typeof handle === "string" ? visible.get(handle) : undefined;
    },
  };
}
