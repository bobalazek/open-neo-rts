// Browser-safe fixtures for tests and scenarios. Phase 1a; terrain maps arrive in phase 1b.
import collectiveSoldier from "../../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json";
import dragonTank from "../../../../content/core/factions/eastern-collective/units/dragon-tank/unit.json";
import droneHunter from "../../../../content/core/factions/eastern-collective/units/drone-hunter/unit.json";
import fieldTechnician from "../../../../content/core/factions/eastern-collective/units/field-technician/unit.json";
import metamorphicApc from "../../../../content/core/factions/eastern-collective/units/metamorphic-apc/unit.json";
import rocketTrooper from "../../../../content/core/factions/eastern-collective/units/rocket-trooper/unit.json";
import supplyTruck from "../../../../content/core/factions/eastern-collective/units/supply-truck/unit.json";
import type { Command } from "../commands";
import { type Definition, toDefinition } from "../features/entities";
import type { Controller, ControllerCommand } from "../kernel";

/** The tier-1 roster from the Eastern Collective tech tree, in stable ID order; fresh per call. */
export function easternCollectiveTier1Definitions(): Definition[] {
  return [
    collectiveSoldier,
    dragonTank,
    droneHunter,
    fieldTechnician,
    metamorphicApc,
    rocketTrooper,
    supplyTruck,
  ].map(toDefinition);
}

/** One log's sequence numbers, shared across command types and seats, starting at 0 each tick. */
export function createCommandLog() {
  const sequences = new Map<number, number>();
  function envelope(tick: number, seat: number) {
    const sequence = sequences.get(tick) ?? 0;
    sequences.set(tick, sequence + 1);
    return { tick, seat, sequence };
  }

  function spawn(
    tick: number,
    seat: number,
    definition: string,
    force: number,
    x: number,
    y: number,
    facing = 0,
  ): Command {
    return {
      ...envelope(tick, seat),
      type: "debug.spawn",
      payload: { definition, force, x, y, facing },
    };
  }

  return {
    move(tick: number, seat: number, entities: readonly number[], x: number, y: number): Command {
      return {
        ...envelope(tick, seat),
        type: "unit.move",
        payload: { entities: [...entities], x, y },
      };
    },
    stop(tick: number, seat: number, entities: readonly number[]): Command {
      return { ...envelope(tick, seat), type: "unit.stop", payload: { entities: [...entities] } };
    },
    spawn,
    /** Spawn together on the phase-1a flat plane; no placement or formation rules yet. */
    spawnArmy(
      tick: number,
      seat: number,
      count: number,
      definition: string,
      force: number,
      x: number,
      y: number,
      facing = 0,
    ): Command[] {
      if (!Number.isInteger(count) || count < 0)
        throw new RangeError("Army count must be a nonnegative integer");
      return Array.from({ length: count }, () =>
        spawn(tick, seat, definition, force, x, y, facing),
      );
    },
  };
}

/** Keys are issue ticks: commands emitted in the ai phase execute on the following tick. */
export function scriptedController(
  script: Readonly<Record<number, readonly ControllerCommand[]>>,
): Controller {
  return ({ tick }) => script[tick] ?? [];
}
