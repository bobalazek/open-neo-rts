import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { Template } from "../entities";
import { UnitMode } from ".";
import { ProductionSurge } from "./production-surge";
import { ExperienceYield, UnitExperience } from "./veterancy";

export function prepareAbilityValidation(context: CanonicalValidation): () => void {
  const { world, rows, has, actor, kernel, setup } = context;
  const surgeRows = context.fixed(ProductionSurge, ["force"]);
  const surges = setup.definitions.flatMap((definition) =>
    definition.productionSurge ? [definition.productionSurge] : [],
  );
  const rates = new Set([1000, ...surges.map((ability) => ability.perMille)]);
  const duration = surges.reduce((maximum, ability) => Math.max(maximum, ability.durationTicks), 0);
  const cooldown = surges.reduce((maximum, ability) => Math.max(maximum, ability.cooldownTicks), 0);
  return () => {
    surgeRows();
    for (const id of rows(ProductionSurge)) {
      check(
        !has(id, Template) && rates.has(world.get(id, ProductionSurge, "perMille")),
        `production surge ${id} has an invalid rate`,
      );
      check(
        world.get(id, ProductionSurge, "until") <= Math.min(0xffffffff, kernel.tick + duration),
        `production surge ${id} has an invalid duration`,
      );
      check(
        world.get(id, ProductionSurge, "readyAt") <= Math.min(0xffffffff, kernel.tick + cooldown),
        `production surge ${id} has an invalid cooldown`,
      );
    }
    for (const id of rows(UnitMode)) {
      const mode = actor(id).deployMode;
      check(
        mode && world.get(id, UnitMode, "active") <= 1,
        `unit ${id} has an invalid deployment mode`,
      );
      check(
        world.get(id, UnitMode, "readyAt") <= kernel.tick + mode.cooldownTicks,
        `unit ${id} has an invalid deployment cooldown`,
      );
    }
    for (const id of rows(UnitExperience)) {
      const definition = actor(id),
        cost = definition.construction?.cost;
      const value = Math.min(1000000, (cost?.credits ?? 0) + 5 * (cost?.materials ?? 0));
      check(
        definition.id.includes("unit:") && definition.weapons?.length && value > 0,
        `unit ${id} cannot hold experience`,
      );
      const xp = world.get(id, UnitExperience, "xp");
      check(xp <= value * 1024 * 4, `unit ${id} exceeds its experience budget`);
      const rank = [1, 2, 4].filter((threshold) => xp >= value * 1024 * threshold).length;
      check(world.get(id, UnitExperience, "rank") === rank, `unit ${id} has an inconsistent rank`);
      check(
        world.get(id, UnitExperience, "repairCarry") < 2000,
        `unit ${id} has invalid veteran repair work`,
      );
    }
    for (const id of rows(ExperienceYield)) {
      const definition = actor(id);
      check(
        definition.health > 0 && world.get(id, ExperienceYield, "used") <= definition.health,
        `actor ${id} exceeds its lifetime experience yield`,
      );
      check(
        world.get(id, ExperienceYield, "carry") < definition.health,
        `actor ${id} has invalid experience carry`,
      );
      check(
        world.get(id, ExperienceYield, "damagedAt") <= kernel.tick,
        `actor ${id} was damaged in the future`,
      );
    }
  };
}
