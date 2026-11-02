import { hasGrant } from "../../commands";
import type { Feature, Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import { MoveIntent, MovementFailure } from "../movement";
import { ConstructionSite } from ".";
import {
  assignBuilderConstruction,
  BuilderConstruction,
  ConstructionApproach,
  ConstructionProgress,
  ConstructionRequest,
  clearConstructionOrder,
  validConstructionBuilders,
} from "./sites";

export const CONSTRUCTION_WORK_STATES = ["approaching", "working", "blocked"] as const;

/** Exterior cell centres along each rotated footprint side, far enough away for this builder's disc. */
function workPositions(
  kernel: Kernel,
  definitions: readonly Definition[],
  builder: number,
  site: number,
) {
  const world = kernel.world;
  const definition = definitions[world.get(site, Template, "definition")] as Definition;
  const unit = definitions[world.get(builder, Template, "definition")] as Definition;
  const [w = 1, d = 1] = definition.footprint ?? [];
  const rotated = (((world.get(site, Transform, "facing") >>> 14) + 3) & 1) !== 0;
  const width = rotated ? d : w,
    depth = rotated ? w : d;
  const x = Math.floor(world.get(site, Transform, "x") / 1024),
    y = Math.floor(world.get(site, Transform, "y") / 1024);
  const offset = Math.max(1, Math.floor(((unit.radiusSubcells ?? 0) + 1535) / 1024));
  const points: { x: number; y: number }[] = [];
  const add = (cx: number, cy: number) => points.push({ x: cx * 1024 + 512, y: cy * 1024 + 512 });
  for (let row = 0; row < depth; row++) {
    add(x - offset, y + row);
    add(x + width + offset - 1, y + row);
  }
  for (let column = 0; column < width; column++) {
    add(x + column, y - offset);
    add(x + column, y + depth + offset - 1);
  }
  const ox = world.get(builder, ConstructionApproach, "originX"),
    oy = world.get(builder, ConstructionApproach, "originY");
  return points.sort(
    (a, b) =>
      (a.x - ox) ** 2 + (a.y - oy) ** 2 - ((b.x - ox) ** 2 + (b.y - oy) ** 2) ||
      a.y - b.y ||
      a.x - b.x,
  );
}

/** Shared finite approach policy for construction and paid structure repair. */
export function approachStructure(
  kernel: Kernel,
  definitions: readonly Definition[],
  builder: number,
  site: number,
): void {
  const world = kernel.world;
  if (!world.has(builder, ConstructionApproach))
    world.add(builder, ConstructionApproach, {
      site,
      originX: world.get(builder, Transform, "x"),
      originY: world.get(builder, Transform, "y"),
    });
  const state = world.get(builder, ConstructionApproach, "state");
  if (state === 2) return; // An explicit assist order retries blocked approaches without an endless automatic order loop.
  const target = {
    x: world.get(builder, ConstructionApproach, "x"),
    y: world.get(builder, ConstructionApproach, "y"),
  };
  const atTarget =
    world.get(builder, Transform, "x") === target.x &&
    world.get(builder, Transform, "y") === target.y;
  if (
    world.get(builder, ConstructionApproach, "next") > 0 &&
    atTarget &&
    !world.has(builder, MoveIntent) &&
    kernel.movement?.canStand(builder, target)
  ) {
    world.set(builder, ConstructionApproach, "state", 1);
    return;
  }
  if (state === 0 && world.has(builder, MoveIntent)) return;
  world.set(builder, ConstructionApproach, "state", 0);
  const positions = workPositions(kernel, definitions, builder, site);
  let next = world.get(builder, ConstructionApproach, "next");
  while (
    next < positions.length &&
    !kernel.movement?.canStand(builder, positions[next] as { x: number; y: number })
  )
    next++;
  const point = positions[next];
  if (!point) {
    kernel.movement?.cancel(builder);
    if (world.has(builder, MoveIntent)) world.remove(builder, MoveIntent);
    world.set(builder, ConstructionApproach, "state", 2);
    return;
  }
  world.set(builder, ConstructionApproach, "next", next + 1);
  world.set(builder, ConstructionApproach, "x", point.x);
  world.set(builder, ConstructionApproach, "y", point.y);
  if (world.has(builder, MoveIntent)) world.remove(builder, MoveIntent);
  if (world.has(builder, MovementFailure)) world.remove(builder, MovementFailure);
  kernel.movement?.cancel(builder);
  kernel.movement?.order(builder, point);
  if (
    !world.has(builder, MoveIntent) &&
    world.get(builder, Transform, "x") === point.x &&
    world.get(builder, Transform, "y") === point.y
  )
    world.set(builder, ConstructionApproach, "state", 1);
}

/** Actual on-site work only. Routes retain the movement feature's counted searches and fallback policy. */
export function constructionWorkFeature(
  setup: Pick<MatchSetup, "definitions" | "grants">,
): Feature {
  const { definitions, grants } = setup;
  const live = (kernel: Kernel, id: number) =>
    kernel.world.isAlive(id) &&
    kernel.world.has(id, Health) &&
    kernel.world.get(id, Health, "current") > 0;
  return {
    handlers: {
      "economy.assistConstruction": (kernel, { seat, payload: { entity, builders } }) => {
        const world = kernel.world;
        if (
          !live(kernel, entity) ||
          !world.has(entity, ConstructionSite) ||
          !world.has(entity, ConstructionProgress)
        )
          return "bad_payload";
        const force = world.get(entity, OwnerForce, "force");
        if (!hasGrant(grants, seat, force, "economy.build", kernel.tick)) return "no_grant";
        const definition = definitions[world.get(entity, Template, "definition")] as Definition;
        if (
          !validConstructionBuilders(kernel, definitions, force, definition.id, builders) ||
          builders.some((id) => !live(kernel, id))
        )
          return "bad_payload";
        for (const builder of [...builders].sort((a, b) => a - b))
          assignBuilderConstruction(kernel, builder, entity);
      },
    },
    systems: {
      control: [
        (kernel) => {
          const world = kernel.world;
          kernel.movement?.refreshOccupancy();
          for (const builder of world.query(
            BuilderConstruction,
            Template,
            Transform,
            OwnerForce,
            Health,
          )) {
            const site = world.get(builder, BuilderConstruction, "target");
            if (world.isAlive(site) && world.has(site, ConstructionRequest)) continue;
            if (
              !live(kernel, builder) ||
              !live(kernel, site) ||
              !world.has(site, ConstructionSite) ||
              world.get(builder, OwnerForce, "force") !== world.get(site, OwnerForce, "force")
            ) {
              clearConstructionOrder(kernel, builder);
              continue;
            }
            approachStructure(kernel, definitions, builder, site);
          }
        },
      ],
      economy: [
        (kernel) => {
          const world = kernel.world;
          for (const site of world.query(
            ConstructionSite,
            ConstructionProgress,
            Template,
            Health,
          )) {
            const builders = world
              .query(BuilderConstruction, ConstructionApproach, Transform, Health)
              .filter(
                (id) =>
                  live(kernel, id) &&
                  world.get(id, BuilderConstruction, "target") === site &&
                  world.get(id, ConstructionApproach, "state") === 1 &&
                  !world.has(id, MoveIntent) &&
                  world.get(id, Transform, "x") === world.get(id, ConstructionApproach, "x") &&
                  world.get(id, Transform, "y") === world.get(id, ConstructionApproach, "y"),
              );
            world.set(
              site,
              ConstructionProgress,
              "buildersWorking",
              live(kernel, site) ? builders.length : 0,
            );
            if (!live(kernel, site) || !builders.length) continue;
            const duration = definitions[world.get(site, Template, "definition")]?.construction
              ?.buildTicks as number;
            const completed = world.get(site, ConstructionProgress, "completedTicks"),
              quarter = world.get(site, ConstructionProgress, "quarter");
            const rate =
              builders.length === 1 ? 4 : builders.length === 2 ? 7 : builders.length + 6;
            if (rate >= (duration - completed) * 4 - quarter) {
              for (const builder of world.query(BuilderConstruction))
                if (world.get(builder, BuilderConstruction, "target") === site)
                  clearConstructionOrder(kernel, builder);
              world.remove(site, ConstructionSite);
              world.remove(site, ConstructionProgress);
            } else {
              world.set(
                site,
                ConstructionProgress,
                "completedTicks",
                completed + Math.floor((quarter + rate) / 4),
              );
              world.set(site, ConstructionProgress, "quarter", (quarter + rate) % 4);
            }
          }
        },
      ],
    },
  };
}
