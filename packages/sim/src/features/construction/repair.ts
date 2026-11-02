import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import type { Feature, Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearAttackOrder } from "../combat";
import type { BankSnapshot, StockBalances } from "../economy/bank";
import { suspendHarvesting } from "../economy/harvesting";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import { MoveIntent } from "../movement";
import { ProductionItem, productionReceipt } from "../production";
import { ConstructionSite } from ".";
import { ConstructionApproach, ConstructionPayment, clearConstructionOrder } from "./sites";
import { approachStructure } from "./work";

/** Only initialization grants the authored-price fallback; arbitrary completed spawns get no refund. */
export const KitStructure = defineComponent("KitStructure", {});
export const REPAIR_STATES = ["approaching", "working", "blocked", "funds", "grant"] as const;
export const RepairOrder = defineComponent("RepairOrder", {
  target: "u32",
  seat: "u32",
  state: "u8",
});
/** Fractional health work survives stop/replacement; it is never rounded up into free health. */
export const RepairWork = defineComponent("RepairWork", { remainder: "u16" });
/** Prepaid fractions of one credit, in target-max-health units. Kept across orders and full health. */
export const RepairCredit = defineComponent("RepairCredit", { carry: "u32", working: "u32" });
const fields = {
  credits: "credits",
  materials: "materials",
  "industrial-capacity": "industrialCapacity",
  "salvage-points": "salvagePoints",
} as const;
const live = (kernel: Kernel, id: number) =>
  kernel.world.isAlive(id) &&
  kernel.world.has(id, Health) &&
  kernel.world.get(id, Health, "current") > 0;
const kind = (definition: Definition) => definition.id.split(":")[0]?.split(".").at(-1);

/** Accepted replacement orders only. Fractional work and target prepayment remain canonical. */
export function suspendRepair(kernel: Kernel, builder: number): void {
  if (!kernel.world.has(builder, RepairOrder)) return;
  clearConstructionOrder(kernel, builder);
  kernel.world.remove(builder, RepairOrder);
}

function investment(
  kernel: Kernel,
  entity: number,
  definition: Definition,
): StockBalances | undefined {
  const world = kernel.world;
  if (world.has(entity, ConstructionPayment))
    return Object.fromEntries(
      Object.entries(fields).map(([resource, field]) => [
        resource,
        world.get(entity, ConstructionPayment, field),
      ]),
    ) as StockBalances;
  if (!world.has(entity, KitStructure) || !definition.construction) return;
  return Object.fromEntries(
    Object.keys(fields).map((resource) => [
      resource,
      definition.construction?.cost[resource as keyof typeof fields] ?? 0,
    ]),
  ) as StockBalances;
}

