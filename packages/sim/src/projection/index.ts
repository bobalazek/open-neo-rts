// Seat-permitted copied state. Canonical fog and structure memory live in the vision feature.
import { arr, int, validate } from "@open-neo-rts/content";
import { hasGrant, type Scope } from "../commands";
import { AttackOrder } from "../features/combat";
import {
  CONSTRUCTION_REFUSALS,
  CONSTRUCTION_WORK_STATES,
  ConstructionApproach,
  ConstructionProgress,
  ConstructionRequest,
  ConstructionSite,
} from "../features/construction";
import {
  REPAIR_STATES,
  RepairCredit,
  RepairOrder,
  RepairWork,
} from "../features/construction/repair";
import {
  type BankSnapshot,
  type ExtractionSnapshot,
  Harvester,
  type HarvestSnapshot,
  harvestSnapshot,
  type PowerSnapshot,
  StructurePower,
} from "../features/economy";
import { Health, OwnerForce, Template, Transform } from "../features/entities";
import { type PresentedCombatEvent, projectCombatEvents } from "../features/events/combat";
import { MoveIntent } from "../features/movement";
import { PRODUCTION_STATUSES, ProductionItem, ProductionRally } from "../features/production";
import type { VisionGrid } from "../features/vision";
import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";
import { resourceNodeOrigin } from "../match-map";
import { strictObject } from "../snapshots/schema";

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
  harvesting?: HarvestSnapshot;
  constructionSite?: true;
  construction?: {
    completedTicks: number;
    quarter: number;
    totalTicks: number;
    buildersWorking: number;
  };
  constructionOrder?: { site: string; state: (typeof CONSTRUCTION_WORK_STATES)[number] };
  repairOrder?: { target: string; state: (typeof REPAIR_STATES)[number]; workRemainder: number };
  repair?: { creditCarry: number; repairersWorking: number };
  production?: {
    slots: number;
    queue: {
      handle: string;
      definition: string;
      slot: number | null;
      state: (typeof PRODUCTION_STATUSES)[number];
      completedTicks: number;
      remainder: number;
      totalTicks: number;
      gift: boolean;
    }[];
    rally: { x: number; y: number } | null;
  };
  attackTarget?: string;
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
  fog?: VisionGrid[];
  ghosts?: PresentedGhost[];
  combatEvents?: PresentedCombatEvent[];
  /** Static node origins discovered through permitted canonical exploration; no stock/claims. */
  resourceNodes?: { kind: "materials" | "oil"; x: number; y: number }[];
}

export interface PresentedGhost {
  handle: string;
  group: number;
  definition: string;
  force: number;
  x: number;
  y: number;
  facing: number;
  health: number;
  maxHealth: number;
  seen: number;
  constructionSite?: true;
}

/** Trusted host save state only: these authoritative IDs never enter seat snapshots. */
export interface ProjectionState {
  format: 1;
  nextHandle: number;
  nextGhost: number;
  handles: number[][];
  ghostHandles: number[][];
}
export type SeatProjection = ReturnType<typeof createProjection>;
const HANDLE_MAX = 0xfffffffe;

