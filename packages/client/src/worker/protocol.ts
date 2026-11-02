import { RESOURCES, WATER_PASSABLE } from "@open-neo-rts/content";
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
import {
  COMBAT_EVENT_TYPES,
  CONSTRUCTION_REFUSALS,
  EXTRACTION_STATUSES,
  HARVEST_STATUSES,
  MAX_COMBAT_EVENTS,
  PRODUCTION_STATUSES,
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
  /** Full sim.step wall time, including command ingestion/logging and periodic checkpoints.
   * Excludes subsequent projection, debug-publish hashing, transport and scheduling. */
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

const stocks: readonly string[] = RESOURCES.filter((resource) => resource.kind === "stock").map(
  (resource) => resource.id,
);
function isBankSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 2 ||
    !Object.hasOwn(value, "force") ||
    !Object.hasOwn(value, "resources") ||
    !Number.isInteger(value.force) ||
    Number(value.force) < 0 ||
    Number(value.force) > 0x7fffffff ||
    !isRecord(value.resources)
  )
    return false;
  const resources = value.resources;
  return (
    (Object.getPrototypeOf(resources) === Object.prototype ||
      Object.getPrototypeOf(resources) === null) &&
    Reflect.ownKeys(resources).length === stocks.length &&
    stocks.every((resource) => {
      const amount: unknown = Object.getOwnPropertyDescriptor(resources, resource)?.value;
      return (
        typeof amount === "number" &&
        Number.isInteger(amount) &&
        amount >= 0 &&
        amount <= 0x7fffffff
      );
    })
  );
}

function isExtractionSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 3
  )
    return false;
  const kind: unknown = Object.getOwnPropertyDescriptor(value, "kind")?.value;
  const remaining: unknown = Object.getOwnPropertyDescriptor(value, "remaining")?.value;
  const status: unknown = Object.getOwnPropertyDescriptor(value, "status")?.value;
  if (!EXTRACTION_STATUSES.some((valid) => valid === status)) return false;
  if (status === "invalid_node") return kind === null && remaining === null;
  if (kind !== "materials" && kind !== "oil") return false;
  if (remaining === null) return kind === "oil" && status !== "depleted";
  return (
    typeof remaining === "number" &&
    Number.isInteger(remaining) &&
    remaining >= 0 &&
    remaining <= 0x7fffffff &&
    (status !== "depleted" || remaining === 0)
  );
}

function isHarvestSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 4
  )
    return false;
  const cargo: unknown = Object.getOwnPropertyDescriptor(value, "cargo")?.value;
  const capacity: unknown = Object.getOwnPropertyDescriptor(value, "capacity")?.value;
  const status: unknown = Object.getOwnPropertyDescriptor(value, "status")?.value;
  const unloadTicks: unknown = Object.getOwnPropertyDescriptor(value, "unloadTicks")?.value;
  return (
    typeof cargo === "number" &&
    Number.isInteger(cargo) &&
    cargo >= 0 &&
    typeof capacity === "number" &&
    Number.isInteger(capacity) &&
    capacity >= 1 &&
    capacity <= 0x7fffffff &&
    cargo <= capacity &&
    HARVEST_STATUSES.some((valid) => valid === status) &&
    typeof unloadTicks === "number" &&
    Number.isInteger(unloadTicks) &&
    unloadTicks >= 0 &&
    unloadTicks <= 40 &&
    (status !== "bank_full" || (unloadTicks === 40 && cargo > 0))
  );
}

function isPowerSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 4
  )
    return false;
  for (const key of ["force", "used", "produced"]) {
    const amount: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > 0x7fffffff
    )
      return false;
  }
  const brownout: unknown = Object.getOwnPropertyDescriptor(value, "brownout")?.value;
  return typeof brownout === "boolean" && brownout === Number(value.used) > Number(value.produced);
}

function isEntityPower(value: unknown): boolean {
  if (
    !isRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 3
  )
    return false;
  const amount: unknown = Object.getOwnPropertyDescriptor(value, "amount")?.value;
  const enabled: unknown = Object.getOwnPropertyDescriptor(value, "enabled")?.value;
  const powered: unknown = Object.getOwnPropertyDescriptor(value, "powered")?.value;
  return (
    typeof amount === "number" &&
    Number.isInteger(amount) &&
    amount >= -0x80000000 &&
    amount <= 0x7fffffff &&
    typeof enabled === "boolean" &&
    typeof powered === "boolean" &&
    (enabled || !powered)
  );
}

const bounded = (value: unknown, max = 0x7fffffff) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

