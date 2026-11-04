import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { Health, OwnerForce, Template, Transform } from "../entities";
import { MAX_REMAINS, Remains, SALVAGE_STATES, SalvageOrder } from ".";
import { SALVAGE_WORK } from "./work";

export function validateRemainsState(context: CanonicalValidation): void {
  const { world, rows, has, actor, forces, seats, kernel } = context;
  const remains = rows(Remains);
  check(remains.length <= MAX_REMAINS, "remains exceed their shared cap");
  for (const id of remains) {
    const definition = context.definition(world.get(id, Remains, "definition")),
      kind = world.get(id, Remains, "kind"),
      eligible = world.get(id, Remains, "eligible");
    check(
      has(id, Transform) && ![Template, Health, OwnerForce].some((component) => has(id, component)),
      `remains ${id} have live actor fields`,
    );
    check(
      forces.has(world.get(id, Remains, "force")) &&
        world.get(id, Remains, "created") <= kernel.tick,
      `remains ${id} have an invalid owner or creation tick`,
    );
    check(kind <= 1 && eligible <= 1, `remains ${id} have invalid flags`);
    check(
      kind === 1
        ? definition.id.includes("structure:") && definition.footprint
        : definition.id.includes("unit:") && definition.domain && definition.domain !== "foot",
      `remains ${id} have an invalid source kind`,
    );
    const materials = eligible
      ? Math.floor(
          ((definition.construction?.cost.materials ?? 0) +
            Math.floor((definition.construction?.cost.credits ?? 0) / 100)) /
            4,
        )
      : 0;
    check(
      world.get(id, Remains, "materials") === materials &&
        world.get(id, Remains, "work") <= SALVAGE_WORK,
      `remains ${id} changed salvage value or work`,
    );
  }
  for (const id of rows(SalvageOrder)) {
    check(
      actor(id).role === "builder" && seats.has(world.get(id, SalvageOrder, "seat")),
      `salvage order ${id} has no builder or seat`,
    );
    const target = world.get(id, SalvageOrder, "target");
    check(
      world.wasAllocated(target) &&
        (!world.isAlive(target) || has(target, Remains)) &&
        world.get(id, SalvageOrder, "state") < SALVAGE_STATES.length,
      `salvage order ${id} has an invalid target or state`,
    );
  }
}
