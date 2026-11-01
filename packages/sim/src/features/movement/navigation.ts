import {
  checkTerrain,
  DOMAINS,
  type GroundDomain,
  type MovementDomain,
  RAMP,
  SURFACE_ROUTE_COST,
  SURFACES,
  validate,
  WATER,
  WATER_PASSABLE,
} from "@open-neo-rts/content";
import { isqrt } from "@open-neo-rts/deterministic";
import { type MatchMap, matchMapSchema } from "../../match-map";
import { canTraverse, NAV_DIRECTIONS, type NavGrid } from "./path-search";

/** Original content projection; deliberately separate from persistent simulation definitions. */
export interface NavigationDefinition {
  id: string;
  footprint?: readonly number[];
  blocks?: "nothing" | "movement" | "movement-and-vision";
  domains?: readonly MovementDomain[];
}

export type NavigationObject = MatchMap["objects"][number];

export interface NavigationGrid extends NavGrid {
  /** Exact static obstruction geometry; derived from the immutable map, not simulation state. */
  barriers: readonly (readonly [number, number, number, number])[];
  domain: GroundDomain;
  radiusSubcells: number;
  /** Largest circular radius at each cell centre, capped at the content maximum (8 cells). */
  clearanceSubcells: Uint16Array;
  /** Physical speed percentage, independent of route costs. Zero for blocked cells. */
  speedPercent: Uint8Array;
}

const CELL = 1024;
const HALF = 512;
const MAX_RADIUS = 8 * CELL;
const kind = (id: string) => id.split(":")[0]?.split(".").at(-1);
const distance = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, a0 - b1, b0 - a1);

/** Heights at a ramp plane's corners, in whole level units. */
function height(t: MatchMap["terrain"], cell: number, x: number, y: number): number {
  const ramp = t.ramp[cell];
  return (
    (t.level[cell] as number) +
    (ramp === RAMP.north
      ? 1 - y
      : ramp === RAMP.east
        ? x
        : ramp === RAMP.south
          ? y
          : ramp === RAMP.west
            ? 1 - x
            : 0)
  );
}

function continuous(t: MatchMap["terrain"], a: number, b: number, east: boolean): boolean {
  return east
    ? height(t, a, 1, 0) === height(t, b, 0, 0) && height(t, a, 1, 1) === height(t, b, 0, 1)
    : height(t, a, 0, 1) === height(t, b, 0, 0) && height(t, a, 1, 1) === height(t, b, 1, 0);
}

/**
 * Pure standalone compiler. Objects are NW cell anchors in subcells, rotations in degrees.
 * liveObjects adds static blockers to authored map objects; units and resources never block this grid.
 * Supply original content domains/footprints. Keep returned arrays unchanged while searches use them.
 */
