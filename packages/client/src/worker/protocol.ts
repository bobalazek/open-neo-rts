import { WATER_PASSABLE } from "@open-neo-rts/content";
import type {
  DebugOverlayData,
  DebugOverlayOptions,
  DebugSpawn,
  MatchSetup,
  ProjectionMode,
  Scenario,
  SeatSnapshot,
  SpawnPlacement,
} from "@open-neo-rts/sim";

export interface PlacementDiagnostic extends SpawnPlacement {
  /** Tick evaluated by the authoritative checker. */
  tick: number;
}

/** Copied placement results cross the worker boundary independently of seat state. */
export function isPlacementDiagnostic(value: unknown): value is PlacementDiagnostic {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.tick) ||
    Number(value.tick) < 0 ||
    typeof value.ok !== "boolean"
  )
    return false;
  if (
    value.failure !== undefined &&
    (typeof value.failure !== "string" ||
      ![
        "outside_map",
        "missing_footprint",
        "not_grid_aligned",
        "not_quarter_turn",
        "blocked",
      ].includes(value.failure))
  )
    return false;
  if (
    value.cells !== undefined &&
    (!Array.isArray(value.cells) ||
      // Content footprints are bounded to 8×8 cells.
      value.cells.length > 64 ||
      ![...value.cells].every(
        (cell: unknown) =>
          isRecord(cell) &&
          Number.isSafeInteger(cell.x) &&
          Number(cell.x) >= 0 &&
          Number.isSafeInteger(cell.y) &&
          Number(cell.y) >= 0 &&
          (cell.rule === undefined ||
            ["land", "shore", "water", "node"].some((rule) => rule === cell.rule)) &&
          (cell.failure === undefined ||
            [
              "edge",
              "water",
              "deep_water",
              "not_deep_water",
              "ramp",
              "surface",
              "node_undecided",
              "not_node",
              "level",
              "blocked",
            ].some((reason) => reason === cell.failure)),
      ))
  )
    return false;
  const failedCell = value.cells?.some((cell: { failure?: unknown }) => cell.failure !== undefined);
  return value.ok
    ? value.failure === undefined && !failedCell
    : value.failure !== undefined || !!failedCell;
}

export interface OfflineSetup {
  setup: MatchSetup;
  seat: number;
  mode: ProjectionMode;
}
export interface OfflineState {
  snapshot: SeatSnapshot;
  paused: boolean;
  speed: number;
  /** Full-state hash is a debug inspection tool, never part of a normal seat view. */
  hash?: string;
  overlays?: DebugOverlayData;
  /** Last sim.step duration only, excluding projection, hashing and message transport. */
  tickMs?: number;
}
export interface DebugSessionExport {
  scenario: Scenario;
  tick: number;
  hash: string;
}
export function isDebugSessionExport(value: unknown): value is DebugSessionExport {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.tick) &&
    Number(value.tick) >= 0 &&
    typeof value.hash === "string" &&
    /^[a-f0-9]{16}$/.test(value.hash) &&
    isRecord(value.scenario) &&
    value.scenario.format === 2 &&
    Number.isSafeInteger(value.scenario.simVersion) &&
    isRecord(value.scenario.setup) &&
    Array.isArray(value.scenario.commands)
  );
}
export type WorkerRequest =
  | { type: "init"; options: OfflineSetup }
  | { type: "command"; command: { type: string; payload: unknown } }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: number }
  | { type: "placement"; spawn: DebugSpawn }
  | { type: "overlays"; options: DebugOverlayOptions }
  | { type: "step" | "export" | "export-session" };

