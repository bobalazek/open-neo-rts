// Placement on the grid: footprint cell rules against terrain. Phase 1b. Build progress, sell and repair: phase 2.
// Radius and unit clearance remain owner-gated; this checker implements static footprint rules only.

import { BUILDABLE, EDGE_MARGIN, RAMP, SURFACES, WATER } from "@open-neo-rts/content";

export interface PlacementTerrain {
  width: number;
  height: number;
  level: ArrayLike<number>;
  ramp: ArrayLike<number>;
  surface: ArrayLike<number>;
  water: ArrayLike<number>;
}

/** Footprint cell rules, by their letter in a structure's `cells` rows (structures.md#placement). */
export const CELL_RULES = { l: "land", s: "shore", w: "water", n: "node" } as const;
export type CellRule = (typeof CELL_RULES)[keyof typeof CELL_RULES];

/** Every way a footprint cell can fail, with its reason. */
export const PLACEMENT_FAILURES = {
  edge: `Off the map or closer than ${EDGE_MARGIN} cells to its edge.`,
  water: "A land cell is on water.",
  deep_water: "A shore cell is on deep water.",
  not_deep_water: "A water cell isn't on deep water.",
  ramp: "Ramps can't be built on.",
  surface: "Structures can't be built on this surface.",
  node_undecided: "Node placement isn't decided yet (docs/project/human-tasks.md).",
  not_node: "A node cell isn't on a node of the structure's kind.",
  level: "Not on the footprint's height level: a structure doesn't span a cliff.",
  blocked: "Taken by a structure, blocking prop or resource field.",
} as const;
export type PlacementFailure = keyof typeof PLACEMENT_FAILURES;

export interface PlacedCell {
  x: number;
  y: number;
  rule: CellRule;
  /** Missing where the rule is satisfied. */
  failure?: PlacementFailure;
}

/** What placement asks the world about a cell. */
export interface PlacementWorld {
  /** Structures, blocking props, resource field cells, units; later build radius and clearance. */
  isBlocked: (x: number, y: number) => boolean;
  /** Whether a node of the structure's kind is at the cell. Without it, every `node` cell fails. */
  isNode?: (x: number, y: number) => boolean;
}

/**
 * Checks a structure's footprint at cell (x, y) with `rotation` quarter turns. `footprint` is [width, depth];
 * `cells` has one row per depth, back (row 0) to front, one rule letter per width cell, and without it every
 * cell is land. At rotation 0 the front faces south (+y), so row r, column c is cell (x + c, y + r). Each
 * rotation turns the footprint a quarter clockwise seen from above (north up): the front faces south, west,
 * north, east at rotations 0 to 3, i.e. facing 90° + 90° × rotation. (x, y) is always the north-west corner
 * of the turned footprint, which spans width × depth cells at rotations 0 and 2 and depth × width at 1 and 3.
 *
 * Returns every footprint cell in row-major order (y, then x) with the first rule it breaks: edge, its cell
 * rule, level, then `isBlocked`. The footprint's level is its most common one, the lowest on a tie, so the
 * cells on other levels are the ones marked. `isBlocked` and `isNode` are called only for cells on the map.
 */
export function checkPlacement(
  t: PlacementTerrain,
  {
    footprint: [w = 1, d = 1],
    cells: letters,
  }: { footprint: readonly number[]; cells?: readonly string[] },
  x: number,
  y: number,
  rotation: number,
  world: PlacementWorld,
): { ok: boolean; cells: PlacedCell[] } {
  const r = rotation & 3;
  const [cols, rows] = r % 2 ? [d, w] : [w, d];
  const onMap = (cx: number, cy: number) =>
    cx >= EDGE_MARGIN &&
    cy >= EDGE_MARGIN &&
    cx < t.width - EDGE_MARGIN &&
    cy < t.height - EDGE_MARGIN;
  const cells: PlacedCell[] = [];
  const counts = new Uint16Array(256);
  for (let dy = 0; dy < rows; dy++)
    for (let dx = 0; dx < cols; dx++) {
      // Column and row in `cells` of the cell dx right of and dy below the corner.
      const [c, row] =
        r === 0
          ? [dx, dy]
          : r === 1
            ? [dy, d - 1 - dx]
            : r === 2
              ? [w - 1 - dx, d - 1 - dy]
              : [w - 1 - dy, dx];
      const letter = (letters?.[row]?.[c] ?? "l") as keyof typeof CELL_RULES;
      cells.push({ x: x + dx, y: y + dy, rule: CELL_RULES[letter] ?? "land" });
      if (!onMap(x + dx, y + dy)) continue;
      const l = t.level[(y + dy) * t.width + x + dx] ?? 0;
      counts[l] = (counts[l] ?? 0) + 1;
    }
  let level = 0;
  for (let l = 1; l < counts.length; l++) if ((counts[l] ?? 0) > (counts[level] ?? 0)) level = l;
  for (const cell of cells) {
    const failure = onMap(cell.x, cell.y) ? check(t, cell, level, world) : "edge";
    if (failure) cell.failure = failure;
  }
  return { ok: cells.every((c) => !c.failure), cells };
}

function check(
  t: PlacementTerrain,
  { x, y, rule }: PlacedCell,
  level: number,
  world: PlacementWorld,
): PlacementFailure | undefined {
  const i = y * t.width + x;
  const water = t.water[i];
  const surface = SURFACES[t.surface[i] ?? 0];
  const ground = rule === "land" || rule === "shore";
  if (rule === "land" && water !== WATER.none) return "water";
  if (rule === "shore" && water === WATER.deep) return "deep_water";
  if (rule === "water" && water !== WATER.deep) return "not_deep_water";
  if (rule === "node" && !world.isNode) return "node_undecided";
  if (rule === "node" && !world.isNode?.(x, y)) return "not_node";
  if (ground && t.ramp[i] !== RAMP.none) return "ramp";
  if (ground && water === WATER.none && !(surface && BUILDABLE[surface])) return "surface";
  if (t.level[i] !== level) return "level";
  if (world.isBlocked(x, y)) return "blocked";
}
