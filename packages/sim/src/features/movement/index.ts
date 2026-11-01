// Granted move, attack-move and stop orders; map movement uses the terrain path follower.

import { atan2, divFloor, isqrt } from "@open-neo-rts/deterministic";
import { type Grant, hasGrant, type Rejection } from "../../commands";
import { defineComponent, type World } from "../../ecs";
import type { Feature, Kernel } from "../../kernel";
import type { MatchMap } from "../../match-map";
import { type Definition, OwnerForce, Template, Transform } from "../entities";

export * from "./navigation";
export * from "./path-scheduler";
export * from "./path-search";
export * from "./reachability";

/** Where a unit is moving, in subcells. Present only while it has a move order. */
export const MoveIntent = defineComponent("MoveIntent", { x: "i32", y: "i32", attackMove: "u8" });
/** Terminal map movement failure: 1 = no clear start/destination, 2 = bounded stuck retries exhausted. */
export const MovementFailure = defineComponent("MovementFailure", { reason: "u8" });

/**
 * `unit.move` and `unit.stop` for a match created with `definitions` and `grants`, and the movement system:
 * each tick a unit turns toward its target at its turn rate, in place, then advances at its speed once it
 * faces the target, and snaps onto it on arrival.
 */
// ponytail: grants are fixed for the match; they move into kernel state when control (phase 2) changes them.
export function movementFeature(match: {
  definitions: readonly Definition[];
  grants: readonly Grant[];
  map?: MatchMap;
}): Feature {
  const { definitions, grants } = match;
  const speedOf = (world: World, id: number) =>
    definitions[world.get(id, Template, "definition")]?.speed ?? 0;

  /** Replaces each unit's orders with a move to `target`, or drops them. All or nothing on grants. */
  function order(
    kernel: Kernel,
    seat: number,
    entities: readonly number[],
    target?: { x: number; y: number },
    attackMove = 0,
  ): Rejection | undefined {
    const { world, tick } = kernel;
    // Units may have died since the order was issued; IDs are never reused, so skip them.
    const ids = entities.filter((id) => world.isAlive(id) && world.has(id, Template));
    const force = (id: number) => world.get(id, OwnerForce, "force");
    if (!ids.every((id) => hasGrant(grants, seat, force(id), "unit.orders", tick)))
      return "no_grant";
    if (target) kernel.movement?.refreshOccupancy();
    for (const id of ids) {
      if (kernel.movement && world.has(id, MovementFailure)) world.remove(id, MovementFailure);
      if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
      kernel.movement?.cancel(id);
      if (target && speedOf(world, id) > 0) {
        if (kernel.movement) kernel.movement.order(id, target);
        else world.add(id, MoveIntent, target);
        if (world.has(id, MoveIntent)) world.set(id, MoveIntent, "attackMove", attackMove);
      }
    }
  }

  return {
    components: [
      Template,
      OwnerForce,
      Transform,
      MoveIntent,
      ...(match.map ? [MovementFailure] : []),
    ],
    systems: {
      movement: [
        (kernel) =>
          kernel.movement ? kernel.movement.tick() : movementSystem(kernel.world, definitions),
      ],
    },
    handlers: {
      "unit.move": (kernel, { seat, payload: { entities, x, y } }) =>
        order(kernel, seat, entities, { x, y }),
      "unit.attackMove": (kernel, { seat, payload: { entities, x, y } }) =>
        order(kernel, seat, entities, { x, y }, 1),
      "unit.stop": (kernel, { seat, payload: { entities } }) => order(kernel, seat, entities),
    },
  };
}

function movementSystem(world: World, definitions: readonly Definition[]): void {
  for (const id of world.query(MoveIntent, Transform, Template)) {
    const { speed, turnRate } = definitions[world.get(id, Template, "definition")] as Definition;
    const x = world.get(id, Transform, "x");
    const y = world.get(id, Transform, "y");
    const dx = world.get(id, MoveIntent, "x") - x;
    const dy = world.get(id, MoveIntent, "y") - y;
    if (dx === 0 && dy === 0) {
      world.remove(id, MoveIntent);
      continue;
    }
    // The signed shorter way round, in [-half turn, half turn); exactly opposite turns clockwise.
    const facing = world.get(id, Transform, "facing");
    const turn = ((atan2(dy, dx) - facing + 0x8000) & 0xffff) - 0x8000;
    const step = Math.max(0 - turnRate, Math.min(turnRate, turn));
    world.set(id, Transform, "facing", (facing + step) & 0xffff);
    if (step !== turn) continue;
    const distance = isqrt(dx * dx + dy * dy);
    if (distance <= speed) {
      world.set(id, Transform, "x", x + dx);
      world.set(id, Transform, "y", y + dy);
      world.remove(id, MoveIntent);
      continue;
    }
    // Straight at the target, each axis rounded to nearest: the larger one always advances, neither overshoots.
    world.set(id, Transform, "x", x + divFloor(2 * dx * speed + distance, 2 * distance));
    world.set(id, Transform, "y", y + divFloor(2 * dy * speed + distance, 2 * distance));
  }
}
