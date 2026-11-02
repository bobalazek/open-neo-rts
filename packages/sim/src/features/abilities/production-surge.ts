import { hasGrant } from "../../commands";
import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { ConstructionSite } from "../construction";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";

/** One Force-wide effect and cooldown, independent of the provider's lifetime. */
export const ProductionSurge = defineComponent("ProductionSurge", {
  force: "u32",
  until: "u32",
  readyAt: "u32",
  perMille: "u16",
});

export class ProductionSurges {
  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
  ) {}
  private row(force: number) {
    return this.kernel.world
      .query(ProductionSurge)
      .find((id) => this.kernel.world.get(id, ProductionSurge, "force") === force);
  }
  rate(force: number): number {
    const row = this.row(force),
      { world, tick } = this.kernel;
    return row !== undefined && world.get(row, ProductionSurge, "until") > tick
      ? world.get(row, ProductionSurge, "perMille")
      : 1000;
  }
  snapshot(entity: number) {
    const { world } = this.kernel;
    const ability = this.definitions[world.get(entity, Template, "definition")]?.productionSurge;
    const row = this.row(world.get(entity, OwnerForce, "force"));
    if (!ability || row === undefined) return;
    return {
      id: ability.id,
      until: world.get(row, ProductionSurge, "until"),
      readyAt: world.get(row, ProductionSurge, "readyAt"),
      perMille: world.get(row, ProductionSurge, "perMille"),
    };
  }
}

export function initializeProductionSurges(
  kernel: Kernel,
  setup: Pick<MatchSetup, "definitions" | "forces" | "grants">,
) {
  if (!setup.definitions.some((definition) => definition.productionSurge)) return;
  const { world } = kernel;
  register(kernel, {
    components: [ProductionSurge],
    handlers: {
      "commander.activate": (kernel, { seat, payload: { entity, ability } }) => {
        if (
          !world.isAlive(entity) ||
          !world.has(entity, Template) ||
          !world.has(entity, OwnerForce) ||
          !world.has(entity, Transform) ||
          !world.has(entity, Health) ||
          world.get(entity, Health, "current") === 0 ||
          world.has(entity, ConstructionSite)
        )
          return "bad_payload";
        const definition =
          setup.definitions[world.get(entity, Template, "definition")]?.productionSurge;
        if (!definition || definition.id !== ability) return "bad_payload";
        const force = world.get(entity, OwnerForce, "force");
        if (!hasGrant(setup.grants, seat, force, "commander.abilities", kernel.tick))
          return "no_grant";
        if (!kernel.power?.powered(entity) || kernel.disabled?.(entity)) return "immobile";
        const row = world
          .query(ProductionSurge)
          .find((id) => world.get(id, ProductionSurge, "force") === force);
        if (row === undefined) return "bad_payload";
        if (
          Math.max(
            world.get(row, ProductionSurge, "readyAt"),
            world.get(row, ProductionSurge, "until"),
          ) > kernel.tick
        )
          return "cooldown";
        const paid = kernel.economy?.spend(seat, force, definition.cost, "commander.abilities");
        if (!paid?.ok) return paid?.reason === "no_grant" ? "no_grant" : "insufficient_funds";
        world.set(
          row,
          ProductionSurge,
          "until",
          Math.min(0xffffffff, kernel.tick + definition.durationTicks),
        );
        world.set(
          row,
          ProductionSurge,
          "readyAt",
          Math.min(0xffffffff, kernel.tick + definition.cooldownTicks),
        );
        world.set(row, ProductionSurge, "perMille", definition.perMille);
      },
    },
  });
  for (const force of [...setup.forces].sort((a, b) => a.index - b.index)) {
    const row = world.create();
    world.add(row, ProductionSurge, { force: force.index, perMille: 1000 });
  }
  kernel.productionSurges = new ProductionSurges(kernel, setup.definitions);
}