/** Per-seat handles never contain ECS IDs. Keep this object inside the authoritative host. */
export function createProjection(setup: MatchSetup, seat: number, mode: ProjectionMode) {
  if (!setup.seats.includes(seat)) throw new Error("Unknown player seat");
  if (mode === "debug-no-fog" && !setup.debug) throw new Error("No-fog requires debug mode");
  const handles = new Map<number, string>();
  let nextHandle = 1;
  let visible = new Map<string, number>();
  const ghostHandles = new Map<number, string>();
  let nextGhost = 1;
  const roundHandles = new Map<number, string>();
  let nextRound = 1;
  const deathHandles = new Map<number, { handle: string; tick: number }>();
  let current: Kernel | undefined;
  return {
    snapshot(kernel: Kernel): SeatSnapshot {
      current = kernel;
      const previousHandles = new Map([...handles].filter(([, handle]) => visible.has(handle)));
      for (const [entity, remembered] of deathHandles)
        if (remembered.tick !== kernel.tick) deathHandles.delete(entity);
      visible = new Map();
      const permits = (force: number, scope: Scope) =>
        kernel.visibility
          ? kernel.visibility.permits(seat, force, scope)
          : hasGrant(setup.grants, seat, force, scope, kernel.tick);
      const inspectEconomy = (force: number) =>
        (["economy.build", "economy.transfer", "production.queue", "research.spend"] as const).some(
          (scope) => permits(force, scope),
        );
      for (const id of handles.keys()) if (!kernel.world.isAlive(id)) handles.delete(id);
      const handleOf = (id: number) => {
        let handle = handles.get(id);
        if (!handle) {
          if (nextHandle > HANDLE_MAX) throw new Error("Projection handles exhausted");
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
        const inspectPower =
          inspectEconomy(force) &&
          kernel.power?.canInspect(seat, force) &&
          world.has(id, StructurePower);
        const site = !!setup.normal && world.has(id, ConstructionSite);
        const inspectSite = site && permits(force, "economy.build");
        const definition = setup.definitions[world.get(id, Template, "definition")];
        if (!definition) throw new Error("Entity has no definition");
        const inspectBuilder =
          !!setup.normal && definition.role === "builder" && permits(force, "economy.build");
        const inspectRepair =
          !!setup.normal &&
          (definition.role === "builder" ||
            definition.id.split(":")[0]?.split(".").at(-1) === "structure") &&
          permits(force, "economy.build");
        const inspectHarvester =
          !!setup.normal && world.has(id, Harvester) && inspectEconomy(force);
        const inspectProduction =
          !!setup.normal &&
          !!(definition.produces?.length || definition.spawnsWith?.length) &&
          permits(force, "production.queue");
        const controlled = permits(force, "unit.orders");
        if (
          mode !== "debug-no-fog" &&
          !(kernel.visibility
            ? kernel.visibility.canSeeEntity(seat, id)
            : controlled ||
              inspectPower ||
              inspectSite ||
              inspectBuilder ||
              inspectRepair ||
              inspectHarvester ||
              inspectProduction)
        )
          continue;
        const handle = handleOf(id);
        const approachSite =
          inspectBuilder && world.has(id, ConstructionApproach)
            ? world.get(id, ConstructionApproach, "site")
            : 0;
        const attackTarget =
          setup.normal && controlled && world.has(id, AttackOrder)
            ? world.get(id, AttackOrder, "target")
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
          ...(inspectRepair &&
            world.has(id, RepairCredit) && {
              repair: {
                creditCarry: world.get(id, RepairCredit, "carry"),
                repairersWorking: world.get(id, RepairCredit, "working"),
              },
            }),
          ...(inspectRepair &&
            world.has(id, RepairOrder) &&
            world.isAlive(world.get(id, RepairOrder, "target")) && {
              repairOrder: {
                target: handleOf(world.get(id, RepairOrder, "target")),
                state: REPAIR_STATES[
                  world.get(id, RepairOrder, "state")
                ] as (typeof REPAIR_STATES)[number],
                workRemainder: world.get(id, RepairWork, "remainder"),
              },
            }),
          ...(inspectHarvester && { harvesting: harvestSnapshot(kernel, id, definition) }),
          ...(attackTarget &&
            world.isAlive(attackTarget) &&
            kernel.visibility?.canSeeEntity(seat, attackTarget) && {
              attackTarget: handleOf(attackTarget),
            }),
          ...(site && { constructionSite: true }),
          ...(inspectProduction && {
            production: {
              slots: definition.productionSlots ?? 1,
              queue: world
                .query(ProductionItem)
                .filter(
                  (item) =>
                    world.get(item, ProductionItem, "producer") === id &&
                    world.get(item, ProductionItem, "force") === force,
                )
                .map((item) => {
                  const unit = setup.definitions[
                    world.get(item, ProductionItem, "definition")
                  ] as MatchSetup["definitions"][number];
                  return {
                    handle: handleOf(item),
                    definition: unit.id,
                    slot: world.get(item, ProductionItem, "slot") || null,
                    state: PRODUCTION_STATUSES[
                      world.get(item, ProductionItem, "status")
                    ] as (typeof PRODUCTION_STATUSES)[number],
                    completedTicks: world.get(item, ProductionItem, "completedTicks"),
                    remainder: world.get(item, ProductionItem, "remainder"),
                    totalTicks:
                      world.get(item, ProductionItem, "gift") === 1
                        ? 0
                        : (unit.construction?.buildTicks as number),
                    gift: world.get(item, ProductionItem, "gift") === 1,
                  };
                }),
              rally: world.has(id, ProductionRally)
                ? { x: world.get(id, ProductionRally, "x"), y: world.get(id, ProductionRally, "y") }
                : null,
            },
          }),
          ...(inspectSite &&
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
            (!kernel.visibility || kernel.visibility.canSeeEntity(seat, approachSite)) &&
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
          order:
            (mode === "debug-no-fog" || controlled) && world.has(id, MoveIntent)
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
          if (!permits(force, "economy.build")) continue;
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
      const fog: VisionGrid[] = [];
      const ghosts: PresentedGhost[] = [];
      if (mode === "controlled" && kernel.visibility) {
        for (const { force } of kernel.visibility.groupsForSeat(seat)) {
          const grid = kernel.vision?.copyGrid(force);
          if (grid) fog.push(grid);
        }
        const present = new Set(visible.values());
        for (const { group, record } of kernel.visibility.recordsForSeat(seat)) {
          if (present.has(record.entity)) continue;
          const definition = setup.definitions[record.definition];
          if (!definition) throw new Error("Unknown remembered structure definition");
          let handle = ghostHandles.get(record.entity);
          if (!handle) {
            if (nextGhost > HANDLE_MAX) throw new Error("Projection ghost handles exhausted");
            handle = `g${nextGhost++}`;
            ghostHandles.set(record.entity, handle);
          }
          ghosts.push({
            handle,
            group,
            definition: definition.id,
            force: record.force,
            x: record.x,
            y: record.y,
            facing: record.facing,
            health: record.health,
            maxHealth: definition.health,
            seen: record.seen,
            ...(record.site && { constructionSite: true }),
          });
        }
      }
      const published = new Set(visible.values());
      for (const round of roundHandles.keys())
        if (
          !kernel.world.isAlive(round) &&
          !(kernel.combatEvents ?? []).some((event) => event.round === round)
        )
          roundHandles.delete(round);
      for (const id of handles.keys()) if (!published.has(id)) handles.delete(id);
      return {
        tick: kernel.tick,
        mode,
        entities,
        ...(kernel.economy && {
          banks: kernel.economy.snapshot(seat).filter((bank) => inspectEconomy(bank.force)),
        }),
        ...(kernel.power && {
          power: kernel.power.snapshot(seat).filter((power) => inspectEconomy(power.force)),
        }),
        ...(setup.normal && { constructionRequests }),
        ...(setup.normal &&
          mode === "controlled" && {
            combatEvents: projectCombatEvents(
              kernel,
              seat,
              (round) => {
                let handle = roundHandles.get(round);
                if (!handle) {
                  handle = `p${nextRound++}`;
                  roundHandles.set(round, handle);
                }
                return handle;
              },
              (entity, type) => {
                const current = handles.get(entity);
                if (current && visible.get(current) === entity) return current;
                if (type !== "death") return;
                const previous = deathHandles.get(entity)?.handle ?? previousHandles.get(entity);
                if (previous) deathHandles.set(entity, { handle: previous, tick: kernel.tick });
                return previous;
              },
            ),
          }),
        ...(mode === "controlled" &&
          kernel.visibility && {
            fog,
            ghosts,
            resourceNodes: [
              ...new Map(
                (kernel.map?.resources ?? []).flatMap((resource) => {
                  if (resource.kind === "ore") return [];
                  const origin = resourceNodeOrigin(resource);
                  if (
                    !fog.some(
                      (grid) =>
                        origin.x >= 0 &&
                        origin.y >= 0 &&
                        origin.x < grid.width &&
                        origin.y < grid.height &&
                        (grid.cells[origin.y * grid.width + origin.x] ?? 0) > 0,
                    )
                  )
                    return [];
                  const node = { kind: resource.kind, x: origin.x * 1024, y: origin.y * 1024 };
                  return [[`${node.y}:${node.x}:${node.kind}`, node] as const];
                }),
              ).values(),
            ].sort(
              (a, b) => a.y - b.y || a.x - b.x || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
            ),
          }),
      };
    },
    resolve(handle: unknown, scope?: Scope): number | undefined {
      const id = typeof handle === "string" ? visible.get(handle) : undefined;
      if (id === undefined || !current?.world.isAlive(id)) return undefined;
      if (mode === "debug-no-fog") return id;
      const { world } = current;
      const request = !!setup.normal && world.has(id, ConstructionRequest);
      const item = !!setup.normal && world.has(id, ProductionItem);
      const force = request
        ? world.get(id, ConstructionRequest, "force")
        : item
          ? world.get(id, ProductionItem, "force")
          : world.has(id, OwnerForce)
            ? world.get(id, OwnerForce, "force")
            : undefined;
      if (force === undefined) return undefined;
      const permits = (required: Scope) =>
        current?.visibility
          ? current.visibility.permits(seat, force, required)
          : hasGrant(setup.grants, seat, force, required, current?.tick ?? 0);
      if (scope && !permits(scope)) return undefined;
      if (request) return permits("economy.build") ? id : undefined;
      if (item) return permits("production.queue") ? id : undefined;
      return current.visibility
        ? current.visibility.canSeeEntity(seat, id)
          ? id
          : undefined
        : permits("unit.orders") ||
            permits("economy.build") ||
            permits("economy.transfer") ||
            permits("production.queue") ||
            permits("research.spend")
          ? id
          : undefined;
    },
    serialize(): ProjectionState {
      const rows = (mapping: Map<number, string>) =>
        [...mapping]
          .sort(([a], [b]) => a - b)
          .map(([entity, handle]) => [entity, Number(handle.slice(1))]);
      return {
        format: 1,
        nextHandle,
        nextGhost,
        handles: rows(handles),
        ghostHandles: rows(ghostHandles),
      };
    },
    validateState(value: unknown, kernel: Kernel): ProjectionState {
      const row = arr(int(1, HANDLE_MAX), 2, 2);
      const schema = strictObject({
        format: int(1, 1),
        nextHandle: int(1, HANDLE_MAX + 1),
        nextGhost: int(1, HANDLE_MAX + 1),
        handles: arr(row),
        ghostHandles: arr(row),
      });
      if (validate(schema, value).length) throw new Error("Invalid projection mapping");
      const state = value as ProjectionState;
      for (const [rows, next, live] of [
        [state.handles, state.nextHandle, true],
        [state.ghostHandles, state.nextGhost, false],
      ] as const) {
        let previous = 0;
        const used = new Set<number>();
        for (const [id = 0, handle = 0] of rows) {
          if (
            id <= previous ||
            handle >= next ||
            used.has(handle) ||
            (live && !kernel.world.isAlive(id))
          )
            throw new Error("Invalid projection mapping row");
          previous = id;
          used.add(handle);
        }
      }
      return {
        ...state,
        handles: state.handles.map((row) => [...row]),
        ghostHandles: state.ghostHandles.map((row) => [...row]),
      };
    },
    load(value: unknown, kernel: Kernel): void {
      const state = this.validateState(value, kernel);
      handles.clear();
      ghostHandles.clear();
      visible.clear();
      for (const [id = 0, handle = 0] of state.handles) handles.set(id, `e${handle}`);
      for (const [id = 0, handle = 0] of state.ghostHandles) ghostHandles.set(id, `g${handle}`);
      nextHandle = state.nextHandle;
      nextGhost = state.nextGhost;
      current = kernel;
    },
  };
}
