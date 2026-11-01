import { FACTIONS } from "./configuration";
import type { DebugLink } from "./links";

/** Fixed exit workload: four original 50-tank groups cross the authored base ramps. */
export function performanceScene(): DebugLink {
  const faction = FACTIONS.find((entry) => entry.id === "faction:eastern-collective");
  if (!faction) throw new Error("Eastern Collective faction missing");
  return {
    scene: "terrain-200",
    map: "core.map:training-grounds",
    seed: 1,
    forces: [{ index: 0, faction: `core.${faction.id}`, color: faction.color }],
    controlled: 0,
    spawns: Array.from({ length: 200 }, (_, index) => {
      const group = Math.floor(index / 50);
      return {
        definition: "core.unit:eastern-collective/dragon-tank",
        x: (group % 2 === 0 ? 12 : 94) + (index % 10) * 2,
        y: (group < 2 ? 12 : 94) + Math.floor((index % 50) / 10) * 2,
        force: 0,
        rotation: 0,
      };
    }),
  };
}

export const oppositeBase = (x: number, y: number) => ({
  x: (127 - x) * 1024 + 512,
  y: (127 - y) * 1024 + 512,
});
