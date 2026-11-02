import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import { type Definition, Health, OwnerForce, Template } from "../entities";

const XP_SCALE = 1024;
const VALUE_CAP = 1_000_000;
const thresholds = [1, 2, 4] as const;
export const UnitExperience = defineComponent("UnitExperience", {
  xp: "u32",
  rank: "u8",
  repairCarry: "u16",
});
/** Lifetime budget and actual damage clock; healing, ownership and promotion never reset them. */
export const ExperienceYield = defineComponent("ExperienceYield", {
  used: "u32",
  carry: "u32",
  damagedAt: "u32",
});

function value(definition: Definition): number {
  const cost = definition.construction?.cost;
  return Math.min(VALUE_CAP, (cost?.credits ?? 0) + 5 * (cost?.materials ?? 0));
}

export class UnitVeterancy {
  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
  ) {}
  private definition(entity: number) {
    return this.definitions[this.kernel.world.get(entity, Template, "definition")];
  }
  rank(entity: number): number {
    const { world } = this.kernel;
    return world.has(entity, UnitExperience) ? world.get(entity, UnitExperience, "rank") : 0;
  }
  damageBonus(entity: number): number {
    return this.rank(entity) * 100;
  }
  maxHealth(entity: number, base: number): number {
    return Math.min(0x7fffffff, Math.floor((base * (1000 + this.damageBonus(entity))) / 1000));
  }
  snapshot(entity: number, privateXp: boolean) {
    const { world } = this.kernel;
    if (!world.has(entity, UnitExperience)) return;
    const rank = this.rank(entity);
    if (!rank && !privateXp) return;
    return {
      rank,
      ...(privateXp && {
        xp: world.get(entity, UnitExperience, "xp"),
        nextXp: value(this.definition(entity)!) * XP_SCALE * thresholds[Math.min(rank, 2)]!,
      }),
    };
  }
  damaged(entity: number) {
    const { world, tick } = this.kernel;
    if (!world.has(entity, ExperienceYield)) world.add(entity, ExperienceYield);
    world.set(entity, ExperienceYield, "damagedAt", tick);
    if (world.has(entity, UnitExperience)) world.set(entity, UnitExperience, "repairCarry", 0);
  }
  /** Called once for actual HP removed, after overkill has been clamped. */
  damage(source: number, target: number, force: number, amount: number) {
    const { world } = this.kernel;
    this.damaged(target);
    const targetForce = world.get(target, OwnerForce, "force");
    const group = this.kernel.vision?.groupForForce(force);
    if (
      targetForce === force ||
      (group !== undefined && group === this.kernel.vision?.groupForForce(targetForce))
    )
      return;
    const targetDefinition = this.definition(target)!;
    const targetValue = value(targetDefinition);
    if (!targetValue || targetDefinition.id.includes("prop:")) return;
    if (!world.has(target, ExperienceYield)) world.add(target, ExperienceYield);
    const used = world.get(target, ExperienceYield, "used");
    const eligible = Math.min(amount, Math.max(0, targetDefinition.health - used));
    if (!eligible) return;
    const numerator =
      BigInt(targetValue) * BigInt(eligible) * BigInt(XP_SCALE) +
      BigInt(world.get(target, ExperienceYield, "carry"));
    const denominator = BigInt(targetDefinition.health);
    const earned = Number(numerator / denominator);
    world.set(target, ExperienceYield, "used", used + eligible);
    world.set(target, ExperienceYield, "carry", Number(numerator % denominator));
    if (
      !world.isAlive(source) ||
      !world.has(source, Template) ||
      !world.has(source, Health) ||
      !world.has(source, OwnerForce) ||
      world.get(source, Health, "current") === 0 ||
      world.get(source, OwnerForce, "force") !== force
    )
      return;
    const definition = this.definition(source)!;
    const ownValue = value(definition);
    if (!definition.id.includes("unit:") || !definition.weapons?.length || !ownValue || !earned)
      return;
    if (!world.has(source, UnitExperience)) world.add(source, UnitExperience);
    const before = this.maxHealth(source, definition.health);
    const xp = Math.min(ownValue * XP_SCALE * 4, world.get(source, UnitExperience, "xp") + earned);
    world.set(source, UnitExperience, "xp", xp);
    const rank = thresholds.filter((threshold) => xp >= ownValue * XP_SCALE * threshold).length;
    world.set(source, UnitExperience, "rank", rank);
    const maximum = this.maxHealth(source, definition.health);
    world.set(
      source,
      Health,
      "current",
      Math.min(maximum, world.get(source, Health, "current") + maximum - before),
    );
  }
  repair() {
    const { world, tick } = this.kernel;
    for (const entity of world.query(UnitExperience, Template, Health)) {
      if (this.rank(entity) !== 3) continue;
      const health = world.get(entity, Health, "current");
      const maximum = this.maxHealth(entity, this.definition(entity)!.health);
      if (!health || health >= maximum) {
        world.set(entity, UnitExperience, "repairCarry", 0);
        continue;
      }
      if (
        this.kernel.disabled?.(entity) ||
        (world.has(entity, ExperienceYield) &&
          tick - world.get(entity, ExperienceYield, "damagedAt") < 100)
      )
        continue;
      const work = world.get(entity, UnitExperience, "repairCarry") + maximum;
      world.set(entity, Health, "current", Math.min(maximum, health + Math.floor(work / 2000)));
      world.set(
        entity,
        UnitExperience,
        "repairCarry",
        world.get(entity, Health, "current") === maximum ? 0 : work % 2000,
      );
    }
  }
}

export function initializeVeterancy(kernel: Kernel, definitions: readonly Definition[]) {
  const veterancy = new UnitVeterancy(kernel, definitions);
  register(kernel, {
    components: [UnitExperience, ExperienceYield],
    systems: { combat: [() => veterancy.repair()] },
  });
  kernel.veterancy = veterancy;
}
