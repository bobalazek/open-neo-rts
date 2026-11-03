import { defineComponent } from "../../ecs";
import { type Kernel, register } from "../../kernel";
import type { Definition } from "../entities";
import type { GameplayWarhead, GameplayWeapon } from "../entities/weapons";
import { applyBurn } from "./burn";
import { type DamageImpact, warheadVictims } from "./damage";

export const GroundFire = defineComponent("GroundFire", {
  definition: "u32",
  weapon: "u16",
  warhead: "u8",
  source: "u32",
  force: "u32",
  x: "i32",
  y: "i32",
  ceiling: "u8",
  bonus: "u32",
  friendlyFire: "u8",
  until: "u32",
});
// shortcut: bound independent patches; revisit with counted area work if authored content needs more.
export const MAX_GROUND_FIRES = 256;
export interface GroundFireGrid {
  width: number;
  height: number;
  cells: Uint8Array;
}

/** Patch timers/attribution are private ECS rows; only visible terrain cells leave the host. */
export class GroundFireFields {
  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
  ) {
    register(kernel, {
      components: [GroundFire],
      systems: {
        validation: [
          () => {
            const { world } = kernel;
            for (const id of world.query(GroundFire))
              if (world.get(id, GroundFire, "until") <= kernel.tick) world.destroy(id);
          },
        ],
        combat: [() => this.tick()],
      },
    });
  }
  ignite(
    weapon: GameplayWeapon,
    warhead: GameplayWarhead,
    impact: DamageImpact,
    friendlyFire: boolean,
  ): void {
    const { kernel, definitions } = this;
    const map = kernel.map;
    if (
      impact.air ||
      !map ||
      !(warhead.radiusSubcells && warhead.durationTicks && warhead.amountPerSecond) ||
      impact.x < 0 ||
      impact.y < 0 ||
      impact.x >= map.terrain.width * 1024 ||
      impact.y >= map.terrain.height * 1024
    )
      return;
    const definition = definitions.findIndex((entry) => entry.weapons?.includes(weapon));
    const weaponIndex = definitions[definition]?.weapons?.indexOf(weapon) ?? -1;
    const warheadIndex = weapon.warheads.indexOf(warhead);
    if (weaponIndex < 0 || warheadIndex < 0) return;
    const until = Math.min(0xffffffff, kernel.tick + warhead.durationTicks);
    if (until <= kernel.tick) return;
    const data = {
      definition,
      weapon: weaponIndex,
      warhead: warheadIndex,
      source: impact.source ?? 0,
      force: impact.force,
      x: impact.x,
      y: impact.y,
      ceiling: impact.maxLevel,
      bonus: impact.damageBonus ?? 0,
      friendlyFire: Number(warhead.friendlyFire ?? friendlyFire),
    };
    const { world } = kernel,
      fields = world.query(GroundFire);
    for (const id of fields)
      if (
        Object.entries(data).every(
          ([key, value]) => world.get(id, GroundFire, key as keyof typeof data) === value,
        )
      ) {
        world.set(id, GroundFire, "until", Math.max(until, world.get(id, GroundFire, "until")));
        return;
      }
    if (fields.length < MAX_GROUND_FIRES) world.add(world.create(), GroundFire, { ...data, until });
  }
  private tick(): void {
    const { kernel, definitions } = this,
      { world } = kernel;
    for (const id of world.query(GroundFire)) {
      const until = world.get(id, GroundFire, "until");
      if (until <= kernel.tick) continue;
      const weapon =
        definitions[world.get(id, GroundFire, "definition")]?.weapons?.[
          world.get(id, GroundFire, "weapon")
        ];
      const original = weapon?.warheads[world.get(id, GroundFire, "warhead")];
      if (!weapon || original?.type !== "burn") {
        world.destroy(id);
        continue;
      }
      const warhead = { ...original, durationTicks: until - kernel.tick };
      const force = world.get(id, GroundFire, "force"),
        source = world.get(id, GroundFire, "source");
      const x = world.get(id, GroundFire, "x"),
        y = world.get(id, GroundFire, "y");
      for (const victim of warheadVictims(
        kernel,
        definitions,
        weapon,
        warhead,
        {
          force,
          source,
          x,
          y,
          fromX: x,
          fromY: y,
          direct: 0,
          air: false,
          maxLevel: world.get(id, GroundFire, "ceiling"),
        },
        world.get(id, GroundFire, "friendlyFire") === 1,
      ))
        applyBurn(
          kernel,
          victim.target,
          victim.definition,
          warhead,
          victim.falloff,
          force,
          world.get(id, GroundFire, "bonus"),
          source,
        );
    }
  }
  project(seat: number): GroundFireGrid {
    const { kernel, definitions } = this,
      { world } = kernel;
    const { width = 0, height = 0, level = [] } = kernel.map?.terrain ?? {};
    const cells = new Uint8Array(width * height);
    for (const id of world.query(GroundFire)) {
      if (world.get(id, GroundFire, "until") <= kernel.tick) continue;
      const radius =
        definitions[world.get(id, GroundFire, "definition")]?.weapons?.[
          world.get(id, GroundFire, "weapon")
        ]?.warheads[world.get(id, GroundFire, "warhead")]?.radiusSubcells ?? 0;
      const x = world.get(id, GroundFire, "x"),
        y = world.get(id, GroundFire, "y");
      for (
        let cy = Math.max(0, Math.floor((y - radius - 1) / 1024));
        cy <= Math.min(height - 1, Math.floor((y + radius) / 1024));
        cy++
      )
        for (
          let cx = Math.max(0, Math.floor((x - radius - 1) / 1024));
          cx <= Math.min(width - 1, Math.floor((x + radius) / 1024));
          cx++
        ) {
          const index = cy * width + cx;
          const dx = x - Math.max(cx * 1024, Math.min((cx + 1) * 1024, x)),
            dy = y - Math.max(cy * 1024, Math.min((cy + 1) * 1024, y));
          if (
            dx * dx + dy * dy <= radius * radius &&
            (level[index] ?? 0) <= world.get(id, GroundFire, "ceiling") &&
            kernel.visibility?.canSeeCell(seat, cx, cy)
          )
            cells[index] = 1;
        }
    }
    return { width, height, cells };
  }
}