export function compileNavigation(
  map: MatchMap,
  definitions: readonly NavigationDefinition[],
  profile: { domain: GroundDomain; radiusSubcells: number },
  liveObjects: readonly NavigationObject[] = [],
): NavigationGrid {
  const { domain, radiusSubcells } = profile;
  if (
    !Object.hasOwn(WATER_PASSABLE, domain) ||
    !Number.isInteger(radiusSubcells) ||
    radiusSubcells < 0 ||
    radiusSubcells > MAX_RADIUS
  )
    throw new RangeError("Navigation requires a ground domain and integer radius in [0, 8192]");
  const objects = [...map.objects, ...liveObjects];
  const issues = validate(matchMapSchema, { ...map, objects });
  if (issues.length) throw new RangeError("Invalid navigation map shape");
  const t = map.terrain;
  const { width, height: rows } = t;
  const cells = width * rows;
  const layers = ["level", "ramp", "water", "surface", "biome"] as const;
  if (layers.some((layer) => t[layer].length !== cells))
    throw new RangeError("Navigation terrain layers must contain width × height cells");
  const terrainIssues = checkTerrain({
    width,
    height: rows,
    level: new Uint8Array(t.level),
    ramp: new Uint8Array(t.ramp),
    water: new Uint8Array(t.water),
    surface: new Uint8Array(t.surface),
    biome: new Uint8Array(t.biome),
  });
  if (terrainIssues.length)
    throw new RangeError(`Invalid navigation terrain: ${terrainIssues.join("; ")}`);
  const byId = new Map<string, NavigationDefinition>();
  for (const definition of definitions) {
    if (
      !/^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(definition.id) ||
      byId.has(definition.id) ||
      (definition.footprint &&
        (definition.footprint.length !== 2 ||
          definition.footprint.some((n) => !Number.isInteger(n) || n < 1 || n > 8))) ||
      (definition.blocks !== undefined &&
        !["nothing", "movement", "movement-and-vision"].includes(definition.blocks)) ||
      (definition.domains &&
        (!definition.domains.length || definition.domains.some((d) => !DOMAINS.includes(d))))
    )
      throw new RangeError("Invalid navigation definition");
    byId.set(definition.id, definition);
  }
  const cost = new Uint16Array(cells);
  const speedPercent = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    if (!WATER_PASSABLE[domain][t.water[i] as 0 | 1 | 2]) continue;
    const shallowWheels = domain === "wheeled" && t.water[i] === WATER.shallow;
    cost[i] =
      SURFACE_ROUTE_COST[SURFACES[t.surface[i] as number] as keyof typeof SURFACE_ROUTE_COST] *
      (shallowWheels ? 2 : 1);
    speedPercent[i] = shallowWheels ? 50 : 100;
  }
  for (const object of objects) {
    const definition = byId.get(object.definition);
    if (!definition) throw new RangeError(`Unknown navigation definition: ${object.definition}`);
    if (object.position[0] >= width * CELL || object.position[1] >= rows * CELL)
      throw new RangeError("Navigation object outside map");
    if (kind(definition.id) === "unit") continue;
    const [w, d] = definition.footprint ?? [];
    const [px, py] = object.position;
    if (
      w === undefined ||
      d === undefined ||
      !Number.isInteger(px) ||
      !Number.isInteger(py) ||
      px % CELL !== 0 ||
      py % CELL !== 0 ||
      ![0, 90, 180, 270].includes(object.rotation) ||
      (kind(definition.id) === "prop" && definition.blocks === undefined)
    )
      throw new RangeError(
        "Static navigation objects require footprints and cell/quarter-turn alignment",
      );
    const turned = object.rotation % 180 !== 0;
    const cols = turned ? d : w;
    const depth = turned ? w : d;
    const x = Math.floor(px / CELL);
    const y = Math.floor(py / CELL);
    if (x < 0 || y < 0 || x + cols > width || y + depth > rows)
      throw new RangeError("Static navigation footprint outside map");
    if (
      kind(definition.id) === "prop" &&
      (definition.blocks === "nothing" ||
        (definition.domains && !definition.domains.includes(domain)))
    )
      continue;
    for (let cy = y; cy < y + depth; cy++)
      for (let cx = x; cx < x + cols; cx++) cost[cy * width + cx] = 0;
  }

  const centre = new Uint32Array(cells);
  const barriers: [number, number, number, number][] = [];
  const east = new Uint32Array(cells);
  const south = new Uint32Array(cells);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const boundary = Math.min(
        MAX_RADIUS,
        x * CELL + HALF,
        y * CELL + HALF,
        (width - x) * CELL - HALF,
        (rows - y) * CELL - HALF,
      );
      centre[i] = boundary * boundary;
      const ex = Math.min(boundary, Math.max(0, (width - x) * CELL - HALF - CELL));
      const sy = Math.min(boundary, Math.max(0, (rows - y) * CELL - HALF - CELL));
      east[i] = ex * ex;
      south[i] = sy * sy;
    }
  // Distance to an axis-aligned obstacle rectangle (cliffs have zero width or depth).
  const barrier = (x0: number, y0: number, x1: number, y1: number) => {
    barriers.push([x0, y0, x1, y1]);
    const left = Math.max(0, Math.floor((x0 - MAX_RADIUS - HALF - CELL) / CELL));
    const top = Math.max(0, Math.floor((y0 - MAX_RADIUS - HALF - CELL) / CELL));
    const right = Math.min(width - 1, Math.floor((x1 + MAX_RADIUS - HALF) / CELL));
    const bottom = Math.min(rows - 1, Math.floor((y1 + MAX_RADIUS - HALF) / CELL));
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const i = y * width + x;
        if (!cost[i]) continue;
        const px = x * CELL + HALF;
        const py = y * CELL + HALF;
        const dx = distance(px, px, x0, x1);
        const dy = distance(py, py, y0, y1);
        centre[i] = Math.min(centre[i] as number, dx * dx + dy * dy);
        const ex = distance(px, px + CELL, x0, x1);
        const sy = distance(py, py + CELL, y0, y1);
        east[i] = Math.min(east[i] as number, ex * ex + dy * dy);
        south[i] = Math.min(south[i] as number, dx * dx + sy * sy);
      }
  };
  const connections = new Uint8Array(cells);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!cost[i]) barrier(x * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL);
      if (x + 1 < width) {
        if (continuous(t, i, i + 1, true)) {
          connections[i] = (connections[i] as number) | (1 << 4);
          connections[i + 1] = (connections[i + 1] as number) | (1 << 3);
        } else barrier((x + 1) * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL);
      }
      if (y + 1 < rows) {
        if (continuous(t, i, i + width, false)) {
          connections[i] = (connections[i] as number) | (1 << 6);
          connections[i + width] = (connections[i + width] as number) | (1 << 1);
        } else barrier(x * CELL, (y + 1) * CELL, (x + 1) * CELL, (y + 1) * CELL);
      }
    }
  const clearanceSubcells = new Uint16Array(cells);
  const required = radiusSubcells * radiusSubcells;
  for (let i = 0; i < cells; i++) {
    clearanceSubcells[i] = cost[i] ? isqrt(centre[i] as number) : 0;
    if ((centre[i] as number) < required) cost[i] = 0;
    if (!cost[i]) speedPercent[i] = 0;
  }
  const grid: NavigationGrid = {
    barriers,
    width,
    height: rows,
    domain,
    radiusSubcells,
    cost,
    connections,
    clearanceSubcells,
    speedPercent,
  };
  for (let i = 0; i < cells; i++) {
    if (!cost[i]) {
      connections[i] = 0;
      continue;
    }
    for (const [direction, [dx, dy]] of NAV_DIRECTIONS.entries()) {
      if (dx !== 0 && dy !== 0) continue;
      const x = (i % width) + dx;
      const y = Math.floor(i / width) + dy;
      const next = y * width + x;
      const squared = dx > 0 ? east[i] : dx < 0 ? east[next] : dy > 0 ? south[i] : south[next];
      if (
        x < 0 ||
        y < 0 ||
        x >= width ||
        y >= rows ||
        !cost[next] ||
        (squared as number) < required
      )
        connections[i] = (connections[i] as number) & ~(1 << direction);
    }
  }
  for (let i = 0; i < cells; i++) {
    if (!cost[i]) continue;
    for (const [direction, [dx, dy]] of NAV_DIRECTIONS.entries()) {
      if (dx === 0 || dy === 0) continue;
      const x = (i % width) + dx;
      const y = Math.floor(i / width) + dy;
      if (x < 0 || y < 0 || x >= width || y >= rows) continue;
      connections[i] = (connections[i] as number) | (1 << direction);
      if (!canTraverse(grid, i, y * width + x, direction))
        connections[i] = (connections[i] as number) & ~(1 << direction);
    }
  }
  return grid;
}
