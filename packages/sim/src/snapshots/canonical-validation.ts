import { ProductionSurge } from "../features/abilities/production-surge";
import { prepareAbilityValidation } from "../features/abilities/state-validation";
import { WeaponState } from "../features/combat";
import { GroundFire } from "../features/combat/ground-fire";
import { validateCombatState } from "../features/combat/state-validation";
import { ConstructionBuilder, ConstructionRequest } from "../features/construction/sites";
import { prepareConstructionValidation } from "../features/construction/state-validation";
import { QueuedOrder } from "../features/control/orders";
import { validateOrderState } from "../features/control/state-validation";
import { ForceBank } from "../features/economy/bank";
import { ResourceNode } from "../features/economy/extraction";
import { OreCell } from "../features/economy/ore";
import { prepareEconomyValidation } from "../features/economy/state-validation";
import { Template } from "../features/entities";
import { validateActorState } from "../features/entities/state-validation";
import { ProductionItem } from "../features/production";
import { validateProductionState } from "../features/production/state-validation";
import { PendingImpact, Projectile } from "../features/projectiles";
import { Remains } from "../features/salvage";
import { validateRemainsState } from "../features/salvage/state-validation";
import { ForceOutcome, MatchOutcome } from "../features/victory";
import { prepareVictoryValidation } from "../features/victory/state-validation";
import {
  ControllerStatistics,
  ForceStatistics,
  StatisticsSample,
  StatisticsSeries,
  TypeStatistics,
} from "../features/victory/statistics";
import { AreaReveal } from "../features/vision/reveal";
import type { Kernel } from "../kernel";
import type { MatchSetup } from "../match";
import { canonicalInvariant, canonicalValidationContext } from "./validation-context";

const ROOTS = [
  Template,
  ProductionSurge,
  GroundFire,
  WeaponState,
  ConstructionBuilder,
  ConstructionRequest,
  QueuedOrder,
  ForceBank,
  ResourceNode,
  OreCell,
  ProductionItem,
  Projectile,
  PendingImpact,
  Remains,
  ForceOutcome,
  MatchOutcome,
  ControllerStatistics,
  ForceStatistics,
  StatisticsSample,
  StatisticsSeries,
  TypeStatistics,
  AreaReveal,
] as const;

/** Capture installed metadata identities before replacing candidate rows. */
export function prepareCanonicalValidation(kernel: Kernel, setup: MatchSetup): () => void {
  const context = canonicalValidationContext(kernel, setup);
  const economy = prepareEconomyValidation(context);
  const victory = prepareVictoryValidation(context);
  const abilities = prepareAbilityValidation(context);
  const construction = prepareConstructionValidation(context);
  return () => {
    validateActorState(context);
    economy();
    victory();
    abilities();
    construction();
    validateProductionState(context);
    validateOrderState(context);
    validateRemainsState(context);
    validateCombatState(context);
    for (const component of context.registered)
      canonicalInvariant(
        context.covered.has(component),
        `component ${component.name} has no canonical validator`,
      );
    const classified = new Set<number>();
    for (const component of ROOTS) {
      if (!context.registered.has(component)) continue;
      for (const id of kernel.world.query(component)) {
        canonicalInvariant(!classified.has(id), `entity ${id} has conflicting canonical row kinds`);
        classified.add(id);
      }
    }
    canonicalInvariant(
      classified.size === kernel.world.query().length,
      "unclassified canonical entity rows",
    );
  };
}