export interface WorkerReply {
  id: number;
  state?: OfflineState;
  result?: unknown;
  error?: string;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const integerArray = (value: unknown, length: number, max: number) =>
  Array.isArray(value) &&
  value.length === length &&
  [...value].every((n) => Number.isInteger(n) && n >= 0 && n <= max);
const point = (value: unknown) =>
  isRecord(value) &&
  [value.x, value.y].every((n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 524288);

export function isOverlayData(value: unknown): value is DebugOverlayData {
  if (!isRecord(value) || !Number.isSafeInteger(value.tick) || Number(value.tick) < 0) return false;
  for (const [key, layers] of [
    ["terrain", ["level", "ramp", "surface", "water", "biome"]],
    ["navigation", ["cost", "connections", "speedPercent"]],
  ] as const) {
    const grid = value[key];
    if (grid === undefined) continue;
    if (
      !isRecord(grid) ||
      !Number.isInteger(grid.width) ||
      !Number.isInteger(grid.height) ||
      Number(grid.width) < 1 ||
      Number(grid.width) > 512 ||
      Number(grid.height) < 1 ||
      Number(grid.height) > 512
    )
      return false;
    const cells = Number(grid.width) * Number(grid.height);
    if (
      !layers.every((layer) =>
        integerArray(
          grid[layer],
          cells,
          {
            level: 7,
            ramp: 4,
            surface: 7,
            water: 2,
            biome: 3,
            cost: 65535,
            connections: 255,
            speedPercent: 255,
          }[layer],
        ),
      )
    )
      return false;
    if (
      key === "navigation" &&
      (typeof grid.domain !== "string" ||
        !Object.hasOwn(WATER_PASSABLE, grid.domain) ||
        !Number.isSafeInteger(grid.revision) ||
        Number(grid.revision) < 1 ||
        !Number.isInteger(grid.radiusSubcells) ||
        Number(grid.radiusSubcells) < 0 ||
        Number(grid.radiusSubcells) > 8192)
    )
      return false;
  }
  return (
    value.paths === undefined ||
    (Array.isArray(value.paths) &&
      [...value.paths].every(
        (path) =>
          isRecord(path) &&
          typeof path.handle === "string" &&
          typeof path.searching === "boolean" &&
          point(path.target) &&
          Array.isArray(path.points) &&
          path.points.length <= 262145 &&
          [...path.points].every(point),
      ))
  );
}

/** Validate the copied wire shape before a consumer sees it. */
export function isWorkerReply(value: unknown): value is WorkerReply {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || Number(value.id) < 0) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.state === undefined) return true;
  const state = value.state;
  if (
    !isRecord(state) ||
    typeof state.paused !== "boolean" ||
    typeof state.speed !== "number" ||
    ![0.25, 0.5, 1, 2, 4, 8].includes(state.speed)
  )
    return false;
  if (state.overlays !== undefined && !isOverlayData(state.overlays)) return false;
  if (
    state.hash !== undefined &&
    (typeof state.hash !== "string" || !/^[a-f0-9]{16}$/.test(state.hash))
  )
    return false;
  const snapshot = state.snapshot;
  if (
    state.tickMs !== undefined &&
    (typeof state.tickMs !== "number" || !Number.isFinite(state.tickMs) || state.tickMs < 0)
  )
    return false;
  if (
    !isRecord(snapshot) ||
    !Number.isSafeInteger(snapshot.tick) ||
    Number(snapshot.tick) < 0 ||
    !["controlled", "debug-no-fog"].includes(String(snapshot.mode)) ||
    !Array.isArray(snapshot.entities)
  )
    return false;
  if (
    state.overlays !== undefined &&
    (state.overlays.tick !== snapshot.tick || snapshot.mode !== "debug-no-fog")
  )
    return false;
  return snapshot.entities.every((entity: unknown) => {
    if (
      !isRecord(entity) ||
      typeof entity.handle !== "string" ||
      typeof entity.definition !== "string"
    )
      return false;
    if (
      ![entity.force, entity.x, entity.y, entity.facing, entity.health, entity.maxHealth].every(
        Number.isInteger,
      )
    )
      return false;
    return (
      entity.order === null ||
      (isRecord(entity.order) &&
        (entity.order.type === "move" || entity.order.type === "attackMove") &&
        Number.isInteger(entity.order.x) &&
        Number.isInteger(entity.order.y))
    );
  });
}
