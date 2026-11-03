import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Feature, type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearAttackOrder } from "../combat";
import { ConstructionSite } from "../construction";
import { suspendRepair } from "../construction/repair";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import { perimeterPoint } from "../entities/perimeter";
import { MoveIntent, MovementFailure } from "../movement";
import { suspendSalvage } from "../salvage";
import { mineOreCell, oreCells, readOreCell } from "./ore";

export const HARVEST_UNLOAD_TICKS = 40;
const RETRY_TICKS = 40;
const AVOID_TICKS = 200;
const NO_CELL = 0xffffffff;
export const HARVEST_STATUSES = [
  "idle",
  "travel_ore",
  "mining",
  "no_ore",
  "travel_dock",
  "queued",
  "unloading",
  "no_dropoff",
  "blocked",
  "bank_full",
] as const;
type HarvestStatus = (typeof HARVEST_STATUSES)[number];
export const Harvester = defineComponent("Harvester", {
  cargo: "i32",
  miningWork: "u8",
  unloadTicks: "u8",
  enabled: "u8",
  state: "u8",
  cell: "u32",
  dock: "u32",
  x: "i32",
  y: "i32",
  arrivalTick: "u32",
  retryAt: "u32",
  avoidCell: "u32",
  avoidDock: "u32",
  avoidUntil: "u32",
});
export interface HarvestSnapshot {
  readonly cargo: number;
  readonly capacity: number;
  readonly status: HarvestStatus;
  readonly unloadTicks: number;
}
const status = (kernel: Kernel, id: number): HarvestStatus =>
  HARVEST_STATUSES[kernel.world.get(id, Harvester, "state")] as HarvestStatus;
const setStatus = (kernel: Kernel, id: number, state: HarvestStatus) =>
  kernel.world.set(id, Harvester, "state", HARVEST_STATUSES.indexOf(state));
const live = (kernel: Kernel, id: number) =>
  kernel.world.isAlive(id) &&
  kernel.world.has(id, Health) &&
  kernel.world.get(id, Health, "current") > 0;
const position = (kernel: Kernel, id: number) => ({
  x: kernel.world.get(id, Transform, "x"),
  y: kernel.world.get(id, Transform, "y"),
});
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const target = (kernel: Kernel, id: number) => ({
  x: kernel.world.get(id, Harvester, "x"),
  y: kernel.world.get(id, Harvester, "y"),
});
function stopRoute(kernel: Kernel, id: number): void {
  kernel.movement?.cancel(id);
  if (kernel.world.has(id, MoveIntent)) kernel.world.remove(id, MoveIntent);
  if (kernel.world.has(id, MovementFailure)) kernel.world.remove(id, MovementFailure);
}

/** Called only for accepted replacement orders. Cargo and fractional mining survive manual control. */
export function suspendHarvesting(kernel: Kernel, id: number): void {
  if (!kernel.world.has(id, Harvester)) return;
  kernel.world.set(id, Harvester, "enabled", 0);
  kernel.world.set(id, Harvester, "dock", 0);
  kernel.world.set(id, Harvester, "unloadTicks", 0);
  setStatus(kernel, id, "idle");
}
export function harvestSnapshot(
  kernel: Kernel,
  id: number,
  definition: Definition,
): HarvestSnapshot | undefined {
  if (!kernel.world.has(id, Harvester) || !definition.harvestCapacity) return;
  return {
    cargo: kernel.world.get(id, Harvester, "cargo"),
    capacity: definition.harvestCapacity,
    status: status(kernel, id),
    unloadTicks: kernel.world.get(id, Harvester, "unloadTicks"),
  };
}
function attach(kernel: Kernel, id: number, definition: Definition): void {
  if (
    definition.role !== "harvester" ||
    !definition.harvestCapacity ||
    !definition.harvestAmountPerSecond ||
    kernel.world.has(id, Harvester)
  )
    return;
  kernel.world.add(id, Harvester, {
    cell: NO_CELL,
    avoidCell: NO_CELL,
    enabled: kernel.world.has(id, MoveIntent) ? 0 : 1,
  });
}

