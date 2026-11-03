import { atan2 } from "@open-neo-rts/deterministic";
import type { Kernel } from "../../kernel";
import { type Definition, Health, spawnEntity, Template, Transform } from "../entities";
import { populationFits } from "../entities/population";
import type { GameplayWarhead } from "../entities/weapons";
import type { DamageImpact } from "./damage";

// shortcut: search four cells around impact; revisit with authored scatter areas if content needs more.
export const SPAWN_SEARCH_RADIUS = 4;

/** Ground payloads use current geometry, ownership and population; blocked output is not queued. */
export function applySpawn(
  kernel: Kernel,
  definitions: readonly Definition[],
  warhead: GameplayWarhead,
  impact: DamageImpact,
  populationCap: number | undefined,
): void {
  const index = definitions.findIndex((definition) => definition.id === warhead.unit);
  const unit = definitions[index],
    count = warhead.count ?? 1;
  const map = kernel.map;
  if (
    !unit ||
    unit.id.split(":")[0]?.split(".").at(-1) !== "unit" ||
    unit.pop === undefined ||
    unit.domain === undefined ||
    unit.domain === "air" ||
    unit.radiusSubcells === undefined ||
    populationCap === undefined ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20 ||
    impact.air ||
    !map ||
    !Number.isInteger(impact.x) ||
    !Number.isInteger(impact.y) ||
    impact.x < 0 ||
    impact.y < 0 ||
    impact.x >= map.terrain.width * 1024 ||
    impact.y >= map.terrain.height * 1024 ||
    !kernel.victory
      ?.snapshot()
      .forces.some((force) => force.force === impact.force && force.reason === "active")
  )
    return;
  const { world } = kernel;
  const x = Math.floor(impact.x / 1024),
    y = Math.floor(impact.y / 1024);
  const points: { x: number; y: number }[] = [];
  for (let dy = -SPAWN_SEARCH_RADIUS; dy <= SPAWN_SEARCH_RADIUS; dy++)
    for (let dx = -SPAWN_SEARCH_RADIUS; dx <= SPAWN_SEARCH_RADIUS; dx++)
      points.push({ x: (x + dx) * 1024 + 512, y: (y + dy) * 1024 + 512 });
  points.sort(
    (a, b) =>
      (a.x - impact.x) ** 2 +
        (a.y - impact.y) ** 2 -
        ((b.x - impact.x) ** 2 + (b.y - impact.y) ** 2) ||
      a.y - b.y ||
      a.x - b.x,
  );
  kernel.movement?.refreshOccupancy();
  const actors = world
    .query(Template, Transform, Health)
    .filter(
      (id) =>
        world.get(id, Health, "current") > 0 &&
        definitions[world.get(id, Template, "definition")]?.id.split(":")[0]?.split(".").at(-1) ===
          "unit",
    );
  let spawned = 0;
  for (const point of points) {
    if (spawned >= count || !populationFits(kernel, definitions, impact.force, unit, populationCap))
      break;
    if (
      !kernel.movement?.canStandDefinition(index, point) ||
      actors.some((id) => {
        const other = definitions[world.get(id, Template, "definition")]!;
        const dx = world.get(id, Transform, "x") - point.x,
          dy = world.get(id, Transform, "y") - point.y;
        const radius = unit.radiusSubcells! + (other.radiusSubcells ?? 0);
        return (dx === 0 && dy === 0) || dx * dx + dy * dy < radius * radius;
      })
    )
      continue;
    actors.push(
      spawnEntity(kernel, index, unit, {
        definition: unit.id,
        force: impact.force,
        ...point,
        facing: atan2(impact.y - impact.fromY, impact.x - impact.fromX),
      }),
    );
    kernel.statistics?.built(impact.force, index);
    spawned++;
  }
}
