import { type ConstructionBuild, hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import type { Feature, Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearAttackOrder } from "../combat";
import type { StockResourceId } from "../economy";
import { suspendHarvesting } from "../economy/harvesting";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { checkSpawnPlacement, type SpawnCell } from "../entities/placement";
import { MoveIntent, MovementFailure } from "../movement";
import { ConstructionSite } from ".";
import { suspendRepair } from "./repair";

export const CONSTRUCTION_CLEARANCE_TICKS = 40;
/** Proven investment, kept separately from the site's completion marker. Destruction loses it. */
export const ConstructionPayment = defineComponent("ConstructionPayment", {
  credits: "i32",
  materials: "i32",
  industrialCapacity: "i32",
  salvagePoints: "i32",
});
/** Waiting placement only: no occupancy, debit or operating structure exists yet. */
export const ConstructionRequest = defineComponent("ConstructionRequest", {
  definition: "u32",
  force: "u32",
  seat: "u32",
  x: "i32",
  y: "i32",
  facing: "u16",
  deadline: "u32",
  status: "u8",
  reason: "u8",
});
/** Selection links are ECS rows so clearance revalidation survives canonical serialization. */
export const ConstructionBuilder = defineComponent("ConstructionBuilder", {
  request: "u32",
  builder: "u32",
});
/** Current build order: an unpaid request first, then the actual paid site. */
export const BuilderConstruction = defineComponent("BuilderConstruction", { target: "u32" });
/** Whole single-builder work ticks plus the remaining quarter tick: never multiply int32 duration into u32. */
export const ConstructionProgress = defineComponent("ConstructionProgress", {
  completedTicks: "u32",
  quarter: "u8",
  buildersWorking: "u32",
});
export const ConstructionApproach = defineComponent("ConstructionApproach", {
  site: "u32",
  originX: "i32",
  originY: "i32",
  next: "u8",
  x: "i32",
  y: "i32",
  state: "u8",
});

/** Explicit replacement/cancellation only; callers check that the assignment still belongs to them. */
export function clearConstructionOrder(kernel: Kernel, builder: number): void {
  const world = kernel.world;
  kernel.movement?.cancel(builder);
  if (world.has(builder, MoveIntent)) world.remove(builder, MoveIntent);
  if (world.has(builder, MovementFailure)) world.remove(builder, MovementFailure);
  if (world.has(builder, ConstructionApproach)) world.remove(builder, ConstructionApproach);
  if (world.has(builder, BuilderConstruction)) world.remove(builder, BuilderConstruction);
}

export function assignBuilderConstruction(kernel: Kernel, builder: number, target: number): void {
  clearAttackOrder(kernel, builder);
  suspendRepair(kernel, builder);
  suspendHarvesting(kernel, builder);
  clearConstructionOrder(kernel, builder);
  kernel.world.add(builder, BuilderConstruction, { target });
}

export function validConstructionBuilders(
  kernel: Kernel,
  definitions: readonly Definition[],
  force: number,
  definitionId: string,
  builders: readonly number[],
): boolean {
  return (
    builders.length > 0 &&
    new Set(builders).size === builders.length &&
    builders.every((id) => {
      const world = kernel.world;
      if (
        !world.isAlive(id) ||
        !world.has(id, Template) ||
        !world.has(id, OwnerForce) ||
        !world.has(id, Health) ||
        world.get(id, Health, "current") === 0
      )
        return false;
      const definition = definitions[world.get(id, Template, "definition")];
      return (
        world.get(id, OwnerForce, "force") === force &&
        definition?.role === "builder" &&
        kind(definition) === "unit" &&
        !!definition.builds?.includes(definitionId)
      );
    })
  );
}

export const CONSTRUCTION_REFUSALS = [
  "bad_payload",
  "no_grant",
  "insufficient_funds",
  "placement_failed",
  "clearance_timeout",
  "structure_cap",
] as const;

type ConstructionRejection =
  | "bad_payload"
  | "no_grant"
  | "insufficient_funds"
  | "placement_failed"
  | "structure_cap";

const kind = (definition: Definition) => definition.id.split(":")[0]?.split(".").at(-1);
const stockFields = {
  credits: "credits",
  materials: "materials",
  "industrial-capacity": "industrialCapacity",
  "salvage-points": "salvagePoints",
} as const;

function footprint(kernel: Kernel, definitions: readonly Definition[], entity: number) {
  const world = kernel.world;
  const definition = definitions[world.get(entity, Template, "definition")];
  const [w = 1, d = 1] = definition?.footprint ?? [];
  const turned = (((world.get(entity, Transform, "facing") >>> 14) + 3) & 1) !== 0;
  return {
    x: Math.floor(world.get(entity, Transform, "x") / 1024),
    y: Math.floor(world.get(entity, Transform, "y") / 1024),
    width: turned ? d : w,
    depth: turned ? w : d,
  };
}

function inRadius(
  kernel: Kernel,
  definitions: readonly Definition[],
  build: ConstructionBuild,
  cells: readonly SpawnCell[],
) {
  const target = definitions.find((definition) => definition.id === build.definition);
  if (target?.role === "extractor" && target.nodeKinds?.length) return true;
  const radius = target?.role === "defense" || target?.role === "wall" ? 3 : 6;
  const world = kernel.world;
  const providers = world
    .query(Template, Transform, OwnerForce)
    .filter((id) => {
      const definition = definitions[world.get(id, Template, "definition")];
      return (
        definition &&
        kind(definition) === "structure" &&
        definition.role !== "extractor" &&
        !definition.nodeKinds?.length &&
        world.get(id, OwnerForce, "force") === build.force &&
        !world.has(id, ConstructionSite)
      );
    })
    .map((id) => footprint(kernel, definitions, id));
  return cells.every((cell) =>
    providers.some((provider) => {
      const dx = cell.x - Math.max(provider.x, Math.min(cell.x, provider.x + provider.width - 1));
      const dy = cell.y - Math.max(provider.y, Math.min(cell.y, provider.y + provider.depth - 1));
      return dx * dx + dy * dy <= radius * radius;
    }),
  );
}

/** Normal construction alone owns payment and site creation; previews and debug spawning never call it. */
export function constructionFeature(
  setup: Pick<MatchSetup, "definitions" | "grants" | "normal">,
): Feature {
  const { definitions, grants } = setup;
  const teams = new Map(setup.normal?.forces.map((force) => [force.index, force.team]));
  const definitionOf = (kernel: Kernel, id: number) =>
    definitions[kernel.world.get(id, Template, "definition")];
  const eligible = (
    kernel: Kernel,
    seat: number,
    build: ConstructionBuild,
  ): ConstructionRejection | undefined => {
    if (!hasGrant(grants, seat, build.force, "economy.build", kernel.tick)) return "no_grant";
    const definition = definitions.find((entry) => entry.id === build.definition);
    if (
      !kernel.economy ||
      !definition?.construction ||
      kind(definition) !== "structure" ||
      !validConstructionBuilders(kernel, definitions, build.force, build.definition, build.builders)
    )
      return "bad_payload";
    const structures = kernel.world.query(Template, OwnerForce).filter((id) => {
      const existing = definitionOf(kernel, id);
      return (
        existing &&
        kernel.world.get(id, OwnerForce, "force") === build.force &&
        kind(existing) === "structure"
      );
    });
    const quarters = structures.reduce(
      (sum, id) => sum + (definitionOf(kernel, id)?.role === "wall" ? 1 : 4),
      0,
    );
    if (
      setup.normal &&
      quarters + (definition.role === "wall" ? 1 : 4) > setup.normal.settings.structureCap * 4
    )
      return "structure_cap";
    const completed = kernel.world
      .query(Template, OwnerForce)
      .filter(
        (id) =>
          kernel.world.get(id, OwnerForce, "force") === build.force &&
          !kernel.world.has(id, ConstructionSite),
      );
    if (
      definition.requires?.some(
        (required) => !completed.some((id) => definitionOf(kernel, id)?.id === required),
      )
    )
      return "bad_payload";
    const balance = kernel.economy.balance(build.force);
    if (
      !balance ||
      Object.entries(definition.construction.cost).some(
        ([resource, amount]) => amount > (balance[resource as StockResourceId] ?? -1),
      )
    )
      return "insufficient_funds";
  };
  const blockers = (kernel: Kernel, cells: readonly SpawnCell[]) =>
    kernel.world.query(Template, Transform, OwnerForce).filter((id) => {
      const definition = definitionOf(kernel, id);
      if (!definition || kind(definition) !== "unit") return false;
      const x = kernel.world.get(id, Transform, "x");
      const y = kernel.world.get(id, Transform, "y");
      const radius = definition.radiusSubcells ?? 0;
      return cells.some((cell) => {
        const left = cell.x * 1024,
          top = cell.y * 1024;
        if (x >= left && x < left + 1024 && y >= top && y < top + 1024) return true;
        const dx = x - Math.max(left, Math.min(x, left + 1024));
        const dy = y - Math.max(top, Math.min(y, top + 1024));
        return dx * dx + dy * dy < radius * radius;
      });
    });
  const controllable = (kernel: Kernel, seat: number, force: number, ids: readonly number[]) =>
    ids.every((id) => {
      const owner = kernel.world.get(id, OwnerForce, "force");
      const definition = definitionOf(kernel, id);
      return (
        (owner === force || (teams.has(force) && teams.get(force) === teams.get(owner))) &&
        hasGrant(grants, seat, owner, "unit.orders", kernel.tick) &&
        (definition?.speed ?? 0) > 0
      );
    });
  function createSite(
    kernel: Kernel,
    seat: number,
    build: ConstructionBuild,
  ): ConstructionRejection | undefined {
    const rejected = eligible(kernel, seat, build);
    if (rejected) return rejected;
    if (!checkSpawnPlacement(kernel, definitions, build).ok) return "placement_failed";
    const index = definitions.findIndex((entry) => entry.id === build.definition);
    const definition = definitions[index] as Definition;
    const cost = definition.construction?.cost;
    const paid = kernel.economy?.spend(seat, build.force, cost, "economy.build");
    if (!paid?.ok) return paid?.reason === "no_grant" ? "no_grant" : "insufficient_funds";
    const site = spawnEntity(kernel, index, definition, build);
    kernel.world.add(site, ConstructionSite);
    kernel.world.add(site, ConstructionProgress);
    kernel.world.add(site, ConstructionPayment, {
      credits: cost?.credits ?? 0,
      materials: cost?.materials ?? 0,
      industrialCapacity: cost?.["industrial-capacity"] ?? 0,
      salvagePoints: cost?.["salvage-points"] ?? 0,
    });
    for (const builder of build.builders) assignBuilderConstruction(kernel, builder, site);
  }
  function unassign(kernel: Kernel, target: number) {
    for (const builder of kernel.world.query(BuilderConstruction))
      if (kernel.world.get(builder, BuilderConstruction, "target") === target)
        clearConstructionOrder(kernel, builder);
  }
  function refuseRequest(
    kernel: Kernel,
    request: number,
    reason: (typeof CONSTRUCTION_REFUSALS)[number],
  ) {
    const world = kernel.world;
    unassign(kernel, request);
    const seat = world.get(request, ConstructionRequest, "seat"),
      force = world.get(request, ConstructionRequest, "force");
    for (const id of world.query(ConstructionRequest))
      if (
        id !== request &&
        world.get(id, ConstructionRequest, "status") === 1 &&
        world.get(id, ConstructionRequest, "seat") === seat &&
        world.get(id, ConstructionRequest, "force") === force
      )
        discardRequest(kernel, id);
    for (const id of world.query(ConstructionBuilder))
      if (world.get(id, ConstructionBuilder, "request") === request) world.destroy(id);
    world.set(request, ConstructionRequest, "status", 1);
    world.set(request, ConstructionRequest, "reason", CONSTRUCTION_REFUSALS.indexOf(reason));
  }
  function discardRequest(kernel: Kernel, request: number) {
    unassign(kernel, request);
    for (const id of kernel.world.query(ConstructionBuilder))
      if (kernel.world.get(id, ConstructionBuilder, "request") === request)
        kernel.world.destroy(id);
    kernel.world.destroy(request);
    // Clearance orders are ordinary moves: cancellation/refusal never rewinds a newer player order.
  }
  function buildRequest(kernel: Kernel, request: number): ConstructionBuild {
    const world = kernel.world;
    return {
      definition: (definitions[world.get(request, ConstructionRequest, "definition")] as Definition)
        .id,
      force: world.get(request, ConstructionRequest, "force"),
      x: world.get(request, ConstructionRequest, "x"),
      y: world.get(request, ConstructionRequest, "y"),
      facing: world.get(request, ConstructionRequest, "facing"),
      builders: world
        .query(ConstructionBuilder)
        .filter((id) => world.get(id, ConstructionBuilder, "request") === request)
        .map((id) => world.get(id, ConstructionBuilder, "builder")),
    };
  }
  return {
    components: [
      ConstructionSite,
      ConstructionPayment,
      ConstructionRequest,
      ConstructionBuilder,
      BuilderConstruction,
      ConstructionProgress,
      ConstructionApproach,
    ],
    handlers: {
      "economy.build": (kernel, { seat, payload: build }) => {
        const rejected = eligible(kernel, seat, build);
        if (rejected) return rejected;
        const placement = checkSpawnPlacement(kernel, definitions, build, { ignoreUnits: true });
        if (
          !placement.ok ||
          !placement.cells ||
          !inRadius(kernel, definitions, build, placement.cells)
        )
          return "placement_failed";
        const ids = blockers(kernel, placement.cells);
        // Static authored units cannot receive orders and therefore refuse, even when their cells match friendly units.
        if (
          kernel.map?.objects.some((object) => {
            const definition = definitions.find((entry) => entry.id === object.definition);
            return (
              definition &&
              kind(definition) === "unit" &&
              placement.cells?.some(
                (cell) =>
                  cell.x === Math.floor(object.position[0] / 1024) &&
                  cell.y === Math.floor(object.position[1] / 1024),
              )
            );
          })
        )
          return "placement_failed";
        if (!ids.length) return createSite(kernel, seat, build);
        if (!kernel.movement || !controllable(kernel, seat, build.force, ids))
          return "placement_failed";
        const world = kernel.world;
        const request = world.create();
        world.add(request, ConstructionRequest, {
          definition: definitions.findIndex((entry) => entry.id === build.definition),
          force: build.force,
          seat,
          x: build.x,
          y: build.y,
          facing: build.facing,
          deadline: kernel.tick + CONSTRUCTION_CLEARANCE_TICKS,
        });
        for (const builder of [...build.builders].sort((a, b) => a - b)) {
          const id = world.create();
          world.add(id, ConstructionBuilder, { request, builder });
          assignBuilderConstruction(kernel, builder, request);
        }
        kernel.movement.refreshOccupancy();
        const xs = placement.cells.map((cell) => cell.x),
          ys = placement.cells.map((cell) => cell.y);
        const minX = Math.min(...xs),
          maxX = Math.max(...xs),
          minY = Math.min(...ys),
          maxY = Math.max(...ys);
        for (const id of ids) {
          suspendHarvesting(kernel, id);
          clearAttackOrder(kernel, id);
          suspendRepair(kernel, id);
          if (
            world.has(id, BuilderConstruction) &&
            world.get(id, BuilderConstruction, "target") !== request
          )
            clearConstructionOrder(kernel, id);
          const x = world.get(id, Transform, "x"),
            y = world.get(id, Transform, "y");
          const radius = definitionOf(kernel, id)?.radiusSubcells ?? 0;
          const targets = [
            { x: minX * 1024 - radius - 512, y },
            { x: (maxX + 1) * 1024 + radius + 512, y },
            { x, y: minY * 1024 - radius - 512 },
            { x, y: (maxY + 1) * 1024 + radius + 512 },
          ].sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
          if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
          if (world.has(id, MovementFailure)) world.remove(id, MovementFailure);
          kernel.movement.cancel(id);
          kernel.movement.order(id, targets[0] as { x: number; y: number });
        }
      },
      "economy.cancelConstruction": (kernel, { seat, payload: { entity } }) => {
        const world = kernel.world;
        if (!world.isAlive(entity)) return "bad_payload";
        if (world.has(entity, ConstructionRequest)) {
          if (
            !hasGrant(
              grants,
              seat,
              world.get(entity, ConstructionRequest, "force"),
              "economy.build",
              kernel.tick,
            )
          )
            return "no_grant";
          discardRequest(kernel, entity);
          return;
        }
        if (!world.has(entity, ConstructionSite) || !world.has(entity, ConstructionPayment))
          return "bad_payload";
        const force = world.get(entity, OwnerForce, "force");
        if (!hasGrant(grants, seat, force, "economy.build", kernel.tick)) return "no_grant";
        const cost = Object.fromEntries(
          Object.entries(stockFields).map(([resource, field]) => [
            resource,
            world.get(entity, ConstructionPayment, field),
          ]),
        );
        if (!kernel.economy?.refund(force, cost).ok) return "bad_payload";
        unassign(kernel, entity);
        world.destroy(entity);
      },
    },
    systems: {
      economy: [
        (kernel) => {
          const world = kernel.world;
          for (const request of world.query(ConstructionRequest)) {
            if (world.get(request, ConstructionRequest, "status") !== 0) continue;
            const build = buildRequest(kernel, request),
              seat = world.get(request, ConstructionRequest, "seat");
            const placement = checkSpawnPlacement(kernel, definitions, build, {
              ignoreUnits: true,
            });
            const rejected = eligible(kernel, seat, build);
            const superseded = build.builders.some(
              (id) =>
                !world.isAlive(id) ||
                !world.has(id, BuilderConstruction) ||
                world.get(id, BuilderConstruction, "target") !== request,
            );
            if (
              rejected ||
              superseded ||
              !placement.ok ||
              !placement.cells ||
              !inRadius(kernel, definitions, build, placement.cells)
            ) {
              refuseRequest(kernel, request, rejected ?? "placement_failed");
              continue;
            }
            const ids = blockers(kernel, placement.cells);
            if (!controllable(kernel, seat, build.force, ids))
              refuseRequest(kernel, request, "placement_failed");
            else if (!ids.length) {
              const rejected = createSite(kernel, seat, build);
              if (rejected) refuseRequest(kernel, request, rejected);
              else discardRequest(kernel, request);
            } else if (kernel.tick >= world.get(request, ConstructionRequest, "deadline"))
              refuseRequest(kernel, request, "clearance_timeout");
          }
        },
      ],
    },
  };
}
