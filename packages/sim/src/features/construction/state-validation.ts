import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { Template, Transform } from "../entities";
import { Remains, SalvageOrder } from "../salvage";
import { ConstructionSite } from ".";
import { KitStructure, REPAIR_STATES, RepairCredit, RepairOrder, RepairWork } from "./repair";
import {
  BuilderConstruction,
  CONSTRUCTION_CLEARANCE_TICKS,
  CONSTRUCTION_REFUSALS,
  ConstructionApproach,
  ConstructionBuilder,
  ConstructionPayment,
  ConstructionProgress,
  ConstructionRequest,
} from "./sites";
import { CONSTRUCTION_WORK_STATES, workPositions } from "./work";

export function prepareConstructionValidation(context: CanonicalValidation): () => void {
  const { world, rows, has, actor, kernel, forces, seats, point } = context;
  const kits = new Set(rows(KitStructure));
  return () => {
    for (const id of kits)
      if (world.isAlive(id))
        check(has(id, KitStructure), `kit structure ${id} lost its initialization marker`);
    for (const id of rows(Template)) {
      const definition = actor(id);
      check(
        [BuilderConstruction, RepairOrder, SalvageOrder].filter((component) => has(id, component))
          .length <= 1,
        `worker ${id} has conflicting work orders`,
      );
      if (definition.id.includes("structure:"))
        check(
          has(id, KitStructure) || has(id, ConstructionPayment),
          `structure ${id} has no initialization or payment provenance`,
        );
    }
    for (const id of rows(ConstructionSite)) {
      const definition = actor(id);
      check(
        definition.footprint &&
          definition.construction &&
          has(id, ConstructionProgress) &&
          has(id, ConstructionPayment),
        `site ${id} lacks its structure, progress or receipt`,
      );
    }
    for (const id of rows(ConstructionPayment)) {
      const definition = actor(id),
        cost = definition.construction?.cost;
      check(
        definition.footprint && cost && !has(id, KitStructure),
        `receipt ${id} has no constructed structure`,
      );
      for (const [resource, field] of [
        ["credits", "credits"],
        ["materials", "materials"],
        ["industrial-capacity", "industrialCapacity"],
        ["salvage-points", "salvagePoints"],
      ] as const)
        check(
          world.get(id, ConstructionPayment, field) === (cost[resource] ?? 0),
          `receipt ${id} changed its paid ${resource}`,
        );
    }
    for (const id of rows(ConstructionProgress)) {
      const definition = actor(id);
      check(has(id, ConstructionSite) && definition.construction, `progress ${id} has no site`);
      check(
        world.get(id, ConstructionProgress, "quarter") < 4 &&
          world.get(id, ConstructionProgress, "completedTicks") <=
            definition.construction.buildTicks,
        `site ${id} has invalid work`,
      );
    }
    for (const id of rows(KitStructure)) {
      check(kits.has(id), `structure ${id} forged an initialization marker`);
      check(actor(id).footprint && !has(id, ConstructionSite), `kit structure ${id} is invalid`);
    }
    for (const id of rows(ConstructionRequest)) {
      const definition = context.definition(world.get(id, ConstructionRequest, "definition"));
      const status = world.get(id, ConstructionRequest, "status"),
        deadline = world.get(id, ConstructionRequest, "deadline");
      check(
        !has(id, Template) && definition.footprint && definition.construction,
        `request ${id} has an invalid structure`,
      );
      check(
        forces.has(world.get(id, ConstructionRequest, "force")) &&
          seats.has(world.get(id, ConstructionRequest, "seat")),
        `request ${id} has an unknown owner`,
      );
      check(
        status <= 1 && world.get(id, ConstructionRequest, "reason") < CONSTRUCTION_REFUSALS.length,
        `request ${id} has an invalid status`,
      );
      check(
        deadline <= kernel.tick + CONSTRUCTION_CLEARANCE_TICKS &&
          (status !== 0 || deadline >= kernel.tick),
        `request ${id} has an invalid deadline`,
      );
      check(
        point(world.get(id, ConstructionRequest, "x"), world.get(id, ConstructionRequest, "y")),
        `request ${id} is outside the map`,
      );
    }
    const links = new Set<string>();
    for (const id of rows(ConstructionBuilder)) {
      const request = world.get(id, ConstructionBuilder, "request"),
        builder = world.get(id, ConstructionBuilder, "builder"),
        key = `${request}:${builder}`;
      check(
        !has(id, Template) &&
          has(request, ConstructionRequest) &&
          world.wasAllocated(builder) &&
          !links.has(key),
        `construction link ${id} is invalid`,
      );
      check(
        world.get(request, ConstructionRequest, "status") === 0,
        `construction link ${id} belongs to a refused request`,
      );
      if (world.isAlive(builder))
        check(actor(builder).role === "builder", `construction link ${id} has no builder`);
      links.add(key);
    }
    for (const id of rows(BuilderConstruction)) {
      check(actor(id).role === "builder", `construction order ${id} has no builder`);
      const target = world.get(id, BuilderConstruction, "target");
      check(
        world.wasAllocated(target) &&
          (!world.isAlive(target) ||
            has(target, ConstructionRequest) ||
            has(target, ConstructionSite)),
        `builder ${id} has an invalid construction target`,
      );
    }
    for (const id of rows(ConstructionApproach)) {
      check(actor(id).role === "builder", `approach ${id} has no builder`);
      const site = world.get(id, ConstructionApproach, "site");
      check(
        world.wasAllocated(site) &&
          world.get(id, ConstructionApproach, "state") < CONSTRUCTION_WORK_STATES.length,
        `approach ${id} is invalid`,
      );
      const jobs = [BuilderConstruction, RepairOrder, SalvageOrder].filter((component) =>
        has(id, component),
      );
      check(
        jobs.length === 1 && world.get(id, jobs[0]!, "target") === site,
        `approach ${id} disagrees with its work order`,
      );
      check(
        point(
          world.get(id, ConstructionApproach, "originX"),
          world.get(id, ConstructionApproach, "originY"),
        ),
        `approach ${id} has an invalid origin`,
      );
      if (world.isAlive(site)) {
        check(
          has(site, Transform) && (has(site, Template) || has(site, Remains)),
          `approach ${id} has no spatial work target`,
        );
        if (world.get(id, ConstructionApproach, "next") > 0)
          check(
            workPositions(kernel, context.setup.definitions, id, site).some(
              (position) =>
                position.x === world.get(id, ConstructionApproach, "x") &&
                position.y === world.get(id, ConstructionApproach, "y"),
            ),
            `approach ${id} has an invalid work point`,
          );
      }
    }
    for (const id of rows(RepairOrder)) {
      check(
        actor(id).repair && has(id, RepairWork) && seats.has(world.get(id, RepairOrder, "seat")),
        `repair order ${id} has an invalid builder or seat`,
      );
      check(
        world.wasAllocated(world.get(id, RepairOrder, "target")) &&
          world.get(id, RepairOrder, "state") < REPAIR_STATES.length,
        `repair order ${id} has an invalid state`,
      );
      const target = world.get(id, RepairOrder, "target");
      check(
        !world.isAlive(target) || has(target, RepairCredit),
        `repair target ${target} lost its credit ledger`,
      );
    }
    for (const id of rows(RepairWork))
      check(
        actor(id).repair && world.get(id, RepairWork, "remainder") < 20000,
        `repair work ${id} is invalid`,
      );
    for (const id of rows(RepairCredit)) {
      const definition = actor(id);
      check(
        definition.footprint &&
          definition.health > 0 &&
          world.get(id, RepairCredit, "carry") < definition.health,
        `repair credit ${id} is invalid`,
      );
    }
  };
}
