// Copied presentation data only. Fog and enemy visibility arrive in phase 2.
import { hasGrant } from "../commands";
import {
  CONSTRUCTION_REFUSALS,
  CONSTRUCTION_WORK_STATES,
  ConstructionApproach,
  ConstructionProgress,
  ConstructionRequest,
  ConstructionSite,
} from "../features/construction";
import {
  type BankSnapshot,
  type ExtractionSnapshot,
  type PowerSnapshot,
  StructurePower,
} from "../features/economy";
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
  extraction?: ExtractionSnapshot;
  constructionSite?: true;
  construction?: {
    completedTicks: number;
    quarter: number;
    totalTicks: number;
    buildersWorking: number;
  };
  constructionOrder?: { site: string; state: (typeof CONSTRUCTION_WORK_STATES)[number] };
}
export interface PresentedConstructionRequest {
  handle: string;
  definition: string;
  force: number;
  x: number;
  y: number;
  facing: number;
  status: "clearing" | "refused";
  reason?: (typeof CONSTRUCTION_REFUSALS)[number];
}
export interface SeatSnapshot {
  tick: number;
  mode: ProjectionMode;
  entities: PresentedEntity[];
  /** Present only for normal matches, with economic grants checked at this tick. */
  banks?: BankSnapshot[];
  power?: PowerSnapshot[];
  constructionRequests?: PresentedConstructionRequest[];
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
      for (const id of handles.keys()) if (!kernel.world.isAlive(id)) handles.delete(id);
      const handleOf = (id: number) => {
        let handle = handles.get(id);
        if (!handle) {
          handle = `e${nextHandle++}`;
          handles.set(id, handle);
        }
        visible.set(handle, id);
        return handle;
      };
      const entities: PresentedEntity[] = [];
      for (const id of kernel.world.query(Template, OwnerForce, Transform, Health)) {
        const world = kernel.world;
        const force = world.get(id, OwnerForce, "force");
        const inspectPower = kernel.power?.canInspect(seat, force) && world.has(id, StructurePower);
        const site = !!setup.normal && world.has(id, ConstructionSite);
        const inspectSite =
          site && hasGrant(setup.grants, seat, force, "economy.build", kernel.tick);
        const definition = setup.definitions[world.get(id, Template, "definition")];
        if (!definition) throw new Error("Entity has no definition");
        const inspectBuilder =
          !!setup.normal &&
          definition.role === "builder" &&
          hasGrant(setup.grants, seat, force, "economy.build", kernel.tick);
        // shortcut: no enemy vision before phase 2; expose only Forces this seat can command.
        if (
          mode !== "debug-no-fog" &&
          !hasGrant(setup.grants, seat, force, "unit.orders", kernel.tick) &&
          !inspectPower &&
          !inspectSite &&
          !inspectBuilder
        )
          continue;
        const handle = handleOf(id);
        const approachSite =
          setup.normal && world.has(id, ConstructionApproach)
            ? world.get(id, ConstructionApproach, "site")
            : 0;
        entities.push({
          handle,
          definition: definition.id,
          force,
          x: world.get(id, Transform, "x"),
          y: world.get(id, Transform, "y"),
          facing: world.get(id, Transform, "facing"),
          health: world.get(id, Health, "current"),
          maxHealth: definition.health,
          ...(site && { constructionSite: true }),
          ...(site &&
            world.has(id, ConstructionProgress) && {
              construction: {
                completedTicks: world.get(id, ConstructionProgress, "completedTicks"),
                quarter: world.get(id, ConstructionProgress, "quarter"),
                totalTicks: definition.construction?.buildTicks as number,
                buildersWorking: world.get(id, ConstructionProgress, "buildersWorking"),
              },
            }),
          ...(approachSite &&
            world.isAlive(approachSite) &&
            world.has(approachSite, ConstructionSite) && {
              constructionOrder: {
                site: handleOf(approachSite),
                state: CONSTRUCTION_WORK_STATES[
                  world.get(id, ConstructionApproach, "state")
                ] as (typeof CONSTRUCTION_WORK_STATES)[number],
              },
            }),
          ...(inspectPower &&
            kernel.extraction?.snapshot(id) && { extraction: kernel.extraction.snapshot(id) }),
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
      const constructionRequests: PresentedConstructionRequest[] = [];
      if (setup.normal)
        for (const id of kernel.world.query(ConstructionRequest)) {
          const world = kernel.world,
            force = world.get(id, ConstructionRequest, "force");
          if (!hasGrant(setup.grants, seat, force, "economy.build", kernel.tick)) continue;
          const refused = world.get(id, ConstructionRequest, "status") === 1;
          constructionRequests.push({
            handle: handleOf(id),
            definition: setup.definitions[world.get(id, ConstructionRequest, "definition")]
              ?.id as string,
            force,
            x: world.get(id, ConstructionRequest, "x"),
            y: world.get(id, ConstructionRequest, "y"),
            facing: world.get(id, ConstructionRequest, "facing"),
            status: refused ? "refused" : "clearing",
            ...(refused && {
              reason: CONSTRUCTION_REFUSALS[world.get(id, ConstructionRequest, "reason")],
            }),
          });
        }
      return {
        tick: kernel.tick,
        mode,
        entities,
        ...(kernel.economy && { banks: kernel.economy.snapshot(seat) }),
        ...(kernel.power && { power: kernel.power.snapshot(seat) }),
        ...(setup.normal && { constructionRequests }),
      };
    },
    resolve(handle: unknown): number | undefined {
      return typeof handle === "string" ? visible.get(handle) : undefined;
    },
  };
}
