import type { Command } from "../../commands";
import { type Component, defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { ConstructionRequest, ConstructionSite } from "../construction";
import { QueuedOrder } from "../control/orders";
import type { StockBalances } from "../economy/bank";
import { canInspectEconomy } from "../economy/permissions";
import { Health, OwnerForce, Template } from "../entities";
import { ProductionItem } from "../production";
import { ForceOutcome } from ".";

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
  /** Final-only details; live economic counters keep their existing permission boundary. */
  details?: {
    controllers: { seat: number; bot: boolean; orders: number; ticks: number; apm: number }[];
    types: {
      definition: string;
      built: number;
      lost: number;
      destroyed: number;
      remaining: number;
    }[];
    history: { tick: number; values: Record<HistoryMetric, number> }[];
  };
}
export const ForceStatistics = defineComponent("ForceStatistics", {
  force: "u32",
  ...(Object.fromEntries(STAT_COUNTERS.map((key) => [key, "u32"])) as Record<StatCounter, "u32">),
});
export const HISTORY_METRICS = [
  "credits",
  "materials",
  "industrialCapacity",
  "salvagePoints",
  "creditsGathered",
  "materialsGathered",
  "industrialCapacityGathered",
  "salvagePointsGathered",
  "units",
  "structures",
  "armyUnits",
  "armyCredits",
  "armyMaterials",
  "armyIndustrialCapacity",
  "armySalvagePoints",
] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];
export const STAT_SAMPLE_TICKS = 600;
export const MAX_STAT_SAMPLES = 512;
export const ControllerStatistics = defineComponent("ControllerStatistics", {
  force: "u32",
  seat: "u32",
  orders: "u32",
});
export const TypeStatistics = defineComponent("TypeStatistics", {
  force: "u32",
  definition: "u32",
  built: "u32",
  lost: "u32",
  destroyed: "u32",
});
export const StatisticsSeries = defineComponent("StatisticsSeries", {
  force: "u32",
  interval: "u32",
  finished: "u32",
});
export const StatisticsSample = defineComponent("StatisticsSample", {
  force: "u32",
  tick: "u32",
  ...(Object.fromEntries(HISTORY_METRICS.map((metric) => [metric, "u32"])) as Record<
    HistoryMetric,
    "u32"
  >),
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
    private readonly setup: MatchSetup,
  ) {
    this.grants = setup.grants.map((grant) => ({ ...grant, scopes: [...grant.scopes] }));
    kernel.world.register(ForceStatistics);
    for (const component of [
      ControllerStatistics,
      TypeStatistics,
      StatisticsSeries,
      StatisticsSample,
    ])
      kernel.world.register(component);
    for (const force of [...(setup.normal?.forces ?? [])].sort((a, b) => a.index - b.index)) {
      const row = kernel.world.create();
      kernel.world.add(row, ForceStatistics, { force: force.index });
      this.rows.set(force.index, row);
      this.teams.set(force.index, force.team);
      const series = kernel.world.create();
      kernel.world.add(series, StatisticsSeries, {
        force: force.index,
        interval: STAT_SAMPLE_TICKS,
      });
      for (const seat of [...setup.seats].sort((a, b) => a - b)) {
        if (!setup.grants.some((grant) => grant.seat === seat && grant.force === force.index))
          continue;
        const controller = kernel.world.create();
        kernel.world.add(controller, ControllerStatistics, { force: force.index, seat });
      }
    }
  }
  private typed(force: number, definition: number, field: "built" | "lost" | "destroyed") {
    if (this.kernel.victory?.ended || !this.rows.has(force) || !this.setup.definitions[definition])
      return;
    const world = this.kernel.world;
    let row = world
      .query(TypeStatistics)
      .find(
        (id) =>
          world.get(id, TypeStatistics, "force") === force &&
          world.get(id, TypeStatistics, "definition") === definition,
      );
    if (row === undefined) {
      row = world.create();
      world.add(row, TypeStatistics, { force, definition });
    }
    world.set(
      row,
      TypeStatistics,
      field,
      Math.min(0xffffffff, world.get(row, TypeStatistics, field) + 1),
    );
  }
  built(force: number, definition: number) {
    this.record(
      force,
      this.setup.definitions[definition]?.footprint ? "structuresBuilt" : "unitsBuilt",
    );
    this.typed(force, definition, "built");
  }
  loss(force: number, definition: number) {
    this.record(
      force,
      this.setup.definitions[definition]?.footprint ? "structuresLost" : "unitsLost",
    );
    this.typed(force, definition, "lost");
  }
  /** Resolve acting Forces before a successful command can remove its actor/item. Targets do not earn orders. */
  commandForces(command: Command): number[] {
    if (command.type.startsWith("debug.")) return [];
    const world = this.kernel.world,
      payload = command.payload as unknown as Record<string, unknown>,
      forces = new Set<number>();
    const actor = (value: unknown) => {
      if (typeof value === "number" && world.isAlive(value) && world.has(value, OwnerForce))
        forces.add(world.get(value, OwnerForce, "force"));
    };
    if (typeof payload.force === "number") forces.add(payload.force);
    if (Array.isArray(payload.entities)) for (const id of payload.entities) actor(id);
    else if (Array.isArray(payload.builders)) for (const id of payload.builders) actor(id);
    else if (typeof payload.entity === "number") {
      actor(payload.entity);
      if (world.isAlive(payload.entity) && world.has(payload.entity, ConstructionRequest))
        forces.add(world.get(payload.entity, ConstructionRequest, "force"));
    }
    if (typeof payload.item === "number" && world.isAlive(payload.item)) {
      const component: Component<{ force: "u32" }> =
        command.type === "production.cancel" ? ProductionItem : QueuedOrder;
      if (world.has(payload.item, component))
        forces.add(world.get(payload.item, component, "force"));
    }
    return [...forces]
      .filter(
        (force) =>
          this.rows.has(force) &&
          world
            .query(ForceOutcome)
            .some(
              (id) =>
                world.get(id, ForceOutcome, "force") === force &&
                world.get(id, ForceOutcome, "reason") === 0,
            ),
      )
      .sort((a, b) => a - b);
  }
  order(seat: number, forces: readonly number[]) {
    const world = this.kernel.world;
    const active = forces.filter((force) =>
      world
        .query(StatisticsSeries)
        .some(
          (id) =>
            world.get(id, StatisticsSeries, "force") === force &&
            !world.get(id, StatisticsSeries, "finished"),
        ),
    );
    for (const row of world.query(ControllerStatistics))
      if (
        world.get(row, ControllerStatistics, "seat") === seat &&
        active.includes(world.get(row, ControllerStatistics, "force"))
      )
        world.set(
          row,
          ControllerStatistics,
          "orders",
          Math.min(0xffffffff, world.get(row, ControllerStatistics, "orders") + 1),
        );
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
    definition: number,
    amount: number,
    lethal: boolean,
  ): void {
    this.record(attacker, "damageDealt", amount);
    this.record(victim, "damageTaken", amount);
    if (!lethal) return;
    this.loss(victim, definition);
    if (this.teams.get(attacker) !== this.teams.get(victim)) {
      this.record(
        attacker,
        this.setup.definitions[definition]?.footprint ? "structuresDestroyed" : "unitsDestroyed",
      );
      this.typed(attacker, definition, "destroyed");
    }
  }
  private inventory(force: number) {
    const world = this.kernel.world,
      counts = new Map<number, number>();
    const result = {
      units: 0,
      structures: 0,
      armyUnits: 0,
      armyCredits: 0,
      armyMaterials: 0,
      armyIndustrialCapacity: 0,
      armySalvagePoints: 0,
    };
    for (const id of world.query(Template, OwnerForce, Health)) {
      if (
        world.get(id, OwnerForce, "force") !== force ||
        !world.get(id, Health, "current") ||
        world.has(id, ConstructionSite)
      )
        continue;
      const index = world.get(id, Template, "definition"),
        definition = this.setup.definitions[index]!;
      const kind = definition.id.split(":")[0]?.split(".").at(-1);
      if (kind !== "unit" && kind !== "structure") continue;
      counts.set(index, (counts.get(index) ?? 0) + 1);
      if (kind === "structure") result.structures++;
      else {
        result.units++;
        if (definition.role === "builder" || definition.role === "harvester") continue;
        result.armyUnits++;
        for (const [resource, field] of [
          ["credits", "armyCredits"],
          ["materials", "armyMaterials"],
          ["industrial-capacity", "armyIndustrialCapacity"],
          ["salvage-points", "armySalvagePoints"],
        ] as const)
          result[field] = Math.min(
            0xffffffff,
            result[field] + (definition.construction?.cost[resource] ?? 0),
          );
      }
    }
    return { ...result, counts };
  }
  /** Regular samples coarsen in place when full, retaining the entire match rather than a trailing window. */
  sample(tick: number) {
    const world = this.kernel.world;
    for (const row of world.query(StatisticsSeries)) {
      if (world.get(row, StatisticsSeries, "finished")) continue;
      const force = world.get(row, StatisticsSeries, "force");
      const outcome =
        tick === 0
          ? undefined
          : world.query(ForceOutcome).find((id) => world.get(id, ForceOutcome, "force") === force);
      const finished =
        !!this.kernel.victory?.ended ||
        (outcome !== undefined && world.get(outcome, ForceOutcome, "reason") !== 0);
      if (finished) world.set(row, StatisticsSeries, "finished", tick);
      if (!finished && tick % world.get(row, StatisticsSeries, "interval")) continue;
      const history = world
        .query(StatisticsSample)
        .filter((id) => world.get(id, StatisticsSample, "force") === force);
      if (history.length >= MAX_STAT_SAMPLES) {
        for (const [i, id] of history.entries()) if (i % 2) world.destroy(id);
        world.set(
          row,
          StatisticsSeries,
          "interval",
          Math.min(0x7fffffff, world.get(row, StatisticsSeries, "interval") * 2),
        );
      }
      const bank = this.kernel.economy?.balance(force);
      const stat = this.rows.get(force)!;
      const inventory = this.inventory(force);
      const sample = world.create();
      world.add(sample, StatisticsSample, {
        force,
        tick,
        credits: bank?.credits ?? 0,
        materials: bank?.materials ?? 0,
        industrialCapacity: bank?.["industrial-capacity"] ?? 0,
        salvagePoints: bank?.["salvage-points"] ?? 0,
        creditsGathered: world.get(stat, ForceStatistics, "creditsGathered"),
        materialsGathered: world.get(stat, ForceStatistics, "materialsGathered"),
        industrialCapacityGathered: world.get(stat, ForceStatistics, "industrialCapacityGathered"),
        salvagePointsGathered: world.get(stat, ForceStatistics, "salvagePointsGathered"),
        units: inventory.units,
        structures: inventory.structures,
        armyUnits: inventory.armyUnits,
        armyCredits: inventory.armyCredits,
        armyMaterials: inventory.armyMaterials,
        armyIndustrialCapacity: inventory.armyIndustrialCapacity,
        armySalvagePoints: inventory.armySalvagePoints,
      });
    }
  }
  private details(force: number): NonNullable<ForceStatisticsSnapshot["details"]> {
    const world = this.kernel.world;
    const series = world
      .query(StatisticsSeries)
      .find((id) => world.get(id, StatisticsSeries, "force") === force)!;
    const ticks = world.get(series, StatisticsSeries, "finished") || this.kernel.tick;
    const inventory = this.inventory(force),
      counts = new Map<
        number,
        { built: number; lost: number; destroyed: number; remaining: number }
      >();
    for (const [definition, remaining] of inventory.counts)
      counts.set(definition, { built: 0, lost: 0, destroyed: 0, remaining });
    for (const row of world.query(TypeStatistics))
      if (world.get(row, TypeStatistics, "force") === force) {
        const definition = world.get(row, TypeStatistics, "definition");
        counts.set(definition, {
          built: world.get(row, TypeStatistics, "built"),
          lost: world.get(row, TypeStatistics, "lost"),
          destroyed: world.get(row, TypeStatistics, "destroyed"),
          remaining: inventory.counts.get(definition) ?? 0,
        });
      }
    return {
      controllers: world
        .query(ControllerStatistics)
        .filter((id) => world.get(id, ControllerStatistics, "force") === force)
        .map((id) => {
          const seat = world.get(id, ControllerStatistics, "seat"),
            orders = world.get(id, ControllerStatistics, "orders");
          return {
            seat,
            bot: !!this.setup.normal?.bots?.some((bot) => bot.seat === seat),
            orders,
            ticks,
            apm: ticks ? Math.min(0xffffffff, Math.floor((orders * 1200) / ticks)) : 0,
          };
        }),
      types: [...counts]
        .sort(([a], [b]) => a - b)
        .map(([index, values]) => ({ definition: this.setup.definitions[index]!.id, ...values })),
      history: world
        .query(StatisticsSample)
        .filter((id) => world.get(id, StatisticsSample, "force") === force)
        .map((id) => ({
          tick: world.get(id, StatisticsSample, "tick"),
          values: Object.fromEntries(
            HISTORY_METRICS.map((metric) => [metric, world.get(id, StatisticsSample, metric)]),
          ) as Record<HistoryMetric, number>,
        })),
    };
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
        ...(this.kernel.victory?.ended && { details: this.details(force) }),
      }));
  }
}

export function initializeStatistics(kernel: Kernel, setup: MatchSetup): void {
  if (setup.normal) {
    kernel.statistics = new MatchStatistics(kernel, setup);
    register(kernel, { systems: { snapshot: [() => kernel.statistics?.sample(kernel.tick + 1)] } });
  }
}
