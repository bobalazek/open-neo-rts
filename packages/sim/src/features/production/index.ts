// Bounded per-structure unit queues, paid receipts, legal exits and point rally. Phase 2.
import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import type { Feature, Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import { ConstructionSite } from "../construction";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { perimeterPoint } from "../entities/perimeter";

export const PRODUCTION_QUEUE_LIMIT = 5;
export const PRODUCTION_STATUSES = [
  "queued",
  "active",
  "brownout",
  "disabled",
  "funds",
  "population",
  "grant",
  "requirements",
  "exit",
  "refund",
] as const;
/** Separate rows survive producer destruction, retaining the proven paid Force and full receipt. */
export const ProductionItem = defineComponent("ProductionItem", {
  producer: "u32",
  force: "u32",
  seat: "u32",
  definition: "u32",
  slot: "u8",
  gift: "u8",
  state: "u8",
  status: "u8",
  completedTicks: "u32",
  remainder: "u16",
  credits: "i32",
  materials: "i32",
  industrialCapacity: "i32",
  salvagePoints: "i32",
});
export const ProductionGifts = defineComponent("ProductionGifts", {});
export const ProductionRally = defineComponent("ProductionRally", { x: "i32", y: "i32" });
const kind = (definition: Definition) => definition.id.split(":")[0]?.split(".").at(-1);
const stockFields = {
  credits: "credits",
  materials: "materials",
  "industrial-capacity": "industrialCapacity",
  "salvage-points": "salvagePoints",
} as const;
const live = (kernel: Kernel, id: number) =>
  kernel.world.isAlive(id) &&
  kernel.world.has(id, Health) &&
  kernel.world.get(id, Health, "current") > 0;

/** The exact paid receipt is shared with atomic structure sales; waiting items and gifts paid nothing. */
export function productionReceipt(kernel: Kernel, id: number) {
  return Object.fromEntries(
    Object.entries(stockFields).map(([resource, field]) => [
      resource,
      kernel.world.get(id, ProductionItem, field),
    ]),
  ) as import("../economy/bank").StockBalances;
}

/** Select only authored exits. Navigation/occupancy can delay output, never send it to another side. */
function exitPoint(
  kernel: Kernel,
  definitions: readonly Definition[],
  producer: number,
  unitIndex: number,
) {
  const world = kernel.world,
    building = definitions[world.get(producer, Template, "definition")] as Definition;
  const unit = definitions[unitIndex] as Definition,
    radius = unit.radiusSubcells as number;
  for (const exit of building.exits ?? []) {
    const point = perimeterPoint(
      building,
      {
        x: world.get(producer, Transform, "x"),
        y: world.get(producer, Transform, "y"),
        facing: world.get(producer, Transform, "facing"),
      },
      exit,
      radius,
    );
    if (!kernel.movement?.canStandDefinition(unitIndex, point)) continue;
    const blocked = world.query(Template, Transform, Health).some((id) => {
      const other = definitions[world.get(id, Template, "definition")];
      if (!other || kind(other) !== "unit" || !live(kernel, id)) return false;
      const x = world.get(id, Transform, "x") - point.x,
        y = world.get(id, Transform, "y") - point.y;
      const size = radius + (other.radiusSubcells ?? 0);
      return (x === 0 && y === 0) || x * x + y * y < size * size;
    });
    if (!blocked) return point;
  }
}

/** Closures contain immutable setup only; all queues, work, receipts and once-only flags are ECS state. */
export function productionFeature(
  setup: Pick<MatchSetup, "definitions" | "grants" | "normal">,
): Feature {
  const { definitions, grants } = setup;
  const definitionOf = (kernel: Kernel, entity: number) =>
    definitions[kernel.world.get(entity, Template, "definition")];
  const complete = (kernel: Kernel, producer: number) =>
    live(kernel, producer) &&
    kernel.world.has(producer, Template) &&
    kernel.world.has(producer, OwnerForce) &&
    !kernel.world.has(producer, ConstructionSite);
  const unitValid = (definition: Definition | undefined) =>
    !!definition &&
    kind(definition) === "unit" &&
    definition.pop !== undefined &&
    definition.domain !== undefined &&
    definition.domain !== "air" &&
    definition.radiusSubcells !== undefined;
  const items = (kernel: Kernel, producer: number) =>
    kernel.world
      .query(ProductionItem)
      .filter((id) => kernel.world.get(id, ProductionItem, "producer") === producer);
  const status = (kernel: Kernel, id: number, value: (typeof PRODUCTION_STATUSES)[number]) =>
    kernel.world.set(id, ProductionItem, "status", PRODUCTION_STATUSES.indexOf(value));
  const populationFits = (kernel: Kernel, force: number, unit: Definition) => {
    let population = 0;
    const cap = setup.normal?.settings.popCap ?? 0;
    for (const id of kernel.world.query(Template, OwnerForce, Health)) {
      const definition = definitionOf(kernel, id);
      if (
        definition &&
        kind(definition) === "unit" &&
        live(kernel, id) &&
        kernel.world.get(id, OwnerForce, "force") === force
      ) {
        if (definition.pop === undefined) return false;
        population += definition.pop;
        if (population > cap) return false;
      }
    }
    return population + (unit.pop as number) <= cap;
  };
  const prerequisites = (kernel: Kernel, force: number, unit: Definition) =>
    (unit.requires ?? []).every((required) =>
      kernel.world
        .query(Template, OwnerForce, Health)
        .some(
          (entity) =>
            complete(kernel, entity) &&
            kernel.world.get(entity, OwnerForce, "force") === force &&
            definitionOf(kernel, entity)?.id === required,
        ),
    );
  function refund(kernel: Kernel, id: number) {
    const world = kernel.world;
    if (
      world.get(id, ProductionItem, "gift") === 1 ||
      world.get(id, ProductionItem, "state") === 0
    ) {
      world.destroy(id);
      return true;
    }
    world.set(id, ProductionItem, "state", 3);
    status(kernel, id, "refund");
    if (
      !kernel.economy?.refund(world.get(id, ProductionItem, "force"), productionReceipt(kernel, id))
        .ok
    )
      return false;
    world.destroy(id);
    return true;
  }
  function createItem(
    kernel: Kernel,
    producer: number,
    definition: number,
    seat: number,
    gift = 0,
  ) {
    const id = kernel.world.create();
    kernel.world.add(id, ProductionItem, {
      producer,
      definition,
      seat,
      gift,
      force: kernel.world.get(producer, OwnerForce, "force"),
      state: gift ? 2 : 0,
    });
  }
  function output(kernel: Kernel, id: number, producer: number, unit: Definition) {
    const world = kernel.world,
      force = world.get(id, ProductionItem, "force");
    if (!populationFits(kernel, force, unit)) {
      status(kernel, id, "population");
      return;
    }
    const index = world.get(id, ProductionItem, "definition");
    const point = exitPoint(kernel, definitions, producer, index);
    if (!point) {
      status(kernel, id, "exit");
      return;
    }
    const spawned = spawnEntity(kernel, index, unit, { definition: unit.id, force, ...point });
    kernel.statistics?.record(force, "unitsBuilt");
    // Harvesting orders belong to logistics; a harvester never inherits a combat point rally.
    if (world.has(producer, ProductionRally) && unit.role !== "harvester")
      kernel.movement?.order(spawned, {
        x: world.get(producer, ProductionRally, "x"),
        y: world.get(producer, ProductionRally, "y"),
      });
    world.destroy(id);
  }
  function tick(kernel: Kernel) {
    const world = kernel.world;
    for (const id of world.query(ProductionItem)) {
      const producer = world.get(id, ProductionItem, "producer");
      if (
        world.get(id, ProductionItem, "state") === 3 ||
        !live(kernel, producer) ||
        !world.has(producer, OwnerForce) ||
        world.get(producer, OwnerForce, "force") !== world.get(id, ProductionItem, "force")
      )
        refund(kernel, id);
    }
    // Enqueue IDs retain server order across producers; unpaid FIFO heads block only their own queue.
    for (const id of world.query(ProductionItem)) {
      if (
        world.get(id, ProductionItem, "state") !== 0 ||
        world.get(id, ProductionItem, "gift") === 1
      )
        continue;
      const producer = world.get(id, ProductionItem, "producer");
      if (!complete(kernel, producer)) continue;
      const queued = items(kernel, producer);
      if (queued.some((other) => other < id && world.get(other, ProductionItem, "state") === 0))
        continue;
      status(kernel, id, "queued");
      const definition = definitionOf(kernel, producer) as Definition;
      let slot = 1;
      while (
        slot <= (definition.productionSlots ?? 1) &&
        queued.some(
          (other) =>
            world.get(other, ProductionItem, "slot") === slot &&
            world.get(other, ProductionItem, "state") !== 3,
        )
      )
        slot++;
      if (slot > (definition.productionSlots ?? 1)) continue;
      const force = world.get(id, ProductionItem, "force"),
        unit = definitions[world.get(id, ProductionItem, "definition")] as Definition;
      if (!definition.produces?.includes(unit.id) || !prerequisites(kernel, force, unit)) {
        status(kernel, id, "requirements");
        continue;
      }
      if (!populationFits(kernel, force, unit)) {
        status(kernel, id, "population");
        continue;
      }
      if ((kernel.power?.productionPerMille(producer) ?? 0) === 0) {
        status(kernel, id, "disabled");
        continue;
      }
      const paid = kernel.economy?.spend(
        world.get(id, ProductionItem, "seat"),
        force,
        unit.construction?.cost,
        "production.queue",
      );
      if (!paid?.ok) {
        status(kernel, id, paid?.reason === "no_grant" ? "grant" : "funds");
        continue;
      }
      for (const [resource, field] of Object.entries(stockFields))
        world.set(
          id,
          ProductionItem,
          field,
          unit.construction?.cost[resource as keyof typeof stockFields] ?? 0,
        );
      world.set(id, ProductionItem, "slot", slot);
      world.set(id, ProductionItem, "state", 1);
    }
    kernel.movement?.refreshOccupancy();
    for (const producer of world.query(Template, OwnerForce, Transform, Health)) {
      if (!complete(kernel, producer)) continue;
      const definition = definitionOf(kernel, producer) as Definition;
      const force = world.get(producer, OwnerForce, "force");
      if (
        definition.spawnsWith?.length &&
        !world.has(producer, ProductionGifts) &&
        definition.exits?.length &&
        definition.spawnsWith.every((id) => unitValid(definitions.find((unit) => unit.id === id)))
      ) {
        world.add(producer, ProductionGifts);
        for (const unit of definition.spawnsWith)
          createItem(
            kernel,
            producer,
            definitions.findIndex((entry) => entry.id === unit),
            0,
            1,
          );
      }
      for (const id of items(kernel, producer))
        if (world.get(id, ProductionItem, "gift") === 1)
          output(
            kernel,
            id,
            producer,
            definitions[world.get(id, ProductionItem, "definition")] as Definition,
          );
      if (!definition.produces?.length) continue;
      const slots = definition.productionSlots ?? 1;
      for (let slot = 1; slot <= slots; slot++) {
        const id = items(kernel, producer).find(
          (id) =>
            world.get(id, ProductionItem, "slot") === slot &&
            world.get(id, ProductionItem, "state") !== 3,
        );
        if (id === undefined) continue;
        const unit = definitions[world.get(id, ProductionItem, "definition")] as Definition;
        if (!populationFits(kernel, force, unit)) {
          status(kernel, id, "population");
          continue;
        }
        const rate = kernel.power?.productionPerMille(producer) ?? 0;
        if (rate === 0) {
          status(kernel, id, "disabled");
          continue;
        }
        if (world.get(id, ProductionItem, "state") === 1) {
          const duration = unit.construction?.buildTicks as number;
          const completed = world.get(id, ProductionItem, "completedTicks"),
            remainder = world.get(id, ProductionItem, "remainder");
          if (rate >= (duration - completed) * 1000 - remainder) {
            world.set(id, ProductionItem, "completedTicks", duration);
            world.set(id, ProductionItem, "remainder", 0);
            world.set(id, ProductionItem, "state", 2);
          } else {
            world.set(
              id,
              ProductionItem,
              "completedTicks",
              completed + Math.floor((remainder + rate) / 1000),
            );
            world.set(id, ProductionItem, "remainder", (remainder + rate) % 1000);
          }
        }
        status(kernel, id, rate === 500 ? "brownout" : "active");
        if (world.get(id, ProductionItem, "state") === 2) output(kernel, id, producer, unit);
      }
    }
  }
  return {
    components: [ProductionItem, ProductionGifts, ProductionRally],
    handlers: {
      "production.enqueue": (kernel, { seat, payload: { entity, definition: requested } }) => {
        if (!complete(kernel, entity)) return "bad_payload";
        const world = kernel.world,
          force = world.get(entity, OwnerForce, "force");
        if (!hasGrant(grants, seat, force, "production.queue", kernel.tick)) return "no_grant";
        const producer = definitionOf(kernel, entity),
          index = definitions.findIndex((definition) => definition.id === requested),
          unit = definitions[index];
        if (
          !producer?.exits?.length ||
          !producer.produces?.includes(requested) ||
          !unitValid(unit) ||
          !unit?.construction
        )
          return "bad_payload";
        if (
          items(kernel, entity).filter((id) => world.get(id, ProductionItem, "gift") === 0)
            .length >= PRODUCTION_QUEUE_LIMIT
        )
          return "queue_full";
        createItem(kernel, entity, index, seat);
      },
      "production.cancel": (kernel, { seat, payload: { item } }) => {
        const world = kernel.world;
        if (
          !world.isAlive(item) ||
          !world.has(item, ProductionItem) ||
          world.get(item, ProductionItem, "gift") === 1
        )
          return "bad_payload";
        if (
          !hasGrant(
            grants,
            seat,
            world.get(item, ProductionItem, "force"),
            "production.queue",
            kernel.tick,
          )
        )
          return "no_grant";
        refund(kernel, item);
      },
      "production.rally": (kernel, { seat, payload: { entity, x, y } }) => {
        if (!complete(kernel, entity)) return "bad_payload";
        const world = kernel.world,
          definition = definitionOf(kernel, entity);
        if (
          !hasGrant(
            grants,
            seat,
            world.get(entity, OwnerForce, "force"),
            "production.queue",
            kernel.tick,
          )
        )
          return "no_grant";
        if (!definition?.produces?.length && !definition?.spawnsWith?.length) return "bad_payload";
        if (world.has(entity, ProductionRally)) {
          world.set(entity, ProductionRally, "x", x);
          world.set(entity, ProductionRally, "y", y);
        } else world.add(entity, ProductionRally, { x, y });
      },
    },
    systems: {
      economy: [tick],
      destruction: [
        (kernel) => {
          for (const id of kernel.world.query(ProductionItem))
            if (!live(kernel, kernel.world.get(id, ProductionItem, "producer"))) refund(kernel, id);
        },
      ],
    },
  };
}
