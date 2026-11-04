import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { ConstructionSite } from "../construction";
import { Health, Template, Transform } from "../entities";
import {
  PRODUCTION_QUEUE_LIMIT,
  PRODUCTION_STATUSES,
  ProductionGifts,
  ProductionItem,
  ProductionRally,
  productionUnitSupported,
} from ".";

export function validateProductionState(context: CanonicalValidation): void {
  const { world, rows, has, actor, forces, seats } = context;
  const queues = new Map<number, number>();
  const slots = new Set<string>();
  for (const id of rows(Template)) {
    const definition = actor(id);
    if (
      context.kernel.tick > 0 &&
      has(id, Transform) &&
      world.get(id, Health, "current") > 0 &&
      !has(id, ConstructionSite) &&
      definition.exits?.length &&
      definition.spawnsWith?.length &&
      definition.spawnsWith.every((unit) =>
        productionUnitSupported(context.setup.definitions.find((entry) => entry.id === unit)),
      )
    )
      check(has(id, ProductionGifts), `producer ${id} lost its once-only gift marker`);
  }
  for (const id of rows(ProductionItem)) {
    const unit = context.definition(world.get(id, ProductionItem, "definition"));
    const producer = world.get(id, ProductionItem, "producer"),
      state = world.get(id, ProductionItem, "state"),
      gift = world.get(id, ProductionItem, "gift");
    check(
      !has(id, Template) &&
        world.wasAllocated(producer) &&
        unit.id.includes("unit:") &&
        unit.domain &&
        unit.domain !== "air" &&
        unit.pop !== undefined &&
        unit.radiusSubcells !== undefined,
      `production item ${id} has an unsupported unit or producer`,
    );
    check(
      state <= 3 &&
        gift <= 1 &&
        world.get(id, ProductionItem, "status") < PRODUCTION_STATUSES.length,
      `production item ${id} has an invalid state`,
    );
    check(
      forces.has(world.get(id, ProductionItem, "force")),
      `production item ${id} has an unknown Force`,
    );
    const seat = world.get(id, ProductionItem, "seat"),
      slot = world.get(id, ProductionItem, "slot");
    check(
      gift ? seat === 0 && state === 2 && slot === 0 : seats.has(seat) && !!unit.construction,
      `production item ${id} has an invalid payer or gift`,
    );
    const completed = world.get(id, ProductionItem, "completedTicks"),
      remainder = world.get(id, ProductionItem, "remainder");
    check(
      completed <= (unit.construction?.buildTicks ?? 0) && remainder < 1000,
      `production item ${id} has invalid work`,
    );
    if (state === 0 || gift)
      check(
        completed === 0 && remainder === 0 && slot === 0,
        `unpaid/gift item ${id} has paid work`,
      );
    if (state === 2 && !gift)
      check(
        completed === unit.construction?.buildTicks && remainder === 0,
        `production item ${id} is not complete`,
      );
    if (state !== 0 && !gift) check(slot > 0, `paid production item ${id} has no active slot`);
    for (const [resource, field] of [
      ["credits", "credits"],
      ["materials", "materials"],
      ["industrial-capacity", "industrialCapacity"],
      ["salvage-points", "salvagePoints"],
    ] as const)
      check(
        world.get(id, ProductionItem, field) ===
          (gift || state === 0 ? 0 : (unit.construction?.cost[resource] ?? 0)),
        `production item ${id} changed its ${resource} receipt`,
      );
    if (!gift) {
      const size = (queues.get(producer) ?? 0) + 1;
      queues.set(producer, size);
      check(size <= PRODUCTION_QUEUE_LIMIT, `producer ${producer} exceeds its queue limit`);
    }
    if (world.isAlive(producer)) {
      const definition = actor(producer);
      check(
        definition.footprint &&
          (gift
            ? definition.spawnsWith?.includes(unit.id)
            : definition.produces?.includes(unit.id)),
        `production item ${id} is not in its producer's recipes`,
      );
      if (!gift && state !== 0 && state !== 3) {
        check(
          slot <= (definition.productionSlots ?? 1),
          `production item ${id} has an invalid slot`,
        );
        const key = `${producer}:${slot}`;
        check(!slots.has(key), `producer ${producer} has duplicate active slots`);
        slots.add(key);
      }
    }
    // Dead producers can leave proven refund rows while their Force bank cannot accept them.
  }
  for (const id of rows(ProductionGifts))
    check(actor(id).spawnsWith?.length, `gift marker ${id} has no authored gift`);
  for (const id of rows(ProductionRally)) {
    const definition = actor(id);
    check(
      definition.produces?.length || definition.spawnsWith?.length,
      `rally ${id} has no producer`,
    );
    const x = world.get(id, ProductionRally, "x"),
      y = world.get(id, ProductionRally, "y");
    // Command bounds allow off-map rally goals; navigation resolves map-local endpoints later.
    check(x >= 0 && y >= 0 && x < 1 << 19 && y < 1 << 19, `rally ${id} is outside command bounds`);
  }
}
