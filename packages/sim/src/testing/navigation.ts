import type { GroundDomain } from "@open-neo-rts/content";
import { compileNavigation, type NavigationDefinition } from "../features/movement/navigation";
import type { MatchMap } from "../match-map";
import { flatMap, terrainMap } from "./maps";

/** Raw integer layer bytes, compared directly between Bun and browser engines. */
export function navigationProof(): number[][] {
  const maps = [terrainMap()];
  for (let turn = 0; turn < 3; turn++) {
    const previous = maps.at(-1) as MatchMap;
    const rotate = (layer: readonly number[], ramps = false) =>
      layer.map((_, i) => {
        const value = layer[(7 - (i % 8)) * 8 + Math.floor(i / 8)] as number;
        return ramps && value ? (value % 4) + 1 : value;
      });
    maps.push({
      ...previous,
      terrain: {
        ...previous.terrain,
        level: rotate(previous.terrain.level),
        ramp: rotate(previous.terrain.ramp, true),
      },
    });
  }
  maps.push(flatMap(512, 1), flatMap(1, 512), flatMap(1));
  const definitions: NavigationDefinition[] = [
    { id: "prop:fixture", footprint: [2, 1], blocks: "movement", domains: ["wheeled", "hover"] },
    { id: "structure:fixture", footprint: [1, 8] },
  ];
  maps.push({
    ...flatMap(),
    objects: [2, 6].map((x) => ({
      definition: "structure:fixture",
      position: [x * 1024, 0] as const,
      rotation: 0,
      owner: "neutral",
    })),
  });
  const live = [
    { definition: "prop:fixture", position: [1024, 4096] as const, rotation: 90, owner: "neutral" },
  ];
  const result: number[][] = [];
  for (const [i, map] of maps.entries())
    for (const domain of [
      "foot",
      "wheeled",
      "tracked",
      "hover",
      "amphibious",
      "naval",
    ] as GroundDomain[])
      for (const radiusSubcells of [0, 256, 512, 513, 1024, 1536, 1537, 8192]) {
        const grid = compileNavigation(
          map,
          definitions,
          { domain, radiusSubcells },
          i < 4 ? live : [],
        );
        result.push(
          [...grid.cost],
          [...grid.connections],
          [...grid.clearanceSubcells],
          [...grid.speedPercent],
        );
      }
  return result;
}