/** All assignments, arrival order, cargo and work live in ECS; only immutable definitions/grants close over. */
export function harvestingFeature(setup: Pick<MatchSetup, "definitions" | "grants">): Feature {
  const { definitions, grants } = setup;
  const definitionOf = (kernel: Kernel, id: number) =>
    definitions[kernel.world.get(id, Template, "definition")];
  const dockPoint = (kernel: Kernel, truck: number, dock: number) => {
    const world = kernel.world;
    if (
      !live(kernel, dock) ||
      !world.has(dock, Template) ||
      !world.has(dock, OwnerForce) ||
      world.has(dock, ConstructionSite) ||
      world.get(dock, OwnerForce, "force") !== world.get(truck, OwnerForce, "force")
    )
      return;
    const building = definitionOf(kernel, dock),
      unit = definitionOf(kernel, truck);
    const exit = building?.exits?.[0];
    if (
      building?.role !== "dropoff" ||
      building.dock !== true ||
      !exit ||
      unit?.radiusSubcells === undefined
    )
      return;
    const point = perimeterPoint(
      building,
      { ...position(kernel, dock), facing: world.get(dock, Transform, "facing") },
      exit,
      unit.radiusSubcells,
    );
    return kernel.movement?.canStand(truck, point) ? point : undefined;
  };
  const head = (kernel: Kernel, dock: number): number | undefined =>
    kernel.world
      .query(Harvester, OwnerForce, Health)
      .filter(
        (id) =>
          live(kernel, id) &&
          kernel.world.get(id, Harvester, "enabled") === 1 &&
          kernel.world.get(id, Harvester, "dock") === dock &&
          ["queued", "unloading", "bank_full"].includes(status(kernel, id)) &&
          !!dockPoint(kernel, id, dock),
      )
      .sort(
        (a, b) =>
          kernel.world.get(a, Harvester, "arrivalTick") -
            kernel.world.get(b, Harvester, "arrivalTick") || a - b,
      )[0];
  const travel = (
    kernel: Kernel,
    id: number,
    point: { x: number; y: number },
    state: HarvestStatus,
  ) => {
    stopRoute(kernel, id);
    kernel.world.set(id, Harvester, "x", point.x);
    kernel.world.set(id, Harvester, "y", point.y);
    setStatus(kernel, id, state);
    kernel.movement?.order(id, point);
  };
  const blocked = (kernel: Kernel, id: number) => {
    const world = kernel.world;
    stopRoute(kernel, id);
    world.set(id, Harvester, "avoidCell", world.get(id, Harvester, "cell"));
    world.set(id, Harvester, "avoidDock", world.get(id, Harvester, "dock"));
    world.set(id, Harvester, "avoidUntil", kernel.tick + AVOID_TICKS);
    world.set(id, Harvester, "retryAt", kernel.tick + RETRY_TICKS);
    world.set(id, Harvester, "dock", 0);
    world.set(id, Harvester, "unloadTicks", 0);
    setStatus(kernel, id, "blocked");
  };
  const seekDock = (kernel: Kernel, id: number) => {
    const world = kernel.world,
      origin = position(kernel, id);
    const options = world
      .query(Template, Transform, OwnerForce, Health)
      .filter(
        (dock) =>
          !kernel.disabled?.(dock) &&
          !(
            world.get(id, Harvester, "avoidUntil") > kernel.tick &&
            world.get(id, Harvester, "avoidDock") === dock
          ),
      )
      .map((dock) => ({ dock, point: dockPoint(kernel, id, dock) }))
      .filter((option) => option.point && kernel.movement?.canReach(id, option.point))
      .sort(
        (a, b) =>
          distance(origin, a.point as { x: number; y: number }) -
            distance(origin, b.point as { x: number; y: number }) || a.dock - b.dock,
      );
    const chosen = options[0];
    world.set(id, Harvester, "unloadTicks", 0);
    if (!chosen?.point) {
      stopRoute(kernel, id);
      world.set(id, Harvester, "dock", 0);
      world.set(id, Harvester, "retryAt", kernel.tick + RETRY_TICKS);
      setStatus(kernel, id, "no_dropoff");
      return;
    }
    world.set(id, Harvester, "dock", chosen.dock);
    travel(kernel, id, chosen.point, "travel_dock");
  };
  const seekOre = (kernel: Kernel, id: number) => {
    const world = kernel.world,
      map = kernel.map;
    if (!map) return;
    const origin = position(kernel, id);
    const options = oreCells(world)
      .filter(
        (ore) =>
          ore.remaining > 0 &&
          !(
            world.get(id, Harvester, "avoidUntil") > kernel.tick &&
            world.get(id, Harvester, "avoidCell") === ore.cell
          ),
      )
      .map((ore) => ({
        cell: ore.cell,
        point: {
          x: (ore.cell % map.terrain.width) * 1024 + 512,
          y: Math.floor(ore.cell / map.terrain.width) * 1024 + 512,
        },
      }))
      .filter((option) => kernel.movement?.canReach(id, option.point))
      .sort((a, b) => distance(origin, a.point) - distance(origin, b.point) || a.cell - b.cell);
    const chosen = options[0];
    world.set(id, Harvester, "dock", 0);
    if (!chosen) {
      if (world.get(id, Harvester, "cargo") > 0) {
        seekDock(kernel, id);
        return;
      }
      stopRoute(kernel, id);
      world.set(id, Harvester, "retryAt", kernel.tick + RETRY_TICKS);
      setStatus(kernel, id, "no_ore");
      return;
    }
    world.set(id, Harvester, "cell", chosen.cell);
    travel(kernel, id, chosen.point, "travel_ore");
  };
  return {
    components: [Harvester],
    handlers: {
      "unit.harvest": (kernel, { seat, payload: { entities } }) => {
        const world = kernel.world;
        const ids = entities.filter(
          (id) => live(kernel, id) && world.has(id, Template) && world.has(id, OwnerForce),
        );
        if (
          !ids.every((id) =>
            hasGrant(grants, seat, world.get(id, OwnerForce, "force"), "unit.orders", kernel.tick),
          )
        )
          return "no_grant";
        for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
          const definition = definitionOf(kernel, id);
          if (!definition) continue;
          attach(kernel, id, definition);
          if (!world.has(id, Harvester)) continue;
          clearAttackOrder(kernel, id);
          suspendRepair(kernel, id);
          suspendSalvage(kernel, id);
          stopRoute(kernel, id);
          world.set(id, Harvester, "enabled", 1);
          world.set(id, Harvester, "dock", 0);
          world.set(id, Harvester, "unloadTicks", 0);
          world.set(id, Harvester, "retryAt", 0);
          world.set(id, Harvester, "avoidUntil", 0);
          setStatus(kernel, id, "idle");
        }
      },
    },
    systems: {
      control: [
        (kernel) => {
          const world = kernel.world;
          kernel.movement?.refreshOccupancy();
          for (const id of world.query(Template, Transform, Health)) {
            const definition = definitionOf(kernel, id);
            if (definition && live(kernel, id)) attach(kernel, id, definition);
          }
          for (const id of world.query(Harvester, Template, Transform, Health, OwnerForce)) {
            if (
              !live(kernel, id) ||
              kernel.disabled?.(id) ||
              world.get(id, Harvester, "enabled") !== 1
            )
              continue;
            const definition = definitionOf(kernel, id);
            if (!definition?.harvestCapacity || !definition.harvestAmountPerSecond) continue;
            let state = status(kernel, id);
            const dock = world.get(id, Harvester, "dock");
            if (dock && !dockPoint(kernel, id, dock)) {
              stopRoute(kernel, id);
              world.set(id, Harvester, "dock", 0);
              world.set(id, Harvester, "unloadTicks", 0);
              world.set(id, Harvester, "retryAt", 0);
              setStatus(kernel, id, "idle");
              state = "idle";
            }
            if (dock && kernel.disabled?.(dock)) continue;
            if (state === "queued" || state === "unloading" || state === "bank_full") {
              if (head(kernel, dock) !== id) continue;
              const point = dockPoint(kernel, id, dock);
              if (!point) continue;
              if (distance(position(kernel, id), point) === 0 && !world.has(id, MoveIntent)) {
                if (state === "queued") setStatus(kernel, id, "unloading");
                continue;
              }
              if (world.has(id, MovementFailure)) {
                blocked(kernel, id);
                continue;
              }
              if (!world.has(id, MoveIntent)) travel(kernel, id, point, "queued");
              continue;
            }
            if (state === "travel_ore" || state === "travel_dock") {
              const point = target(kernel, id);
              const ore =
                state === "travel_ore"
                  ? readOreCell(world, world.get(id, Harvester, "cell"))
                  : undefined;
              if (state === "travel_ore" && !ore?.remaining) {
                stopRoute(kernel, id);
                setStatus(kernel, id, "idle");
                state = "idle";
              } else if (
                state === "travel_dock" &&
                distance(position(kernel, id), point) <=
                  (2 * (definition.radiusSubcells ?? 0) + 512) ** 2
              ) {
                stopRoute(kernel, id);
                world.set(id, Harvester, "arrivalTick", kernel.tick);
                setStatus(kernel, id, "queued");
                continue;
              } else if (
                distance(position(kernel, id), point) === 0 &&
                !world.has(id, MoveIntent)
              ) {
                setStatus(kernel, id, "mining");
                continue;
              } else if (
                world.has(id, MovementFailure) ||
                !world.has(id, MoveIntent) ||
                world.get(id, MoveIntent, "x") !== point.x ||
                world.get(id, MoveIntent, "y") !== point.y
              ) {
                blocked(kernel, id);
                continue;
              } else continue;
            }
            if (state === "mining") {
              if (world.get(id, Harvester, "cargo") >= definition.harvestCapacity) {
                seekDock(kernel, id);
                continue;
              }
              const ore = readOreCell(world, world.get(id, Harvester, "cell"));
              if (
                ore?.remaining &&
                distance(position(kernel, id), target(kernel, id)) === 0 &&
                kernel.movement?.canStand(id, target(kernel, id))
              )
                continue;
              setStatus(kernel, id, "idle");
            }
            if (world.get(id, Harvester, "retryAt") > kernel.tick) continue;
            if (world.get(id, Harvester, "cargo") >= definition.harvestCapacity)
              seekDock(kernel, id);
            else seekOre(kernel, id);
          }
        },
      ],
      economy: [
        (kernel) => {
          const world = kernel.world;
          for (const id of world.query(Harvester, Template, Transform, Health, OwnerForce)) {
            if (
              !live(kernel, id) ||
              kernel.disabled?.(id) ||
              world.get(id, Harvester, "enabled") !== 1
            )
              continue;
            const definition = definitionOf(kernel, id);
            if (!definition?.harvestCapacity || !definition.harvestAmountPerSecond) continue;
            const cargo = world.get(id, Harvester, "cargo");
            if (cargo < 0 || cargo > definition.harvestCapacity) continue;
            const state = status(kernel, id);
            if (state === "mining") {
              if (
                distance(position(kernel, id), target(kernel, id)) !== 0 ||
                world.has(id, MoveIntent)
              )
                continue;
              const work =
                world.get(id, Harvester, "miningWork") + definition.harvestAmountPerSecond;
              const taken = mineOreCell(
                world,
                world.get(id, Harvester, "cell"),
                Math.min(definition.harvestCapacity - cargo, Math.floor(work / 20)),
              );
              world.set(id, Harvester, "cargo", cargo + taken);
              world.set(id, Harvester, "miningWork", work % 20);
            } else if (state === "unloading" || state === "bank_full") {
              const dock = world.get(id, Harvester, "dock"),
                point = dockPoint(kernel, id, dock);
              if (
                !point ||
                kernel.disabled?.(dock) ||
                head(kernel, dock) !== id ||
                distance(position(kernel, id), point) !== 0 ||
                world.has(id, MoveIntent)
              )
                continue;
              const elapsed = Math.min(
                HARVEST_UNLOAD_TICKS,
                world.get(id, Harvester, "unloadTicks") + 1,
              );
              world.set(id, Harvester, "unloadTicks", elapsed);
              if (elapsed < HARVEST_UNLOAD_TICKS) continue;
              if (
                !kernel.economy?.gain(world.get(id, OwnerForce, "force"), { credits: cargo }).ok
              ) {
                setStatus(kernel, id, "bank_full");
                continue;
              }
              world.set(id, Harvester, "cargo", 0);
              kernel.orders?.harvestFinished(id);
              world.set(id, Harvester, "dock", 0);
              world.set(id, Harvester, "unloadTicks", 0);
              world.set(id, Harvester, "retryAt", 0);
              setStatus(kernel, id, "idle");
            }
          }
        },
      ],
    },
  };
}

export function initializeHarvesting(
  kernel: Kernel,
  setup: Pick<MatchSetup, "definitions" | "grants">,
): void {
  register(kernel, harvestingFeature(setup));
  for (const id of kernel.world.query(Template, Transform, Health)) {
    const definition = setup.definitions[kernel.world.get(id, Template, "definition")];
    if (definition) attach(kernel, id, definition);
  }
}
