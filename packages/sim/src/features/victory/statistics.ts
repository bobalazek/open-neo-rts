import { defineComponent } from "../../ecs";
import type { Kernel } from "../../kernel";
import type { MatchSetup } from "../../match";
import type { StockBalances } from "../economy/bank";
import { canInspectEconomy } from "../economy/permissions";

export const STAT_COUNTERS = [
  "unitsBuilt",
  "structuresBuilt",
  "unitsLost",
  "structuresLost",
  "unitsDestroyed",
  "structuresDestroyed",
  "damageDealt",
  "damageTaken",
  "creditsGathered",
  "creditsSpent",
  "creditsRefunded",
  "materialsGathered",
  "materialsSpent",
  "materialsRefunded",
  "industrialCapacityGathered",
  "industrialCapacitySpent",
  "industrialCapacityRefunded",
  "salvagePointsGathered",
  "salvagePointsSpent",
  "salvagePointsRefunded",
] as const;
export type StatCounter = (typeof STAT_COUNTERS)[number];
export interface ForceStatisticsSnapshot {
  force: number;
  counters: Record<StatCounter, number>;
}
export const ForceStatistics = defineComponent("ForceStatistics", {
  force: "u32",
  ...(Object.fromEntries(STAT_COUNTERS.map((key) => [key, "u32"])) as Record<StatCounter, "u32">),
});
const prefixes = {
  credits: "credits",
  materials: "materials",
  "industrial-capacity": "industrialCapacity",
  "salvage-points": "salvagePoints",
} as const;

/** Initial kits/stock are not earned. Counters saturate rather than wrap in long matches. */
export class MatchStatistics {
  private readonly rows = new Map<number, number>();
  private readonly teams = new Map<number, number>();
  private readonly grants: MatchSetup["grants"];
  constructor(
    private readonly kernel: Kernel,
    setup: MatchSetup,
  ) {
    this.grants = setup.grants.map((grant) => ({ ...grant, scopes: [...grant.scopes] }));
    kernel.world.register(ForceStatistics);
    for (const force of [...(setup.normal?.forces ?? [])].sort((a, b) => a.index - b.index)) {
      const row = kernel.world.create();
      kernel.world.add(row, ForceStatistics, { force: force.index });
      this.rows.set(force.index, row);
      this.teams.set(force.index, force.team);
    }
  }
  record(force: number, counter: StatCounter, amount = 1): void {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 0xffffffff)
      throw new Error("Invalid statistic amount");
    const row = this.rows.get(force);
    if (row === undefined || this.kernel.victory?.ended) return;
    const world = this.kernel.world;
    world.set(
      row,
      ForceStatistics,
      counter,
      Math.min(0xffffffff, world.get(row, ForceStatistics, counter) + amount),
    );
  }
  money(force: number, kind: "Gathered" | "Spent" | "Refunded", resources: StockBalances): void {
    for (const resource of Object.keys(prefixes).sort() as (keyof typeof prefixes)[])
      this.record(force, `${prefixes[resource]}${kind}`, resources[resource]);
  }
  damage(
    attacker: number,
    victim: number,
    structure: boolean,
    amount: number,
    lethal: boolean,
  ): void {
    this.record(attacker, "damageDealt", amount);
    this.record(victim, "damageTaken", amount);
    if (!lethal) return;
    this.record(victim, structure ? "structuresLost" : "unitsLost");
    if (this.teams.get(attacker) !== this.teams.get(victim))
      this.record(attacker, structure ? "structuresDestroyed" : "unitsDestroyed");
  }
  snapshot(seat: number): ForceStatisticsSnapshot[] {
    return [...this.rows]
      .filter(
        ([force]) =>
          this.kernel.victory?.ended ||
          canInspectEconomy(this.grants, seat, force, this.kernel.tick),
      )
      .map(([force, row]) => ({
        force,
        counters: Object.fromEntries(
          STAT_COUNTERS.map((key) => [key, this.kernel.world.get(row, ForceStatistics, key)]),
        ) as Record<StatCounter, number>,
      }));
  }
}

export function initializeStatistics(kernel: Kernel, setup: MatchSetup): void {
  if (setup.normal) kernel.statistics = new MatchStatistics(kernel, setup);
}
