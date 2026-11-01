import {
  arr,
  BIOMES,
  checkTerrain,
  type Issue,
  idOf,
  int,
  MAX_LEVEL,
  RAMP,
  SURFACES,
  str,
  WATER,
} from "@open-neo-rts/content";
import type { Definition } from "./features/entities";
import { strictObject } from "./snapshots/schema";

/** Resolved map input, with no file paths or gameplay policy. Positions are integer subcells. */
export interface MatchMap {
  readonly id: string;
  readonly terrain: {
    readonly width: number;
    readonly height: number;
    readonly level: readonly number[];
    readonly ramp: readonly number[];
    readonly surface: readonly number[];
    readonly water: readonly number[];
    readonly biome: readonly number[];
  };
  readonly spawns: readonly {
    readonly id: string;
    readonly position: readonly [number, number];
    /** Binary angle units. */
    readonly facing: number;
  }[];
  /** Static authored input only; occupancy and spawning are separate features. */
  readonly objects: readonly {
    readonly definition: string;
    readonly position: readonly [number, number];
    /** Degrees, one of 0, 90, 180, 270, as in the content map. */
    readonly rotation: number;
    readonly owner: string;
  }[];
}

const position = () => arr(int(0, 512 * 1024 - 1), 2, 2);
const spawnId = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const definitionId = /^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/;
export const matchMapSchema = strictObject({
  id: idOf("map"),
  terrain: strictObject({
    width: int(1, 512),
    height: int(1, 512),
    level: arr(int(0, MAX_LEVEL), 1, 512 * 512),
    ramp: arr(int(0, RAMP.west), 1, 512 * 512),
    surface: arr(int(0, SURFACES.length - 1), 1, 512 * 512),
    water: arr(int(0, WATER.deep), 1, 512 * 512),
    biome: arr(int(0, BIOMES.length - 1), 1, 512 * 512),
  }),
  spawns: arr(
    strictObject({ id: str(spawnId), position: position(), facing: int(0, 0xffff) }),
    0,
    8,
  ),
  objects: arr(
    strictObject({
      definition: str(definitionId),
      position: position(),
      rotation: int(0, 270),
      owner: str(spawnId),
    }),
  ),
});

/** Semantic checks after shape validation; shared by JSON replay and direct match creation. */
export function checkMatchMap(
  map: MatchMap,
  definitions: readonly Definition[],
  issues: Issue[],
  path = "$.setup.map",
): void {
  const { terrain, spawns, objects } = map;
  const { width, height } = terrain;
  let complete = true;
  for (const layer of ["level", "ramp", "surface", "water", "biome"] as const)
    if (terrain[layer].length !== width * height) {
      complete = false;
      issues.push({
        path: `${path}.terrain.${layer}`,
        message: `expected ${width * height} cells`,
      });
    }
  if (complete)
    for (const message of checkTerrain({
      ...terrain,
      level: new Uint8Array(terrain.level),
      ramp: new Uint8Array(terrain.ramp),
      surface: new Uint8Array(terrain.surface),
      water: new Uint8Array(terrain.water),
      biome: new Uint8Array(terrain.biome),
    }))
      issues.push({ path: `${path}.terrain`, message });
  const bounds = (position: readonly [number, number], at: string) => {
    if (position[0] >= width * 1024 || position[1] >= height * 1024)
      issues.push({ path: `${at}.position`, message: "outside map bounds" });
  };
  const spawnIds = new Set<string>();
  for (const [i, spawn] of spawns.entries()) {
    const at = `${path}.spawns[${i}]`;
    if (spawnIds.has(spawn.id)) issues.push({ path: `${at}.id`, message: "duplicate spawn ID" });
    spawnIds.add(spawn.id);
    bounds(spawn.position, at);
  }
  const definitionIds = new Set(definitions.map(({ id }) => id));
  for (const [i, object] of objects.entries()) {
    const at = `${path}.objects[${i}]`;
    bounds(object.position, at);
    if (object.rotation % 90 !== 0)
      issues.push({ path: `${at}.rotation`, message: "must be a multiple of 90" });
    if (object.owner !== "neutral" && !spawnIds.has(object.owner))
      issues.push({ path: `${at}.owner`, message: `undeclared spawn ${object.owner}` });
    if (!definitionIds.has(object.definition))
      issues.push({
        path: `${at}.definition`,
        message: `undeclared definition ${object.definition}`,
      });
  }
}

/** Copy in fixed field order and freeze every nested value; caller changes cannot alter a match. */
export function copyMatchMap(map: MatchMap): MatchMap {
  const { terrain } = map;
  const position = (value: readonly [number, number]) =>
    Object.freeze([value[0], value[1]] as [number, number]);
  return Object.freeze({
    id: map.id,
    terrain: Object.freeze({
      width: terrain.width,
      height: terrain.height,
      level: Object.freeze([...terrain.level]),
      ramp: Object.freeze([...terrain.ramp]),
      surface: Object.freeze([...terrain.surface]),
      water: Object.freeze([...terrain.water]),
      biome: Object.freeze([...terrain.biome]),
    }),
    spawns: Object.freeze(
      map.spawns.map((spawn) =>
        Object.freeze({
          id: spawn.id,
          position: position(spawn.position),
          facing: spawn.facing,
        }),
      ),
    ),
    objects: Object.freeze(
      map.objects.map((object) =>
        Object.freeze({
          definition: object.definition,
          position: position(object.position),
          rotation: object.rotation,
          owner: object.owner,
        }),
      ),
    ),
  });
}

/** Canonical JSON: fixed field order, row-major cells and authored spawn/object order. */
export function serializeMatchMap(map: MatchMap): string {
  return JSON.stringify(copyMatchMap(map));
}
