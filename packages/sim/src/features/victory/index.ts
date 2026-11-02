// Normal Last Man Standing, configured elimination, shared surrender and final result. Phase 2.
import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Feature, type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { Health, OwnerForce, Template } from "../entities";

export const ELIMINATION_RULES = ["annihilation", "baseDestruction", "headquarters"] as const;
export type EliminationRule = (typeof ELIMINATION_RULES)[number];
export const DEFEAT_REASONS = ["active", "eliminated", "surrendered"] as const;
export const ForceOutcome = defineComponent("ForceOutcome", {
  force: "u32",
  team: "u32",
  reason: "u8",
  tick: "u32",
  votes: "u16",
});
export const MatchOutcome = defineComponent("MatchOutcome", {
  ended: "u8",
  winner: "u32",
  tick: "u32",
});
const NO_WINNER = 0xffffffff;
export interface VictorySnapshot {
  rule: EliminationRule;
  forces: {
    force: number;
    team: number;
    reason: (typeof DEFEAT_REASONS)[number];
    tick: number | null;
  }[];
  result: { tick: number; winner: number | null; reason: "lastManStanding" | "draw" } | null;
}

/** Outcomes and votes live in World; this owner retains only immutable setup and row addresses. */
export class MatchVictory {
  private readonly forces = new Map<number, number>();
  private readonly result: number;
  private readonly contested: boolean;
  readonly rule: EliminationRule;
  constructor(
    private readonly kernel: Kernel,
    private readonly setup: MatchSetup,
  ) {
    const normal = setup.normal;
    if (!normal) throw new Error("Victory requires normal setup");
    this.rule = normal.settings.elimination ?? "annihilation";
    this.contested = new Set(normal.forces.map((force) => force.team)).size > 1;
    for (const force of [...normal.forces].sort((a, b) => a.index - b.index)) {
      const row = kernel.world.create();
      kernel.world.add(row, ForceOutcome, { force: force.index, team: force.team });
      this.forces.set(force.index, row);
    }
    this.result = kernel.world.create();
    kernel.world.add(this.result, MatchOutcome, { winner: NO_WINNER });
  }
  get ended(): boolean {
    return this.kernel.world.get(this.result, MatchOutcome, "ended") === 1;
  }
  private active(force: number): boolean {
    const row = this.forces.get(force);
    return row !== undefined && this.kernel.world.get(row, ForceOutcome, "reason") === 0;
  }
  private remove(force: number, reason: 1 | 2): void {
    const row = this.forces.get(force);
    if (row === undefined || !this.active(force)) return;
    const { world } = this.kernel;
    world.set(row, ForceOutcome, "reason", reason);
    world.set(row, ForceOutcome, "tick", this.kernel.tick + 1);
    for (const entity of world.query(Template, OwnerForce)) {
      if (world.get(entity, OwnerForce, "force") !== force) continue;
      this.kernel.movement?.cancel(entity);
      world.destroy(entity);
    }
  }
  private electorate(force: number): number {
    let mask = 0;
    for (const [index, seat] of this.setup.seats.entries())
      if (hasGrant(this.setup.grants, seat, force, "surrender", this.kernel.tick))
        mask |= 1 << index;
    return mask;
  }
  surrender(seat: number, force: number): "bad_payload" | "no_grant" | undefined {
    const row = this.forces.get(force);
    if (row === undefined || !this.active(force)) return "bad_payload";
    if (!hasGrant(this.setup.grants, seat, force, "surrender", this.kernel.tick)) return "no_grant";
    const mask = this.electorate(force);
    const votes =
      this.kernel.world.get(row, ForceOutcome, "votes") | (1 << this.setup.seats.indexOf(seat));
    this.kernel.world.set(row, ForceOutcome, "votes", votes & mask);
    if ((votes & mask) === mask) this.remove(force, 2);
  }
  update(): void {
    if (this.ended) return;
    const { world } = this.kernel;
    const survivors = new Set<number>();
    for (const entity of world.query(Template, OwnerForce, Health)) {
      if (world.get(entity, Health, "current") <= 0) continue;
      const definition = this.setup.definitions[world.get(entity, Template, "definition")];
      if (!definition) continue;
      const kind = definition.id.split(":")[0]?.split(".").at(-1);
      if (kind !== "unit" && kind !== "structure") continue;
      if (kind === "structure" && definition.role === "wall") continue;
      if (this.rule === "baseDestruction" && kind !== "structure") continue;
      if (this.rule === "headquarters" && definition.role !== "headquarters") continue;
      survivors.add(world.get(entity, OwnerForce, "force"));
    }
    // Evaluate all Forces against the same completed tick before choosing a winning team.
    for (const [force, row] of this.forces) {
      if (!this.active(force)) continue;
      const mask = this.electorate(force);
      const votes = world.get(row, ForceOutcome, "votes") & mask;
      world.set(row, ForceOutcome, "votes", votes);
      if (mask && votes === mask) this.remove(force, 2);
      else if (!survivors.has(force)) this.remove(force, 1);
    }
    const teams = new Set<number>();
    for (const [force, row] of this.forces)
      if (this.active(force)) teams.add(world.get(row, ForceOutcome, "team"));
    // One-team normal fixtures remain usable without fabricating an opponent or instant win.
    if (this.contested && teams.size <= 1) {
      world.set(this.result, MatchOutcome, "ended", 1);
      world.set(this.result, MatchOutcome, "winner", [...teams][0] ?? NO_WINNER);
      world.set(this.result, MatchOutcome, "tick", this.kernel.tick + 1);
      this.kernel.queued = [];
    }
    this.kernel.vision?.update();
    this.kernel.visibility?.update();
  }
  snapshot(): VictorySnapshot {
    const { world } = this.kernel;
    const winner = world.get(this.result, MatchOutcome, "winner");
    return {
      rule: this.rule,
      forces: [...this.forces].map(([force, row]) => {
        const reason = world.get(row, ForceOutcome, "reason");
        return {
          force,
          team: world.get(row, ForceOutcome, "team"),
          reason: DEFEAT_REASONS[reason] as (typeof DEFEAT_REASONS)[number],
          tick: reason ? world.get(row, ForceOutcome, "tick") : null,
        };
      }),
      result: this.ended
        ? {
            tick: world.get(this.result, MatchOutcome, "tick"),
            winner: winner === NO_WINNER ? null : winner,
            reason: winner === NO_WINNER ? "draw" : "lastManStanding",
          }
        : null,
    };
  }
}

export function initializeVictory(kernel: Kernel, setup: MatchSetup): void {
  if (!setup.normal) return;
  const feature: Feature = {
    components: [ForceOutcome, MatchOutcome],
    handlers: {
      "match.surrender": (_kernel, { seat, payload: { force } }) =>
        kernel.victory?.surrender(seat, force),
    },
    systems: { victory: [() => kernel.victory?.update()] },
  };
  register(kernel, feature);
  kernel.victory = new MatchVictory(kernel, setup);
}
