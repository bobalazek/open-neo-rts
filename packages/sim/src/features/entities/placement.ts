import { EDGE_MARGIN } from "@open-neo-rts/content";
import { type DebugSpawn, validateCommands } from "../../commands";
import type { Kernel } from "../../kernel";
import { resourceOccupies } from "../../match-map";
import { type CellRule, checkPlacement, type PlacementFailure } from "../construction";
import { Template, Transform } from ".";
import type { Definition } from "./definitions";

export type SpawnPlacementFailure =
  | "outside_map"
  | "missing_footprint"
  | "not_grid_aligned"
  | "not_quarter_turn"
  | "blocked";
export interface SpawnCell {
  x: number;
  y: number;
  /** Props have no terrain cell rule in content. */
  rule?: CellRule;
  failure?: PlacementFailure;
}
export interface SpawnPlacement {
  ok: boolean;
  failure?: SpawnPlacementFailure;
  cells?: SpawnCell[];
}

type Rectangle = { x: number; y: number; width: number; depth: number };
const cell = (position: number) => Math.floor(position / 1024);
const kind = (definition: Definition) => definition.id.split(":")[0]?.split(".").at(-1);
const rotation = (facing: number) => ((facing >>> 14) + 3) & 3;
function rectangle(definition: Definition, x: number, y: number, r: number): Rectangle {
  const [width = 1, depth = 1] = definition.footprint ?? [];
  return { x: cell(x), y: cell(y), width: r % 2 ? depth : width, depth: r % 2 ? width : depth };
}
const contains = (rectangle: Rectangle, x: number, y: number) =>
  x >= rectangle.x &&
  y >= rectangle.y &&
  x < rectangle.x + rectangle.width &&
  y < rectangle.y + rectangle.depth;
const blocks = (definition: Definition) =>
  kind(definition) === "structure" ||
  (kind(definition) === "prop" && definition.blocks !== "nothing");

/** Static geometry only. The caller exposes cell reasons through debug diagnostics, never seat views. */
export function checkSpawnPlacement(
  kernel: Kernel,
  definitions: readonly Definition[],
  spawn: DebugSpawn,
): SpawnPlacement {
  const map = kernel.map;
  if (!map) throw new Error("Spawn placement requires a map");
  const { x, y, facing } = spawn;
  if (x < 0 || y < 0 || x >= map.terrain.width * 1024 || y >= map.terrain.height * 1024)
    return { ok: false, failure: "outside_map" };
  const definition = definitions.find((d) => d.id === spawn.definition);
  if (!definition) return { ok: false, failure: "missing_footprint" };
  const unit = kind(definition) === "unit";
  if (!unit && (!definition.footprint || (kind(definition) === "prop" && !definition.blocks)))
    return { ok: false, failure: "missing_footprint" };
  if (!unit && (x % 1024 !== 0 || y % 1024 !== 0))
    return { ok: false, failure: "not_grid_aligned" };
  if (!unit && facing % 0x4000 !== 0) return { ok: false, failure: "not_quarter_turn" };

  if (unit && !definitions.some(blocks)) return { ok: true };

  const occupied: Rectangle[] = [];
  const units: { x: number; y: number }[] = [];
  for (const object of map.objects) {
    const found = definitions.find((d) => d.id === object.definition);
    if (!found) continue;
    if (kind(found) === "unit") {
      units.push({ x: cell(object.position[0]), y: cell(object.position[1]) });
    } else if (blocks(found))
      occupied.push(
        rectangle(found, object.position[0], object.position[1], Math.floor(object.rotation / 90)),
      );
  }
  for (const id of kernel.world.query(Template, Transform)) {
    const world = kernel.world;
    const found = definitions[world.get(id, Template, "definition")];
    if (!found) continue;
    const px = world.get(id, Transform, "x");
    const py = world.get(id, Transform, "y");
    if (kind(found) === "unit") units.push({ x: cell(px), y: cell(py) });
    else if (blocks(found))
      occupied.push(rectangle(found, px, py, rotation(world.get(id, Transform, "facing"))));
  }
  const staticBlocked = (cx: number, cy: number) => occupied.some((r) => contains(r, cx, cy));
  const isBlocked = (cx: number, cy: number) =>
    staticBlocked(cx, cy) ||
    (map.resources ?? []).some((resource) => resourceOccupies(resource, cx, cy)) ||
    units.some((position) => position.x === cx && position.y === cy);
  if (unit)
    return staticBlocked(cell(x), cell(y)) ? { ok: false, failure: "blocked" } : { ok: true };
  const r = rotation(facing);
  let result: SpawnPlacement;
  if (kind(definition) === "structure") {
    result = checkPlacement(
      map.terrain,
      {
        footprint: definition.footprint ?? [],
        ...(definition.cells && { cells: definition.cells }),
      },
      cell(x),
      cell(y),
      r,
      { isBlocked },
    );
  } else {
    // Props have no terrain cell rules in content; only their bounds and occupancy are enforced.
    const area = rectangle(definition, x, y, r);
    const cells: SpawnCell[] = [];
    for (let cy = area.y; cy < area.y + area.depth; cy++)
      for (let cx = area.x; cx < area.x + area.width; cx++) {
        const edge =
          cx < EDGE_MARGIN ||
          cy < EDGE_MARGIN ||
          cx >= map.terrain.width - EDGE_MARGIN ||
          cy >= map.terrain.height - EDGE_MARGIN;
        cells.push({
          x: cx,
          y: cy,
          ...(edge
            ? { failure: "edge" as const }
            : isBlocked(cx, cy)
              ? { failure: "blocked" as const }
              : {}),
        });
      }
    result = { ok: cells.every((c) => !c.failure), cells };
  }

  return result;
}

/** Explicit debug-only diagnostic channel; ordinary projections never expose footprint details. */
export function debugSpawnPlacement(
  kernel: Kernel,
  definitions: readonly Definition[],
  spawn: DebugSpawn,
): SpawnPlacement {
  if (!kernel.debug) throw new Error("Placement diagnostics require debug mode");
  const result = validateCommands(
    [{ tick: kernel.tick, sequence: 0, seat: 0, type: "debug.spawn", payload: spawn }],
    { debug: true },
  )[0];
  if (!result?.accepted) throw new Error("Invalid spawn diagnostic payload");
  return checkSpawnPlacement(kernel, definitions, spawn);
}
