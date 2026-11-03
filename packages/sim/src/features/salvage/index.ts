// Canonical remains after normal combat deaths. Builder salvage follows in phase 2.
import { defineComponent } from "../../ecs";
import type { Kernel } from "../../kernel";
import { type Definition, Transform } from "../entities";
import type { NavigationObject } from "../movement/navigation";

/** Default documented decay policy: remove the oldest remains when this shared cap is reached. */
export const MAX_REMAINS = 500;
export const REMAINS_KINDS = ["wreck", "rubble"] as const;
export const Remains = defineComponent("Remains", {
  definition: "u32",
  force: "u32",
  kind: "u8",
  created: "u32",
  /** Unfinished sites never become valuable salvage. */
  eligible: "u8",
});

/** No Template, Health or OwnerForce: remains cannot operate, count as survivors or provide vision. */
export class MatchRemains {
  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
  ) {
    kernel.world.register(Remains);
  }

  create(
    definition: number,
    force: number,
    pose: { x: number; y: number; facing: number },
    site: boolean,
  ): void {
    const source = this.definitions[definition];
    const kind = source?.id.split(":")[0]?.split(".").at(-1);
    const rubble = kind === "structure" && !!source?.footprint;
    if (!rubble && !(kind === "unit" && source?.domain && source.domain !== "foot")) return;
    const { world } = this.kernel;
    const existing = world
      .query(Remains)
      .sort((a, b) => world.get(a, Remains, "created") - world.get(b, Remains, "created") || a - b);
    while (existing.length >= MAX_REMAINS) world.destroy(existing.shift()!);
    const id = world.create();
    world.add(id, Remains, {
      definition,
      force,
      kind: rubble ? 1 : 0,
      created: this.kernel.tick,
      eligible: site ? 0 : 1,
    });
    world.add(id, Transform, pose);
  }

  rubbleObjects(): NavigationObject[] {
    const { world } = this.kernel;
    return world
      .query(Remains, Transform)
      .filter((id) => world.get(id, Remains, "kind") === 1)
      .map((id) => ({
        definition: this.definitions[world.get(id, Remains, "definition")]!.id,
        position: [world.get(id, Transform, "x"), world.get(id, Transform, "y")],
        rotation: (((world.get(id, Transform, "facing") >>> 14) + 3) & 3) * 90,
        owner: "neutral",
      }));
  }

  /** Former ownership grants no sight; any currently visible occupied cell reveals low remains. */
  canSee(seat: number, id: number): boolean {
    const { world } = this.kernel;
    if (!world.isAlive(id) || !world.has(id, Remains) || !world.has(id, Transform)) return false;
    const source = this.definitions[world.get(id, Remains, "definition")];
    const footprint = world.get(id, Remains, "kind") === 1 ? source?.footprint : undefined;
    const [w = 1, d = 1] = footprint ?? [];
    const turned = (((world.get(id, Transform, "facing") >>> 14) + 3) & 1) !== 0;
    const x = Math.floor(world.get(id, Transform, "x") / 1024),
      y = Math.floor(world.get(id, Transform, "y") / 1024);
    for (let row = 0; row < (turned ? w : d); row++)
      for (let column = 0; column < (turned ? d : w); column++)
        if (this.kernel.visibility?.canSeeCell(seat, x + column, y + row)) return true;
    return false;
  }
}