/** Paid adjacent structure repair only; other repair targets/ranges and autocast remain later features. */
export function structureRepairFeature(setup: Pick<MatchSetup, "definitions" | "grants">): Feature {
  const { definitions, grants } = setup;
  const definitionOf = (kernel: Kernel, id: number) =>
    definitions[kernel.world.get(id, Template, "definition")];
  const complete = (kernel: Kernel, id: number) =>
    live(kernel, id) &&
    kernel.world.has(id, Template) &&
    kernel.world.has(id, OwnerForce) &&
    kernel.world.has(id, Transform) &&
    !kernel.world.has(id, ConstructionSite) &&
    kind(definitionOf(kernel, id) as Definition) === "structure";
  const compatible = (unit: Definition, target: Definition) => {
    const repair = unit.repair;
    return (
      kind(unit) === "unit" &&
      unit.role === "builder" &&
      !!repair &&
      repair.rateMilliHealthPerSecond > 0 &&
      (repair.costPerMille ?? 0) > 0 &&
      (repair.rangeSubcells ?? 0) === 0 &&
      repair.targets.structures !== false &&
      repair.targets.families.length === 0 &&
      (!repair.targets.roles.length || repair.targets.roles.includes(target.role ?? "")) &&
      (!repair.targets.tags.length || repair.targets.tags.some((tag) => target.tags?.includes(tag)))
    );
  };
  function clearTarget(kernel: Kernel, target: number) {
    for (const id of kernel.world.query(RepairOrder))
      if (kernel.world.get(id, RepairOrder, "target") === target) suspendRepair(kernel, id);
  }
  return {
    components: [KitStructure, RepairOrder, RepairWork, RepairCredit],
    handlers: {
      "economy.cancelRepair": (kernel, { seat, payload: { entity } }) => {
        if (!complete(kernel, entity)) return "bad_payload";
        if (
          !hasGrant(
            grants,
            seat,
            kernel.world.get(entity, OwnerForce, "force"),
            "economy.build",
            kernel.tick,
          )
        )
          return "no_grant";
        clearTarget(kernel, entity);
      },
      "economy.sell": (kernel, { seat, payload: { entity } }) => {
        if (!complete(kernel, entity)) return "bad_payload";
        const world = kernel.world,
          force = world.get(entity, OwnerForce, "force");
        if (!hasGrant(grants, seat, force, "economy.build", kernel.tick)) return "no_grant";
        const cost = investment(kernel, entity, definitionOf(kernel, entity) as Definition);
        if (!cost) return "bad_payload";
        const items = world
          .query(ProductionItem)
          .filter((id) => world.get(id, ProductionItem, "producer") === entity);
        const payments: BankSnapshot[] = [
          {
            force,
            resources: Object.fromEntries(
              Object.entries(cost).map(([resource, amount]) => [resource, Math.floor(amount / 2)]),
            ) as StockBalances,
          },
        ];
        for (const id of items)
          if (
            world.get(id, ProductionItem, "gift") === 0 &&
            world.get(id, ProductionItem, "state") !== 0
          )
            payments.push({
              force: world.get(id, ProductionItem, "force"),
              resources: productionReceipt(kernel, id),
            });
        // No structure, order or queue mutation until every original Force can receive the full receipt.
        if (!kernel.economy?.refundBatch(payments).ok) return "bad_payload";
        for (const id of items) world.destroy(id);
        clearTarget(kernel, entity);
        world.destroy(entity);
      },
      "economy.repair": (kernel, { seat, payload: { entity, builders } }) => {
        if (!complete(kernel, entity)) return "bad_payload";
        const world = kernel.world,
          force = world.get(entity, OwnerForce, "force"),
          target = definitionOf(kernel, entity) as Definition;
        if (!hasGrant(grants, seat, force, "economy.build", kernel.tick)) return "no_grant";
        if (
          !(investment(kernel, entity, target)?.credits ?? 0) ||
          world.get(entity, Health, "current") >= target.health ||
          new Set(builders).size !== builders.length ||
          !builders.every(
            (id) =>
              live(kernel, id) &&
              world.has(id, Template) &&
              world.has(id, OwnerForce) &&
              world.has(id, Transform) &&
              world.get(id, OwnerForce, "force") === force &&
              compatible(definitionOf(kernel, id) as Definition, target),
          )
        )
          return "bad_payload";
        for (const id of [...builders].sort((a, b) => a - b)) {
          clearAttackOrder(kernel, id);
          suspendHarvesting(kernel, id);
          suspendRepair(kernel, id);
          clearConstructionOrder(kernel, id);
          world.add(id, RepairOrder, { target: entity, seat });
          if (!world.has(id, RepairWork)) world.add(id, RepairWork);
        }
        if (!world.has(entity, RepairCredit)) world.add(entity, RepairCredit);
      },
    },
    systems: {
      control: [
        (kernel) => {
          const world = kernel.world;
          kernel.movement?.refreshOccupancy();
          for (const id of world.query(RepairOrder, Template, OwnerForce, Transform, Health)) {
            const target = world.get(id, RepairOrder, "target");
            if (
              !live(kernel, id) ||
              !complete(kernel, target) ||
              world.get(id, OwnerForce, "force") !== world.get(target, OwnerForce, "force") ||
              !compatible(
                definitionOf(kernel, id) as Definition,
                definitionOf(kernel, target) as Definition,
              ) ||
              world.get(target, Health, "current") >= (definitionOf(kernel, target)?.health ?? 0)
            ) {
              suspendRepair(kernel, id);
              continue;
            }
            if (
              !hasGrant(
                grants,
                world.get(id, RepairOrder, "seat"),
                world.get(id, OwnerForce, "force"),
                "economy.build",
                kernel.tick,
              )
            ) {
              clearConstructionOrder(kernel, id);
              world.set(id, RepairOrder, "state", REPAIR_STATES.indexOf("grant"));
              continue;
            }
            approachStructure(kernel, definitions, id, target);
            world.set(id, RepairOrder, "state", world.get(id, ConstructionApproach, "state"));
          }
        },
      ],
      economy: [
        (kernel) => {
          const world = kernel.world;
          for (const target of world.query(RepairCredit))
            world.set(target, RepairCredit, "working", 0);
          for (const id of world.query(
            RepairOrder,
            ConstructionApproach,
            RepairWork,
            Template,
            OwnerForce,
            Transform,
            Health,
          )) {
            if (!world.has(id, RepairOrder)) continue;
            const target = world.get(id, RepairOrder, "target");
            if (
              !live(kernel, id) ||
              !complete(kernel, target) ||
              world.get(id, OwnerForce, "force") !== world.get(target, OwnerForce, "force") ||
              world.get(id, ConstructionApproach, "state") !== 1 ||
              world.has(id, MoveIntent) ||
              world.get(id, Transform, "x") !== world.get(id, ConstructionApproach, "x") ||
              world.get(id, Transform, "y") !== world.get(id, ConstructionApproach, "y")
            )
              continue;
            const unit = definitionOf(kernel, id) as Definition,
              building = definitionOf(kernel, target) as Definition;
            const price = investment(kernel, target, building)?.credits;
            if (!price || !compatible(unit, building)) continue;
            const work =
              world.get(id, RepairWork, "remainder") +
              (unit.repair?.rateMilliHealthPerSecond as number);
            const health = Math.min(
              building.health - world.get(target, Health, "current"),
              Math.floor(work / 20_000),
            );
            if (health <= 0 && world.get(target, Health, "current") >= building.health) {
              clearTarget(kernel, target);
              continue;
            }
            // Ceil the authored full-repair price, then prepay cumulative fractional credits per target.
            // BigInt is transient: INT32_MAX prices/health never lose precision in multiplied ratios.
            const full =
              (BigInt(price) * BigInt(unit.repair?.costPerMille as number) + 999n) / 1000n;
            const numerator =
              BigInt(health) * full - BigInt(world.get(target, RepairCredit, "carry"));
            const credits =
              numerator <= 0n
                ? 0
                : Number((numerator + BigInt(building.health) - 1n) / BigInt(building.health));
            const paid = kernel.economy?.spend(
              world.get(id, RepairOrder, "seat"),
              world.get(id, OwnerForce, "force"),
              { credits },
              "economy.build",
            );
            if (!paid?.ok) {
              world.set(
                id,
                RepairOrder,
                "state",
                REPAIR_STATES.indexOf(paid?.reason === "no_grant" ? "grant" : "funds"),
              );
              continue;
            }
            world.set(id, RepairWork, "remainder", work % 20_000);
            world.set(
              target,
              RepairCredit,
              "carry",
              Number(BigInt(credits) * BigInt(building.health) - numerator),
            );
            world.set(
              target,
              RepairCredit,
              "working",
              world.get(target, RepairCredit, "working") + 1,
            );
            world.set(id, RepairOrder, "state", REPAIR_STATES.indexOf("working"));
            world.set(target, Health, "current", world.get(target, Health, "current") + health);
            if (world.get(target, Health, "current") === building.health)
              clearTarget(kernel, target);
          }
        },
      ],
    },
  };
}
