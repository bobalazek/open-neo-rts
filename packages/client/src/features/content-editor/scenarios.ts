import type { TerrainGrid } from "@open-neo-rts/content";
import type { GameplayCatalog, MatchSetup } from "@open-neo-rts/sim";
import { defaultSkirmish, map, normalSkirmish, type SkirmishMap } from "../skirmish/setup";

export const DRAFT_OPPONENTS = ["basic-skirmish", "idle", "draft-mirror"] as const;
export interface DraftScenario {
  readonly map: string;
  readonly opponent: (typeof DRAFT_OPPONENTS)[number];
  readonly yourSpawn: string;
  readonly otherSpawn: string;
  readonly seed: number;
}

export function defaultDraftScenario(): DraftScenario {
  const config = defaultSkirmish();
  return {
    map: `core.${map.id}`,
    opponent: "basic-skirmish",
    yourSpawn: config.yourSpawn,
    otherSpawn: config.otherSpawn,
    seed: config.seed,
  };
}

/** Add one instance per Force to an otherwise normal faction opening; never rewrite authored stats. */
export function draftScenarioSetup(
  config: DraftScenario,
  selectedMap: SkirmishMap,
  grid: TerrainGrid,
  catalog: GameplayCatalog,
  definition: string,
): MatchSetup {
  if (config.map !== `core.${selectedMap.id}` || !DRAFT_OPPONENTS.includes(config.opponent))
    throw new Error("Invalid draft scenario");
  const setup = normalSkirmish(
    {
      ...defaultSkirmish(),
      seed: config.seed,
      yourSpawn: config.yourSpawn,
      otherSpawn: config.otherSpawn,
    },
    grid,
    catalog,
    selectedMap,
  );
  const normal = setup.normal!;
  const hasOre = selectedMap.resources.some((resource) => resource.kind === "ore");
  const mirror =
    config.opponent === "draft-mirror"
      ? catalog.definitions.find((entry) => entry.id === definition)
      : undefined;
  if (
    config.opponent === "draft-mirror" &&
    (!mirror ||
      mirror.kind !== "unit" ||
      mirror.domain === "air" ||
      mirror.domain === "naval" ||
      mirror.pop === undefined ||
      !mirror.role ||
      (mirror.role === "harvester" && !hasOre))
  )
    throw new Error(
      "Draft mirror requires a supported ground unit; harvesters need a map with ore",
    );
  return {
    ...setup,
    normal: {
      ...normal,
      bots: config.opponent === "basic-skirmish" ? normal.bots : [{ seat: 2, kind: "idle" }],
      forces: normal.forces.map((force) => {
        // Temporary dry-map openings omit harvesters rather than weaken normal ore-reachability checks.
        let units = force.start.units.filter((unit) => hasOre || unit.role !== "harvester");
        if (mirror)
          units = units.some((entry) => entry.unit === mirror.id)
            ? units.map((entry) =>
                entry.unit === mirror.id ? { ...entry, count: entry.count + 1 } : entry,
              )
            : [...units, { unit: mirror.id, count: 1, pop: mirror.pop!, role: mirror.role! }];
        return { ...force, start: { ...force.start, units } };
      }),
    },
  };
}
