import {
  arr,
  BIOMES,
  checkTerrain,
  type Issue,
  idOf,
  int,
  MAX_LEVEL,
  oneOf,
  opt,
  RAMP,
  SURFACES,
  str,
  validate,
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
  /** Authored resource centres/radii in integer subcells. Absence means an empty resource layer. */
  readonly resources?: readonly MatchResource[];
  /** Static authored input only; occupancy and spawning are separate features. */
  readonly objects: readonly {
    readonly definition: string;
    readonly position: readonly [number, number];
    /** Degrees, one of 0, 90, 180, 270, as in the content map. */
    readonly rotation: number;
    readonly owner: string;
  }[];
}

export interface MatchResource {
  readonly kind: "ore" | "materials";
  readonly position: readonly [number, number];
  readonly amount: number;
  readonly radius?: number;
}

const position = () => arr(int(0, 512 * 1024 - 1), 2, 2);
const spawnId = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const definitionId = /^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/;
const resourceSchema = strictObject({
  kind: oneOf(["ore", "materials"]),
  position: position(),
  amount: int(1, 0x7fffffff),
  radius: opt(int(0, 20 * 1024)),
});

/** Content units are converted once; resource geometry follows the existing map preview. */
export function toMatchResources(
  resources: readonly {
    kind: string;
    position: readonly number[];
    amount: number;
    radius?: number;
  }[],
): MatchResource[] {
  return resources.map((resource) => {
    const result = {
      kind: resource.kind,
      position: resource.position.map((coordinate) => Math.round(coordinate * 1024)),
      amount: resource.amount,
      ...(resource.radius !== undefined && { radius: Math.round(resource.radius * 1024) }),
    };
    const issues = validate(resourceSchema, result);
    if (issues.length)
      throw new Error(
        `Invalid resource: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      );
    return result as unknown as MatchResource;
  });
}

/** Ore uses the accepted inclusive integer-cell disc; material nodes are centred 2×2 footprints. */
export function resourceOccupies(resource: MatchResource, x: number, y: number): boolean {
  const [px, py] = resource.position;
  if (resource.kind === "materials")
    return (
      x >= Math.floor(px / 1024) - 1 &&
      x <= Math.floor(px / 1024) &&
      y >= Math.floor(py / 1024) - 1 &&
      y <= Math.floor(py / 1024)
    );
  const dx = x * 1024 - px;
  const dy = y * 1024 - py;
  const radius = resource.radius ?? 1024;
  return dx * dx + dy * dy <= radius * radius;
}

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
  resources: opt(arr(resourceSchema)),
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
  for (const [index, definition] of definitions.entries()) {
    if (definition.id.split(":")[0]?.split(".").at(-1) !== "unit") continue;
    for (const field of ["domain", "radiusSubcells"] as const)
      if (definition[field] === undefined)
        issues.push({
          path: `$.setup.definitions[${index}].${field}`,
          message: "map units require original movement domain and collision radius",
        });
  }
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
  for (const [i, resource] of (map.resources ?? []).entries()) {
    const at = `${path}.resources[${i}]`;
    bounds(resource.position, at);
  }
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
    const definition = definitions.find((d) => d.id === object.definition);
    if (definition && !/(^|\.)unit:/.test(definition.id)) {
      if (!definition.footprint || (/prop:/.test(definition.id) && !definition.blocks))
        issues.push({
          path: `${at}.definition`,
          message: "static object requires footprint metadata",
        });
      else {
        if (object.position.some((coordinate) => coordinate % 1024 !== 0))
          issues.push({
            path: `${at}.position`,
            message: "static objects must align to the cell grid",
          });
        const [w, d] = definition.footprint;
        const turned = object.rotation % 180 !== 0;
        if (
          object.position[0] + (turned ? d : w) * 1024 > width * 1024 ||
          object.position[1] + (turned ? w : d) * 1024 > height * 1024
        )
          issues.push({ path: `${at}.position`, message: "static footprint outside map bounds" });
      }
    }
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
    ...(map.resources && {
      resources: Object.freeze(
        map.resources.map((resource) =>
          Object.freeze({
            kind: resource.kind,
            position: position(resource.position),
            amount: resource.amount,
            ...(resource.radius !== undefined && { radius: resource.radius }),
          }),
        ),
      ),
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
