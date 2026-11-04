import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { UnitExperience } from "../abilities/veterancy";
import { Remains } from "../salvage";
import { Health, OwnerForce, Template, Transform } from ".";
import { Boarding, Cargo } from "./transport";

export function validateActorState(context: CanonicalValidation): void {
  const { world, rows, has, actor, point, forces, setup } = context;
  for (const id of rows(Template)) {
    const definition = actor(id);
    check(forces.has(world.get(id, OwnerForce, "force")), `actor ${id} has an unknown Force`);
    check(has(id, Transform) !== has(id, Cargo), `actor ${id} needs exactly one world/cargo pose`);
    const rank = has(id, UnitExperience) ? world.get(id, UnitExperience, "rank") : 0;
    check(rank <= 3, `actor ${id} has an invalid rank`);
    const maximum = Math.min(
      0x7fffffff,
      Math.floor((definition.health * (1000 + rank * 100)) / 1000),
    );
    check(world.get(id, Health, "current") <= maximum, `actor ${id} exceeds its maximum health`);
  }
  for (const component of [OwnerForce, Health]) for (const id of rows(component)) actor(id);
  for (const id of rows(Transform)) {
    check(has(id, Template) || has(id, Remains), `spatial row ${id} has no actor or remains`);
    check(
      point(world.get(id, Transform, "x"), world.get(id, Transform, "y")),
      `entity ${id} is outside the map`,
    );
  }
  const occupants = new Map<number, number>();
  for (const id of rows(Cargo)) {
    const definition = actor(id);
    const carrier = world.get(id, Cargo, "transport");
    const transport = actor(carrier);
    check(
      definition.domain === "foot" &&
        carrier !== id &&
        has(carrier, Transform) &&
        (transport.domain === "wheeled" || transport.domain === "tracked"),
      `invalid passenger ${id}`,
    );
    check(
      world.get(id, OwnerForce, "force") === world.get(carrier, OwnerForce, "force"),
      `passenger ${id} changed Force`,
    );
    check(
      point(world.get(id, Cargo, "x"), world.get(id, Cargo, "y")),
      `passenger ${id} has an invalid last pose`,
    );
    const count = (occupants.get(carrier) ?? 0) + 1;
    occupants.set(carrier, count);
    check(count <= (transport.transportSlots ?? 0), `transport ${carrier} exceeds capacity`);
  }
  for (const id of rows(Boarding)) {
    const definition = actor(id);
    check(
      definition.domain === "foot" && has(id, Transform) && !has(id, Cargo),
      `invalid boarding actor ${id}`,
    );
    check(context.seats.has(world.get(id, Boarding, "seat")), `boarding ${id} has an unknown seat`);
    check(
      world.get(id, Boarding, "plannedAt") <= context.kernel.tick,
      `boarding ${id} is planned in the future`,
    );
    const carrier = world.get(id, Boarding, "transport");
    check(world.wasAllocated(carrier) && carrier !== id, `boarding ${id} has an invalid target`);
    // A carrier can die after the control phase; ordinary next-tick cleanup owns that stale order.
    if (world.isAlive(carrier)) {
      const transport = actor(carrier);
      check(
        (transport.transportSlots ?? 0) > 0 &&
          has(carrier, Transform) &&
          (transport.domain === "wheeled" || transport.domain === "tracked"),
        `boarding ${id} targets a non-transport`,
      );
      const count = (occupants.get(carrier) ?? 0) + 1;
      occupants.set(carrier, count);
      check(count <= (transport.transportSlots ?? 0), `transport ${carrier} exceeds capacity`);
      check(
        world.get(id, OwnerForce, "force") === world.get(carrier, OwnerForce, "force"),
        `boarding ${id} crosses Forces`,
      );
    }
  }
  check(setup.normal, "normal setup is required");
}
