// Data-driven self deployment and effective combat values. Phase 2.
import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { clearAttackOrder } from "../combat";
import { BuilderConstruction, clearConstructionOrder } from "../construction";
import { suspendRepair } from "../construction/repair";
import { suspendHarvesting } from "../economy/harvesting";
import {
  type Definition,
  type DeployModeDefinition,
  Health,
  OwnerForce,
  Template,
  Transform,
} from "../entities";
import { MoveIntent } from "../movement";

export { ProductionSurge, ProductionSurges } from "./production-surge";
export { ExperienceYield, UnitExperience, UnitVeterancy } from "./veterancy";

export const UnitMode = defineComponent("UnitMode", { active: "u8", readyAt: "u32" });
const resources = ["credits", "industrial-capacity", "materials", "salvage-points"] as const;

export class UnitModes {
  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
  ) {}
  active(entity: number): DeployModeDefinition | undefined {
    const world = this.kernel.world;
    if (!world.has(entity, UnitMode) || !world.get(entity, UnitMode, "active")) return;
    return this.definitions[world.get(entity, Template, "definition")]?.deployMode;
  }
  snapshot(entity: number) {
    const { world } = this.kernel;
    const mode = this.definitions[world.get(entity, Template, "definition")]?.deployMode;
    if (!mode) return;
    const present = world.has(entity, UnitMode);
    return {
      id: mode.id,
      active: present && world.get(entity, UnitMode, "active") === 1,
      readyAt: present ? world.get(entity, UnitMode, "readyAt") : 0,
    };
  }
  range(entity: number, base: number): number {
    const mode = this.active(entity);
    return mode ? Math.floor((base * mode.rangePerMille) / 1000) + mode.rangeBonusSubcells : base;
  }
  damageBonus(entity: number): number {
    return (this.active(entity)?.damagePerMille ?? 1000) - 1000;
  }
  armor(entity: number): number {
    return this.active(entity)?.armorPerMille ?? 1000;
  }
}

export function initializeUnitModes(
  kernel: Kernel,
  setup: Pick<MatchSetup, "definitions" | "grants">,
) {
  if (!setup.definitions.some((definition) => definition.deployMode)) return;
  kernel.unitModes = new UnitModes(kernel, setup.definitions);
  register(kernel, {
    components: [UnitMode],
    handlers: {
      "unit.deploy": (kernel, { seat, payload: { entities } }) => {
        const { world } = kernel;
        const actors = [...new Set(entities)]
          .filter(
            (entity) =>
              world.has(entity, Template) &&
              world.has(entity, Transform) &&
              world.has(entity, OwnerForce) &&
              world.has(entity, Health) &&
              world.get(entity, Health, "current") > 0,
          )
          .sort((a, b) => a - b);
        if (!actors.length) return "bad_payload";
        if (
          !actors.every((entity) =>
            hasGrant(
              setup.grants,
              seat,
              world.get(entity, OwnerForce, "force"),
              "unit.abilities",
              kernel.tick,
            ),
          )
        )
          return "no_grant";
        const changes = actors.flatMap((entity) => {
          const definition =
            setup.definitions[world.get(entity, Template, "definition")]?.deployMode;
          if (!definition) return [];
          const state = kernel.unitModes?.snapshot(entity);
          return [{ entity, definition, activate: !state?.active }];
        });
        if (!changes.length) return "bad_payload";
        if (changes.some(({ entity }) => kernel.disabled?.(entity))) return "immobile";
        if (
          changes.some(
            ({ entity }) =>
              world.has(entity, UnitMode) && kernel.tick < world.get(entity, UnitMode, "readyAt"),
          )
        )
          return "cooldown";
        const payments = new Map<number, Record<(typeof resources)[number], number>>();
        for (const { entity, definition, activate } of changes) {
          if (!activate) continue;
          const force = world.get(entity, OwnerForce, "force");
          const payment = payments.get(force) ?? {
            credits: 0,
            materials: 0,
            "industrial-capacity": 0,
            "salvage-points": 0,
          };
          for (const resource of resources) payment[resource] += definition.cost[resource] ?? 0;
          payments.set(force, payment);
        }
        for (const [force, payment] of [...payments].sort(([a], [b]) => a - b)) {
          const balance = kernel.economy?.balance(force);
          if (resources.some((resource) => payment[resource] > (balance?.[resource] ?? 0)))
            return "insufficient_funds";
        }
        for (const [force, payment] of [...payments].sort(([a], [b]) => a - b)) {
          if (resources.some((resource) => payment[resource] > 0)) {
            const paid = kernel.economy?.spend(seat, force, payment, "unit.abilities");
            if (!paid?.ok) return "insufficient_funds";
          }
        }
        for (const { entity, definition, activate } of changes) {
          if (activate) {
            kernel.transport?.cancel(entity);
            kernel.movement?.cancel(entity);
            if (world.has(entity, MoveIntent)) world.remove(entity, MoveIntent);
            clearAttackOrder(kernel, entity);
            if (world.has(entity, BuilderConstruction)) clearConstructionOrder(kernel, entity);
            suspendHarvesting(kernel, entity);
            suspendRepair(kernel, entity);
          }
          if (!world.has(entity, UnitMode)) world.add(entity, UnitMode, {});
          world.set(entity, UnitMode, "active", activate ? 1 : 0);
          world.set(entity, UnitMode, "readyAt", kernel.tick + definition.cooldownTicks);
        }
      },
    },
  });
}
