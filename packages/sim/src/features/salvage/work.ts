import { hasGrant } from "../../commands";
import type { Feature, Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearAttackOrder } from "../combat";
import { suspendRepair } from "../construction/repair";
import { ConstructionApproach, clearConstructionOrder } from "../construction/sites";
import { approachStructure } from "../construction/work";
import { suspendHarvesting } from "../economy/harvesting";
import { Health, OwnerForce, Template, Transform } from "../entities";
import { MoveIntent } from "../movement";
import { Remains, SALVAGE_STATES, SalvageOrder, suspendSalvage } from ".";

/** Provisional five-second single-builder clearance; all progress lives on the finite remains row. */
export const SALVAGE_WORK = 400;

export function salvageFeature({
  definitions,
  grants,
}: Pick<MatchSetup, "definitions" | "grants">): Feature {
  const builder = (kernel: Kernel, id: number) => {
    const { world } = kernel;
    return (
      world.isAlive(id) &&
      world.has(id, Template) &&
      world.has(id, OwnerForce) &&
      world.has(id, Transform) &&
      world.has(id, Health) &&
      world.get(id, Health, "current") > 0 &&
      definitions[world.get(id, Template, "definition")]?.role === "builder" &&
      definitions[world.get(id, Template, "definition")]?.id.split(":")[0]?.split(".").at(-1) ===
        "unit"
    );
  };
  const permitted = (kernel: Kernel, id: number) =>
    hasGrant(
      grants,
      kernel.world.get(id, SalvageOrder, "seat"),
      kernel.world.get(id, OwnerForce, "force"),
      "economy.build",
      kernel.tick,
    );
  const state = (kernel: Kernel, id: number, value: (typeof SALVAGE_STATES)[number]) =>
    kernel.world.set(id, SalvageOrder, "state", SALVAGE_STATES.indexOf(value));
  return {
    handlers: {
      "economy.salvage": (kernel, { seat, payload: { entity, builders } }) => {
        const { world } = kernel;
        if (
          !kernel.remains?.canSee(seat, entity) ||
          !builders.length ||
          new Set(builders).size !== builders.length ||
          !builders.every((id) => builder(kernel, id))
        )
          return "bad_payload";
        const force = world.get(builders[0]!, OwnerForce, "force");
        if (!builders.every((id) => world.get(id, OwnerForce, "force") === force))
          return "bad_payload";
        if (!hasGrant(grants, seat, force, "economy.build", kernel.tick)) return "no_grant";
        for (const id of [...builders].sort((a, b) => a - b)) {
          kernel.transport?.cancel(id);
          clearAttackOrder(kernel, id);
          suspendHarvesting(kernel, id);
          suspendRepair(kernel, id);
          suspendSalvage(kernel, id);
          clearConstructionOrder(kernel, id);
          world.add(id, SalvageOrder, { target: entity, seat });
        }
      },
    },
    systems: {
      control: [
        (kernel) => {
          const { world } = kernel;
          kernel.movement?.refreshOccupancy();
          for (const id of world.query(SalvageOrder)) {
            const target = world.get(id, SalvageOrder, "target");
            if (
              !builder(kernel, id) ||
              !kernel.remains?.canSee(world.get(id, SalvageOrder, "seat"), target)
            ) {
              suspendSalvage(kernel, id);
              continue;
            }
            if (!permitted(kernel, id)) {
              clearConstructionOrder(kernel, id);
              state(kernel, id, "grant");
              continue;
            }
            if (kernel.disabled?.(id)) continue;
            approachStructure(kernel, definitions, id, target);
            world.set(id, SalvageOrder, "state", world.get(id, ConstructionApproach, "state"));
          }
        },
      ],
      economy: [
        (kernel) => {
          const { world } = kernel;
          for (const target of world.query(Remains)) {
            const workers = world
              .query(SalvageOrder, ConstructionApproach)
              .filter(
                (id) =>
                  world.get(id, SalvageOrder, "target") === target &&
                  builder(kernel, id) &&
                  permitted(kernel, id) &&
                  kernel.remains?.canSee(world.get(id, SalvageOrder, "seat"), target) &&
                  !kernel.disabled?.(id) &&
                  world.get(id, ConstructionApproach, "state") === 1 &&
                  !world.has(id, MoveIntent) &&
                  world.get(id, Transform, "x") === world.get(id, ConstructionApproach, "x") &&
                  world.get(id, Transform, "y") === world.get(id, ConstructionApproach, "y"),
              );
            if (!workers.length) continue;
            // Canonical ID order chooses one Force; opposing builders never combine work or duplicate income.
            const force = world.get(workers[0]!, OwnerForce, "force");
            const assisting = workers.filter((id) => world.get(id, OwnerForce, "force") === force);
            for (const id of workers)
              state(kernel, id, assisting.includes(id) ? "working" : "contested");
            const count = assisting.length;
            const rate = count === 1 ? 4 : count === 2 ? 7 : count + 6;
            const work = Math.min(SALVAGE_WORK, world.get(target, Remains, "work") + rate);
            world.set(target, Remains, "work", work);
            if (work < SALVAGE_WORK) continue;
            const materials = world.get(target, Remains, "materials");
            if (materials && !kernel.economy?.gain(force, { materials }).ok) {
              for (const id of assisting) state(kernel, id, "storage");
              continue;
            }
            for (const id of world.query(SalvageOrder))
              if (world.get(id, SalvageOrder, "target") === target) suspendSalvage(kernel, id);
            world.destroy(target);
            kernel.movement?.refreshOccupancy();
          }
        },
      ],
    },
  };
}
