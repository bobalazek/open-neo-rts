import { type Grant, hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import { ConstructionSite } from "../construction";
import { type Definition, OwnerForce, Template } from "../entities";
import { canInspectEconomy } from "./permissions";

/** Per-instance supply/draw and manual toggle, serialized with the rest of the World. */
export const StructurePower = defineComponent("StructurePower", { amount: "i32", enabled: "u8" });

export interface PowerSnapshot {
  readonly force: number;
  readonly used: number;
  readonly produced: number;
  readonly brownout: boolean;
}

export interface ForcePower {
  /** Trusted spawn path; incomplete sites remain excluded until their marker is removed. */
  attach(entity: number, definition: Definition): void;
  balance(force: number): PowerSnapshot | undefined;
  /** For powered defences/radar. Consumers draw < 0; a producer remains powered during brownout. */
  powered(entity: number): boolean;
  /** Production/research consumers use these integer multipliers when those systems are introduced. */
  productionPerMille(entity: number): number;
  researchPerMille(entity: number): number;
  canInspect(seat: number, force: number): boolean;
  snapshot(seat: number): PowerSnapshot[];
}

/** No cached capacities: completion, destruction, ownership and toggles take effect immediately. */
export function initializeForcePower(
  kernel: Kernel,
  forces: readonly { index: number }[],
  grants: readonly Grant[],
): ForcePower {
  if (kernel.power) throw new Error("Force power is already initialized");
  const ids = [...forces.map((force) => force.index)].sort((a, b) => a - b);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !Number.isInteger(id) || id < 0 || id > 0x7fffffff)
  )
    throw new Error("Invalid power Force IDs");
  const permissions = grants.map((grant) =>
    Object.freeze({ ...grant, scopes: Object.freeze([...grant.scopes]) }),
  );
  const { world } = kernel;
  const complete = (entity: number) =>
    world.isAlive(entity) &&
    world.has(entity, StructurePower) &&
    world.has(entity, OwnerForce) &&
    ids.includes(world.get(entity, OwnerForce, "force")) &&
    !world.has(entity, ConstructionSite);
  const enabled = (entity: number) =>
    complete(entity) &&
    !kernel.disabled?.(entity) &&
    world.get(entity, StructurePower, "enabled") === 1;
  const balance = (force: number): PowerSnapshot | undefined => {
    if (!ids.includes(force)) return undefined;
    let used = 0,
      produced = 0;
    for (const entity of world.query(StructurePower, OwnerForce)) {
      if (world.get(entity, OwnerForce, "force") !== force || !enabled(entity)) continue;
      const amount = world.get(entity, StructurePower, "amount");
      if (amount < 0) used -= amount;
      else produced += amount;
    }
    return { force, used, produced, brownout: used > produced };
  };
  const rate = (entity: number): number =>
    !enabled(entity) ? 0 : balance(world.get(entity, OwnerForce, "force"))?.brownout ? 500 : 1000;
  const power: ForcePower = Object.freeze({
    attach(entity: number, definition: Definition): void {
      if (definition.power === undefined) return;
      if (
        !world.isAlive(entity) ||
        !world.has(entity, Template) ||
        !world.has(entity, OwnerForce) ||
        !ids.includes(world.get(entity, OwnerForce, "force")) ||
        !/^([a-z0-9-]+\.)?structure:/.test(definition.id) ||
        !Number.isInteger(definition.power) ||
        definition.power < -500 ||
        definition.power > 500
      )
        throw new Error("Invalid structure power attachment");
      world.add(entity, StructurePower, { amount: definition.power, enabled: 1 });
    },
    balance,
    powered(entity: number): boolean {
      return (
        enabled(entity) &&
        (world.get(entity, StructurePower, "amount") >= 0 ||
          !balance(world.get(entity, OwnerForce, "force"))?.brownout)
      );
    },
    productionPerMille: rate,
    researchPerMille: rate,
    canInspect(seat: number, force: number): boolean {
      return ids.includes(force) && canInspectEconomy(permissions, seat, force, kernel.tick);
    },
    snapshot(seat: number): PowerSnapshot[] {
      return ids
        .filter((force) => canInspectEconomy(permissions, seat, force, kernel.tick))
        .map((force) => balance(force) as PowerSnapshot);
    },
  });
  register(kernel, {
    components: [StructurePower, ConstructionSite],
    handlers: {
      "economy.power": (_kernel, { seat, payload: { entity, enabled: value } }) => {
        if (!complete(entity)) return "bad_payload";
        const force = world.get(entity, OwnerForce, "force");
        if (!hasGrant(permissions, seat, force, "economy.build", kernel.tick)) return "no_grant";
        world.set(entity, StructurePower, "enabled", value);
      },
    },
  });
  kernel.power = power;
  return power;
}
