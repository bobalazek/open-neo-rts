import { QUEUED_ORDER_TYPES } from "../../commands";
import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { OwnerForce, Template, Transform } from "../entities";
import { MoveIntent, MovementFailure } from "../movement";
import { MAX_QUEUED_ORDERS, ORDER_REFUSALS, OrderFailure, QueuedOrder } from "./orders";

export function validateOrderState(context: CanonicalValidation): void {
  const { world, rows, has, actor, forces, seats, kernel } = context;
  for (const id of rows(MoveIntent)) {
    check(actor(id).domain && has(id, Transform), `move intent ${id} has no spatial unit`);
    check(
      context.point(world.get(id, MoveIntent, "x"), world.get(id, MoveIntent, "y")),
      `move intent ${id} is outside the map`,
    );
    check(
      world.get(id, MoveIntent, "attackMove") <= 1,
      `move intent ${id} has an invalid attack-move flag`,
    );
  }
  for (const id of rows(MovementFailure)) {
    actor(id);
    const reason = world.get(id, MovementFailure, "reason");
    check(reason === 1 || reason === 2, `movement failure ${id} has an invalid reason`);
  }
  const counts = new Map<number, number>(),
    groups = new Map<number, string>();
  for (const id of rows(QueuedOrder)) {
    const source = world.get(id, QueuedOrder, "actor"),
      seat = world.get(id, QueuedOrder, "seat"),
      force = world.get(id, QueuedOrder, "force");
    const type = QUEUED_ORDER_TYPES[world.get(id, QueuedOrder, "kind")],
      group = world.get(id, QueuedOrder, "group");
    check(
      !has(id, Template) &&
        world.wasAllocated(source) &&
        source !== id &&
        type &&
        seats.has(seat) &&
        forces.has(force),
      `queued order ${id} has an invalid actor, kind or owner`,
    );
    const target = world.get(id, QueuedOrder, "target");
    check(target === 0 || world.wasAllocated(target), `queued order ${id} names a future target`);
    check(
      group > 0 && group <= id && world.get(id, QueuedOrder, "reason") <= ORDER_REFUSALS.length,
      `queued order ${id} has an invalid group or reason`,
    );
    const count = (counts.get(source) ?? 0) + 1;
    check(count <= MAX_QUEUED_ORDERS, `actor ${source} exceeds its pending order limit`);
    counts.set(source, count);
    if (world.isAlive(source)) {
      actor(source);
      check(world.get(source, OwnerForce, "force") === force, `queued order ${id} changed Force`);
    }
    if (type === "economy.build") {
      const definition = context.definition(world.get(id, QueuedOrder, "definition"));
      check(
        definition.footprint && definition.construction,
        `queued order ${id} has an invalid construction recipe`,
      );
      const identity = [
        seat,
        force,
        world.get(id, QueuedOrder, "definition"),
        world.get(id, QueuedOrder, "x"),
        world.get(id, QueuedOrder, "y"),
        world.get(id, QueuedOrder, "facing"),
      ].join(":");
      check(
        !groups.has(group) || groups.get(group) === identity,
        `queued construction group ${group} disagrees`,
      );
      groups.set(group, identity);
    } else check(group === id, `non-construction order ${id} has a shared group`);
    for (const field of ["x", "y"] as const) {
      const value = world.get(id, QueuedOrder, field);
      check(value >= 0 && value < 1 << 19, `queued order ${id} exceeds command coordinates`);
    }
  }
  for (const id of rows(OrderFailure)) {
    actor(id);
    check(
      world.get(id, OrderFailure, "code") <= ORDER_REFUSALS.length &&
        world.get(id, OrderFailure, "scope") <= 2 &&
        world.get(id, OrderFailure, "tick") <= kernel.tick,
      `order failure ${id} is invalid`,
    );
  }
}
