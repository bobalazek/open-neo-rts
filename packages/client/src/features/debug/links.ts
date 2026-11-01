import type { CatalogEntry } from "./catalog";
import { type DebugForce, FACTIONS, parseDebugSeed, validateDebugForces } from "./configuration";

export interface InitialSpawn {
  definition: string;
  x: number;
  y: number;
  force: number;
  rotation: number;
}
export interface DebugLink {
  map: string;
  seed: number;
  forces: DebugForce[];
  controlled: number;
  spawns: InitialSpawn[];
}
interface LinkMap {
  id: string;
  width: number;
  height: number;
}

function integer(value: string, max: number, label: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > max)
    throw new Error(`${label} must be an integer from 0 to ${max}`);
  return Number(value);
}

export function validateInitialSpawns(
  spawns: readonly InitialSpawn[],
  map: LinkMap,
  forces: readonly DebugForce[],
  catalog: readonly CatalogEntry[],
) {
  const seen = new Set<string>();
  for (const spawn of spawns) {
    if (!catalog.some((entry) => entry.definition.id === spawn.definition))
      throw new Error(`Unknown spawn definition: ${spawn.definition}`);
    if (!forces.some((force) => force.index === spawn.force))
      throw new Error(`Undeclared spawn Force ${spawn.force + 1}`);
    if (
      !Number.isInteger(spawn.x) ||
      !Number.isInteger(spawn.y) ||
      spawn.x < 0 ||
      spawn.y < 0 ||
      spawn.x >= map.width ||
      spawn.y >= map.height
    )
      throw new Error("Initial spawn cell is outside the map");
    if (!Number.isInteger(spawn.rotation) || spawn.rotation < 0 || spawn.rotation > 3)
      throw new Error("Spawn rotation must be 0, 1, 2 or 3");
    const key = JSON.stringify(spawn);
    if (seen.has(key)) throw new Error("Duplicate initial spawn");
    seen.add(key);
  }
}

/** Unique query parameters; semicolons separate repeated Forces/spawns inside their one value. */
export function parseDebugLink(
  search: string,
  maps: readonly LinkMap[],
  catalog: readonly CatalogEntry[],
): DebugLink {
  const params = new URLSearchParams(search);
  const allowed = new Set(["map", "seed", "force", "controlled", "spawn"]);
  const seen = new Set<string>();
  params.forEach((_value, key) => {
    if (!allowed.has(key)) throw new Error(`Unknown debug parameter: ${key}`);
    if (seen.has(key)) throw new Error(`Duplicate debug parameter: ${key}`);
    seen.add(key);
  });
  const map = params.get("map") ?? "core.map:sandbox-flat";
  const definition = maps.find((entry) => entry.id === map);
  if (!definition) throw new Error(`Unknown map: ${map}`);
  const rawForces = params.get("force");
  const forces: DebugForce[] = (
    rawForces === null ? [`core.${FACTIONS[0]?.id ?? ""}`] : rawForces.split(";")
  ).map((value, index) => {
    const [id = "", color, ...extra] = value.split("@");
    const faction = FACTIONS.find(
      (entry) => id === `core.${entry.id}` || id === entry.id.replace("faction:", ""),
    );
    if (!faction || extra.length || (color !== undefined && !/^[a-fA-F0-9]{6}$/.test(color)))
      throw new Error(`Invalid faction/colour for Force ${index + 1}`);
    return {
      index,
      faction: `core.${faction.id}`,
      color: color === undefined ? faction.color : `#${color}`,
    };
  });
  const controlled = params.has("controlled")
    ? integer(params.get("controlled") ?? "", 7, "Controlled Force")
    : 0;
  validateDebugForces(forces, controlled);
  const rawSpawns = params.get("spawn");
  const spawns =
    rawSpawns === null
      ? []
      : rawSpawns.split(";").map((value): InitialSpawn => {
          const [id = "", location, ...extra] = value.split("@");
          const fields = location?.split(",") ?? [];
          if (extra.length || (fields.length !== 2 && fields.length !== 4))
            throw new Error("Spawn must be definition@x,y or definition@x,y,force,rotation");
          return {
            definition: id,
            x: integer(fields[0] ?? "", 511, "Spawn x"),
            y: integer(fields[1] ?? "", 511, "Spawn y"),
            force: fields.length === 2 ? 0 : integer(fields[2] ?? "", 7, "Spawn Force"),
            rotation: fields.length === 2 ? 0 : integer(fields[3] ?? "", 3, "Spawn rotation"),
          };
        });
  validateInitialSpawns(spawns, definition, forces, catalog);
  return { map, seed: parseDebugSeed(params.get("seed") ?? "1"), forces, controlled, spawns };
}

export function debugLink(base: string, setup: DebugLink): string {
  const url = new URL("/debug", base);
  url.searchParams.set("map", setup.map);
  url.searchParams.set("seed", String(setup.seed));
  url.searchParams.set(
    "force",
    setup.forces.map((force) => `${force.faction}@${force.color.slice(1)}`).join(";"),
  );
  url.searchParams.set("controlled", String(setup.controlled));
  if (setup.spawns.length)
    url.searchParams.set(
      "spawn",
      setup.spawns
        .map(
          (spawn) => `${spawn.definition}@${spawn.x},${spawn.y},${spawn.force},${spawn.rotation}`,
        )
        .join(";"),
    );
  return url.href;
}