function isFog(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 8) return false;
  let previous = -1,
    width = 0,
    height = 0;
  for (const grid of value) {
    if (
      !isRecord(grid) ||
      !exact(grid, ["group", "width", "height", "cells"]) ||
      !bounded(grid.group) ||
      Number(grid.group) <= previous ||
      !bounded(grid.width, 512) ||
      !grid.width ||
      !bounded(grid.height, 512) ||
      !grid.height ||
      !(grid.cells instanceof Uint8Array) ||
      Object.getPrototypeOf(grid.cells) !== Uint8Array.prototype ||
      grid.cells.length !== Number(grid.width) * Number(grid.height) ||
      Reflect.ownKeys(grid.cells).length !== grid.cells.length ||
      !grid.cells.every((cell) => cell <= 2) ||
      (width !== 0 && (grid.width !== width || grid.height !== height))
    )
      return false;
    previous = Number(grid.group);
    width = Number(grid.width);
    height = Number(grid.height);
  }
  return true;
}

function isGhosts(value: unknown, fog: unknown, tick: number, entities: unknown[]): boolean {
  if (!Array.isArray(value) || !Array.isArray(fog)) return false;
  const handles = new Set(entities.filter(isRecord).map((entity) => entity.handle));
  for (const ghost of value) {
    if (
      !isRecord(ghost) ||
      !exact(ghost, [
        "handle",
        "group",
        "definition",
        "force",
        "x",
        "y",
        "facing",
        "health",
        "maxHealth",
        "seen",
        ...(ghost.constructionSite === undefined ? [] : ["constructionSite"]),
      ]) ||
      typeof ghost.handle !== "string" ||
      !/^g[1-9][0-9]*$/.test(ghost.handle) ||
      handles.has(ghost.handle) ||
      typeof ghost.definition !== "string" ||
      !/^([a-z0-9-]+\.)?structure:[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(ghost.definition) ||
      !bounded(ghost.force) ||
      !bounded(ghost.group) ||
      !bounded(ghost.facing, 0xffff) ||
      !bounded(ghost.health, 0xffffffff) ||
      !ghost.health ||
      !bounded(ghost.maxHealth, 0x7fffffff) ||
      !ghost.maxHealth ||
      !bounded(ghost.seen, tick) ||
      !point(ghost) ||
      Number(ghost.x) % 1024 !== 0 ||
      Number(ghost.y) % 1024 !== 0 ||
      Number(ghost.facing) % 0x4000 !== 0 ||
      (ghost.constructionSite !== undefined && ghost.constructionSite !== true)
    )
      return false;
    const grid = fog.find((entry) => isRecord(entry) && entry.group === ghost.group);
    if (
      !isRecord(grid) ||
      Number(ghost.x) >= Number(grid.width) * 1024 ||
      Number(ghost.y) >= Number(grid.height) * 1024
    )
      return false;
    handles.add(ghost.handle);
  }
  return true;
}

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
  if (state.hash !== undefined && snapshot.mode !== "debug-no-fog") return false;
  if (snapshot.fog !== undefined || snapshot.ghosts !== undefined) {
    if (
      snapshot.mode !== "controlled" ||
      !isFog(snapshot.fog) ||
      !isGhosts(snapshot.ghosts, snapshot.fog, Number(snapshot.tick), snapshot.entities)
    )
      return false;
  }
  if (snapshot.combatEvents !== undefined) {
    if (
      snapshot.mode !== "controlled" ||
      !Array.isArray(snapshot.combatEvents) ||
      snapshot.combatEvents.length > MAX_COMBAT_EVENTS ||
      ![...snapshot.combatEvents].every((event: unknown) => {
        if (
          !isRecord(event) ||
          Object.getPrototypeOf(event) !== Object.prototype ||
          Reflect.ownKeys(event).some(
            (key) =>
              typeof key !== "string" ||
              !["type", "x", "y", "amount", "projectile", "handle", "entity"].includes(key),
          )
        )
          return false;
        if (
          !COMBAT_EVENT_TYPES.some((type) => type === event.type) ||
          ![event.x, event.y].every(
            (value) =>
              typeof value === "number" &&
              Number.isInteger(value) &&
              value >= 0 &&
              value < 512 * 1024,
          )
        )
          return false;
        if (
          event.amount !== undefined &&
          (typeof event.amount !== "number" ||
            !Number.isInteger(event.amount) ||
            event.amount < 0 ||
            event.amount > 0x7fffffff)
        )
          return false;
        if (
          event.handle !== undefined &&
          (typeof event.handle !== "string" || !/^p[1-9][0-9]*$/.test(event.handle))
        )
          return false;
        if (
          event.entity !== undefined &&
          (typeof event.entity !== "string" || !/^e[1-9][0-9]*$/.test(event.entity))
        )
          return false;
        return (
          event.projectile === undefined ||
          ["instant", "bullet", "missile"].some((kind) => kind === event.projectile)
        );
      })
    )
      return false;
  }
  if (snapshot.banks !== undefined) {
    if (
      snapshot.mode !== "controlled" ||
      !Array.isArray(snapshot.banks) ||
      snapshot.banks.length > 8 ||
      ![...snapshot.banks].every(isBankSnapshot)
    )
      return false;
    let previous = -1;
    for (const bank of snapshot.banks) {
      if (Number(bank.force) <= previous) return false;
      previous = Number(bank.force);
    }
  }
  if (snapshot.constructionRequests !== undefined) {
    if (
      snapshot.mode !== "controlled" ||
      !Array.isArray(snapshot.constructionRequests) ||
      ![...snapshot.constructionRequests].every((request: unknown) => {
        if (
          !isRecord(request) ||
          Object.getPrototypeOf(request) !== Object.prototype ||
          typeof request.handle !== "string" ||
          typeof request.definition !== "string" ||
          !/^([a-z0-9-]+\.)?structure:[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(request.definition) ||
          !Number.isInteger(request.force) ||
          Number(request.force) < 0 ||
          Number(request.force) > 0x7fffffff ||
          !point(request) ||
          !Number.isInteger(request.facing) ||
          Number(request.facing) < 0 ||
          Number(request.facing) > 0xffff
        )
          return false;
        if (request.status === "clearing")
          return Reflect.ownKeys(request).length === 7 && request.reason === undefined;
        return (
          request.status === "refused" &&
          Reflect.ownKeys(request).length === 8 &&
          CONSTRUCTION_REFUSALS.some((reason) => reason === request.reason)
        );
      })
    )
      return false;
  }
  if (snapshot.power !== undefined) {
    if (
      snapshot.mode !== "controlled" ||
      !Array.isArray(snapshot.power) ||
      snapshot.power.length > 8 ||
      ![...snapshot.power].every(isPowerSnapshot)
    )
      return false;
    let previous = -1;
    for (const power of snapshot.power) {
      if (Number(power.force) <= previous) return false;
      previous = Number(power.force);
    }
  }
  const entityHandles = new Set();
  return [...snapshot.entities].every((entity: unknown) => {
    if (
      !isRecord(entity) ||
      typeof entity.handle !== "string" ||
      typeof entity.definition !== "string"
    )
      return false;
    if (entityHandles.has(entity.handle)) return false;
    entityHandles.add(entity.handle);
    if (
      Reflect.ownKeys(entity).some(
        (key) =>
          typeof key !== "string" ||
          ![
            "handle",
            "definition",
            "force",
            "x",
            "y",
            "facing",
            "health",
            "maxHealth",
            "order",
            "power",
            "extraction",
            "harvesting",
            "constructionSite",
            "construction",
            "constructionOrder",
            "production",
            "attackTarget",
            "repair",
            "repairOrder",
          ].includes(key),
      ) ||
      !bounded(entity.force) ||
      !point(entity) ||
      !bounded(entity.facing, 0xffff) ||
      !bounded(entity.health, 0xffffffff) ||
      !bounded(entity.maxHealth)
    )
      return false;
    if (entity.constructionSite !== undefined && entity.constructionSite !== true) return false;
    if (
      entity.harvesting !== undefined &&
      (snapshot.mode !== "controlled" || !isHarvestSnapshot(entity.harvesting))
    )
      return false;
    if (entity.production !== undefined) {
      const production = entity.production;
      if (
        snapshot.mode !== "controlled" ||
        !isRecord(production) ||
        Object.getPrototypeOf(production) !== Object.prototype ||
        Reflect.ownKeys(production).length !== 3 ||
        !Number.isInteger(production.slots) ||
        Number(production.slots) < 1 ||
        Number(production.slots) > 5 ||
        !Array.isArray(production.queue) ||
        production.queue.length > 1005 ||
        ![...production.queue].every((item: unknown) => {
          if (
            !isRecord(item) ||
            Object.getPrototypeOf(item) !== Object.prototype ||
            Reflect.ownKeys(item).length !== 8 ||
            typeof item.handle !== "string" ||
            typeof item.definition !== "string" ||
            !/^([a-z0-9-]+\.)?unit:[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(item.definition) ||
            typeof item.gift !== "boolean" ||
            typeof item.state !== "string" ||
            !PRODUCTION_STATUSES.some((state) => state === item.state) ||
            ![item.completedTicks, item.remainder, item.totalTicks].every(Number.isInteger) ||
            Number(item.totalTicks) < 0 ||
            Number(item.totalTicks) > 0x7fffffff ||
            Number(item.completedTicks) < 0 ||
            Number(item.completedTicks) > Number(item.totalTicks) ||
            Number(item.remainder) < 0 ||
            Number(item.remainder) > 999 ||
            (item.completedTicks === item.totalTicks && item.remainder !== 0)
          )
            return false;
          return (
            item.slot === null ||
            (Number.isInteger(item.slot) &&
              Number(item.slot) >= 1 &&
              Number(item.slot) <= Number(production.slots))
          );
        }) ||
        (production.rally !== null &&
          (!isRecord(production.rally) ||
            Reflect.ownKeys(production.rally).length !== 2 ||
            !point(production.rally)))
      )
        return false;
      const queue = production.queue as { handle: string; gift: boolean }[];
      if (
        queue.filter((item) => !item.gift).length > 5 ||
        new Set(queue.map((item) => item.handle)).size !== queue.length
      )
        return false;
    }
    if (
      entity.attackTarget !== undefined &&
      (typeof entity.attackTarget !== "string" || !/^e[1-9][0-9]*$/.test(entity.attackTarget))
    )
      return false;
    if (entity.construction !== undefined) {
      const progress = entity.construction;
      if (
        snapshot.mode !== "controlled" ||
        entity.constructionSite !== true ||
        !isRecord(progress) ||
        Object.getPrototypeOf(progress) !== Object.prototype ||
        Reflect.ownKeys(progress).length !== 4 ||
        ![
          progress.completedTicks,
          progress.totalTicks,
          progress.quarter,
          progress.buildersWorking,
        ].every(Number.isInteger) ||
        Number(progress.completedTicks) < 0 ||
        Number(progress.totalTicks) < 0 ||
        Number(progress.totalTicks) > 0x7fffffff ||
        Number(progress.completedTicks) > Number(progress.totalTicks) ||
        Number(progress.quarter) < 0 ||
        Number(progress.quarter) > 3 ||
        (progress.completedTicks === progress.totalTicks && progress.quarter !== 0) ||
        Number(progress.buildersWorking) < 0 ||
        Number(progress.buildersWorking) > 0xffffffff
      )
        return false;
    }
    if (entity.constructionOrder !== undefined) {
      const order = entity.constructionOrder;
      if (
        snapshot.mode !== "controlled" ||
        !isRecord(order) ||
        Object.getPrototypeOf(order) !== Object.prototype ||
        Reflect.ownKeys(order).length !== 2 ||
        typeof order.site !== "string" ||
        typeof order.state !== "string" ||
        !["approaching", "working", "blocked"].includes(order.state)
      )
        return false;
    }
    if (entity.repairOrder !== undefined) {
      const order = entity.repairOrder;
      if (
        snapshot.mode !== "controlled" ||
        !isRecord(order) ||
        Object.getPrototypeOf(order) !== Object.prototype ||
        Reflect.ownKeys(order).length !== 3 ||
        typeof order.target !== "string" ||
        typeof order.state !== "string" ||
        !["approaching", "working", "blocked", "funds", "grant"].includes(order.state) ||
        !Number.isInteger(order.workRemainder) ||
        Number(order.workRemainder) < 0 ||
        Number(order.workRemainder) >= 20_000
      )
        return false;
    }
    if (entity.repair !== undefined) {
      const repair = entity.repair;
      if (
        snapshot.mode !== "controlled" ||
        !isRecord(repair) ||
        Object.getPrototypeOf(repair) !== Object.prototype ||
        Reflect.ownKeys(repair).length !== 2 ||
        !Number.isInteger(repair.creditCarry) ||
        Number(repair.creditCarry) < 0 ||
        Number(repair.creditCarry) >= Number(entity.maxHealth) ||
        !Number.isInteger(repair.repairersWorking) ||
        Number(repair.repairersWorking) < 0 ||
        Number(repair.repairersWorking) > 0xffffffff
      )
        return false;
    }
    if (
      entity.extraction !== undefined &&
      (snapshot.mode !== "controlled" || !isExtractionSnapshot(entity.extraction))
    )
      return false;
    if (
      ![entity.force, entity.x, entity.y, entity.facing, entity.health, entity.maxHealth].every(
        Number.isInteger,
      )
    )
      return false;
    if (
      entity.power !== undefined &&
      (snapshot.mode !== "controlled" || !isEntityPower(entity.power))
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
