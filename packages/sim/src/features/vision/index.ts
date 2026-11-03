// Authoritative cell vision and explored history. Seat projection/ghosts are a separate feature.
import { arr, int, validate } from "@open-neo-rts/content";
import { addString, addU32, type Hasher } from "@open-neo-rts/deterministic";
import { type Kernel, register } from "../../kernel";
import type { MatchSetup } from "../../match";
import { strictObject } from "../../snapshots/schema";
import { ConstructionSite } from "../construction";
import { type Definition, Health, OwnerForce, Template, Transform } from "../entities";
import { AreaReveal, MAX_AREA_REVEALS } from "./reveal";

export * from "./memory";
export * from "./reveal";

export const FOG_MODES = ["standard", "explored", "off"] as const;
export type FogMode = (typeof FOG_MODES)[number];
export const CELL_VISION = { shroud: 0, explored: 1, visible: 2 } as const;
export type CellVision = (typeof CELL_VISION)[keyof typeof CELL_VISION];

/** A copied row-major grid, safe to hand to a later seat projection. */
export interface VisionGrid {
  readonly group: number;
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
}

/** Integer-only canonical memory; source stamps and visible counts are derived from World. */
export interface VisionState {
  readonly format: 1;
  readonly width: number;
  readonly height: number;
  readonly mode: number;
  readonly groups: readonly { readonly id: number; readonly explored: readonly number[] }[];
}

interface Group {
  id: number;
  explored: Uint8Array;
  counts: Uint32Array;
}
interface Point {
  x: number;
  y: number;
}
interface Source {
  group: number;
  key: string;
  cells: number[];
}
type VisionSetup = Pick<MatchSetup, "definitions" | "forces" | "normal">;
const cell = (position: number) => Math.floor(position / 1024);
const kind = (definition: Definition) => definition.id.split(":")[0]?.split(".").at(-1);

/**
 * Completed living owned units/structures reveal. Units use their exact center and current terrain
 * cell; structures reveal from every rotated footprint cell center. Unfinished sites reveal nothing.
 * Props are opaque to all heights. A source inside an opaque cell sees only that cell.
 */
export class TerrainVision {
  readonly width: number;
  readonly height: number;
  readonly mode: FogMode;
  private readonly forceGroups = new Map<number, number>();
  private readonly groups = new Map<number, Group>();
  private readonly stamps = new Map<number, Source>();
  private readonly staticOpaque: Uint8Array;
  private opaque: Uint8Array;
  private blockerKey = "";
  private readonly identity: string;
  private readonly level: readonly number[];
  private readonly areaReveals: boolean;

  constructor(
    private readonly kernel: Kernel,
    private readonly setup: VisionSetup,
  ) {
    const map = kernel.map;
    if (!map) throw new Error("Vision requires a map");
    this.width = map.terrain.width;
    this.height = map.terrain.height;
    this.level = map.terrain.level;
    this.mode = setup.normal?.settings.fog ?? "standard";
    this.areaReveals = setup.definitions.some((definition) =>
      definition.weapons?.some((weapon) =>
        weapon.warheads.some((warhead) => warhead.type === "reveal"),
      ),
    );
    if (this.areaReveals) register(kernel, { components: [AreaReveal] });
    const forces = [...setup.forces].sort((a, b) => a.index - b.index);
    const teams = setup.normal?.forces ?? [];
    for (const force of forces) {
      const team = teams.find((entry) => entry.index === force.index)?.team;
      const group =
        team === undefined
          ? force.index
          : Math.min(...teams.filter((entry) => entry.team === team).map((entry) => entry.index));
      this.forceGroups.set(force.index, group);
      if (!this.groups.has(group))
        this.groups.set(group, {
          id: group,
          explored: new Uint8Array(this.width * this.height).fill(this.mode === "standard" ? 0 : 1),
          counts: new Uint32Array(this.width * this.height),
        });
    }
    this.identity = JSON.stringify({
      definitions: setup.definitions.map((definition) => [
        definition.id,
        definition.visionSubcells ?? null,
        definition.health,
        definition.footprint ?? null,
        definition.blocks ?? null,
      ]),
      forces: [...this.forceGroups],
    });
    this.staticOpaque = new Uint8Array(this.width * this.height);
    for (const object of map.objects) {
      const definition = setup.definitions.find((entry) => entry.id === object.definition);
      if (definition?.blocks === "movement-and-vision")
        for (const index of this.footprint(
          definition,
          object.position[0],
          object.position[1],
          Math.floor(object.rotation / 90),
        ))
          this.staticOpaque[index] = 1;
    }
    this.opaque = this.staticOpaque.slice();
  }

  groupForForce(force: number): number | undefined {
    return this.forceGroups.get(force);
  }

  /** A sensor circle starts at the next published tick and lasts exactly duration snapshots. */
  revealArea(force: number, x: number, y: number, radius: number, duration: number): boolean {
    if (
      !this.areaReveals ||
      this.forceGroups.get(force) === undefined ||
      ![x, y, radius, duration].every(Number.isInteger) ||
      radius <= 0 ||
      radius > 0x7fffffff ||
      duration <= 0 ||
      duration > 0x7fffffff ||
      !this.inBounds(cell(x), cell(y))
    )
      return false;
    // Larger radii cannot see beyond this map; keep squared distances exactly representable.
    radius = Math.min(radius, (this.width + this.height) * 1024);
    const from = Math.min(0xffffffff, this.kernel.tick + 1);
    const until = Math.min(0xffffffff, from + duration);
    if (until <= from) return false;
    const { world } = this.kernel;
    const fields = world.query(AreaReveal);
    for (const id of fields)
      if (
        world.get(id, AreaReveal, "force") === force &&
        world.get(id, AreaReveal, "x") === x &&
        world.get(id, AreaReveal, "y") === y &&
        world.get(id, AreaReveal, "radius") === radius
      ) {
        if (world.get(id, AreaReveal, "until") <= this.kernel.tick)
          world.set(id, AreaReveal, "from", from);
        world.set(id, AreaReveal, "until", Math.max(until, world.get(id, AreaReveal, "until")));
        return true;
      }
    if (fields.length >= MAX_AREA_REVEALS) return false;
    world.add(world.create(), AreaReveal, { force, x, y, radius, from, until });
    return true;
  }

  /** Unknown Forces and invalid coordinates always fail closed, including no-fog games. */
  cellState(force: number, x: number, y: number): CellVision {
    const id = this.forceGroups.get(force);
    const group = id === undefined ? undefined : this.groups.get(id);
    if (!group || !this.inBounds(x, y)) return CELL_VISION.shroud;
    const index = y * this.width + x;
    return this.mode === "off" || group.counts[index]
      ? CELL_VISION.visible
      : group.explored[index]
        ? CELL_VISION.explored
        : CELL_VISION.shroud;
  }

  canSeeCell(force: number, x: number, y: number): boolean {
    return this.cellState(force, x, y) === CELL_VISION.visible;
  }

  /** Geometry only: a structure/prop is visible when any occupied cell is visible; units use one cell. */
  canSeeEntity(force: number, entity: number): boolean {
    const { world } = this.kernel;
    if (!world.isAlive(entity) || !world.has(entity, Template) || !world.has(entity, Transform))
      return false;
    const definition = this.setup.definitions[world.get(entity, Template, "definition")];
    if (
      !definition ||
      (world.has(entity, Health) &&
        definition.health > 0 &&
        world.get(entity, Health, "current") === 0)
    )
      return false;
    return this.entityCells(entity, definition).some((index) =>
      this.canSeeCell(force, index % this.width, Math.floor(index / this.width)),
    );
  }

  copyGrid(force: number): VisionGrid | undefined {
    const id = this.forceGroups.get(force);
    if (id === undefined) return undefined;
    const cells = new Uint8Array(this.width * this.height);
    for (let index = 0; index < cells.length; index++)
      cells[index] = this.cellState(force, index % this.width, Math.floor(index / this.width));
    return { group: id, width: this.width, height: this.height, cells };
  }

  /** Refresh current geometry; end-of-tick destruction/victory pass the next published tick. */
  update(atTick = this.kernel.tick): void {
    const { world } = this.kernel;
    const fields = this.areaReveals ? world.query(AreaReveal) : [];
    for (const id of fields) if (world.get(id, AreaReveal, "until") <= atTick) world.destroy(id);
    if (this.mode === "off") return;
    const entities = world.query(Template, Transform);
    const blockers = entities.filter((id) => {
      const definition = this.setup.definitions[world.get(id, Template, "definition")];
      return (
        definition?.blocks === "movement-and-vision" &&
        (definition.health === 0 || (world.has(id, Health) && world.get(id, Health, "current") > 0))
      );
    });
    const key = blockers
      .map((id) =>
        [
          id,
          world.get(id, Template, "definition"),
          world.get(id, Transform, "x"),
          world.get(id, Transform, "y"),
          world.get(id, Transform, "facing"),
        ].join(":"),
      )
      .join(";");
    if (key !== this.blockerKey) {
      this.opaque = this.staticOpaque.slice();
      for (const id of blockers) {
        const definition = this.setup.definitions[world.get(id, Template, "definition")];
        if (definition)
          for (const index of this.entityCells(id, definition)) this.opaque[index] = 1;
      }
      for (const source of this.stamps.values()) this.unstamp(source);
      this.stamps.clear();
      this.blockerKey = key;
    }
    const present = new Set<number>();
    for (const id of entities) {
      const definition = this.setup.definitions[world.get(id, Template, "definition")];
      if (
        !definition?.visionSubcells ||
        !["unit", "structure"].includes(kind(definition) ?? "") ||
        !world.has(id, OwnerForce) ||
        !world.has(id, Health) ||
        world.get(id, Health, "current") === 0 ||
        world.has(id, ConstructionSite)
      )
        continue;
      const group = this.forceGroups.get(world.get(id, OwnerForce, "force"));
      if (group === undefined) continue;
      present.add(id);
      const x = world.get(id, Transform, "x"),
        y = world.get(id, Transform, "y");
      const sourceKey = [
        group,
        world.get(id, Template, "definition"),
        x,
        y,
        world.get(id, Transform, "facing"),
      ].join(":");
      if (this.stamps.get(id)?.key === sourceKey) continue;
      const origins =
        kind(definition) === "unit"
          ? [{ x, y }]
          : this.entityCells(id, definition).map((index) => ({
              x: (index % this.width) * 1024 + 512,
              y: Math.floor(index / this.width) * 1024 + 512,
            }));
      this.stamp(id, group, sourceKey, origins, definition.visionSubcells, true);
    }
    for (const id of fields) {
      if (!world.isAlive(id) || world.get(id, AreaReveal, "from") > atTick) continue;
      const group = this.forceGroups.get(world.get(id, AreaReveal, "force"));
      if (group === undefined) continue;
      present.add(id);
      const x = world.get(id, AreaReveal, "x"),
        y = world.get(id, AreaReveal, "y");
      const radius = world.get(id, AreaReveal, "radius");
      this.stamp(id, group, `reveal:${group}:${x}:${y}:${radius}`, [{ x, y }], radius, false);
    }
    for (const [id, source] of this.stamps)
      if (!present.has(id)) {
        this.unstamp(source);
        this.stamps.delete(id);
      }
  }

  serialize(): VisionState {
    return {
      format: 1,
      width: this.width,
      height: this.height,
      mode: FOG_MODES.indexOf(this.mode),
      groups: [...this.groups.values()].map((group) => ({
        id: group.id,
        explored: [...group.explored],
      })),
    };
  }

  /** Same-match state only: the outer save envelope checks setup identity before restoring World and vision. */
  load(value: unknown): void {
    const groups = [...this.groups.values()];
    const size = this.width * this.height;
    const mode = FOG_MODES.indexOf(this.mode);
    const schema = strictObject({
      format: int(1, 1),
      width: int(this.width, this.width),
      height: int(this.height, this.height),
      mode: int(mode, mode),
      groups: arr(
        strictObject({
          id: int(0, 0x7fffffff),
          explored: arr(int(this.mode === "standard" ? 0 : 1, 1), size, size),
        }),
        groups.length,
        groups.length,
      ),
    });
    if (validate(schema, value).length) throw new Error("Invalid vision state for this match");
    const state = value as VisionState;
    if (state.groups.some((group, i) => group.id !== groups[i]?.id))
      throw new Error("Invalid vision groups for this match");
    for (const [i, saved] of state.groups.entries()) {
      const group = groups[i] as Group;
      group.explored.set(saved.explored);
      group.counts.fill(0);
    }
    this.stamps.clear();
    this.blockerKey = "";
    this.opaque = this.staticOpaque.slice();
    this.update();
  }

  hashInto(hasher: Hasher): void {
    addString(hasher, "vision:1");
    addString(hasher, this.identity);
    for (const value of [this.width, this.height, FOG_MODES.indexOf(this.mode), this.groups.size])
      addU32(hasher, value);
    for (const group of this.groups.values()) {
      addU32(hasher, group.id);
      for (const value of group.explored) addU32(hasher, value);
    }
  }

  private unstamp(source: Source): void {
    const group = this.groups.get(source.group) as Group;
    for (const index of source.cells) group.counts[index] = (group.counts[index] ?? 0) - 1;
  }

  private stamp(
    id: number,
    group: number,
    key: string,
    origins: readonly Point[],
    radius: number,
    occluded: boolean,
  ): void {
    const previous = this.stamps.get(id);
    if (previous?.key === key) return;
    if (previous) this.unstamp(previous);
    const revealed = new Set<number>();
    for (const origin of origins) this.reveal(origin, radius, revealed, occluded);
    const cells = [...revealed].sort((a, b) => a - b);
    const state = this.groups.get(group) as Group;
    for (const index of cells) {
      state.counts[index] = (state.counts[index] ?? 0) + 1;
      state.explored[index] = 1;
    }
    this.stamps.set(id, { group, key, cells });
  }

  private inBounds(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    );
  }

  private footprint(definition: Definition, x: number, y: number, rotation: number): number[] {
    const [w = 1, h = 1] = definition.footprint ?? [];
    const width = rotation % 2 ? h : w,
      height = rotation % 2 ? w : h;
    const result: number[] = [];
    for (let cy = cell(y); cy < cell(y) + height; cy++)
      for (let cx = cell(x); cx < cell(x) + width; cx++)
        if (this.inBounds(cx, cy)) result.push(cy * this.width + cx);
    return result;
  }

  private entityCells(id: number, definition: Definition): number[] {
    const { world } = this.kernel;
    return this.footprint(
      definition,
      world.get(id, Transform, "x"),
      world.get(id, Transform, "y"),
      ((world.get(id, Transform, "facing") >>> 14) + 3) & 3,
    );
  }

  private reveal(origin: Point, radius: number, revealed: Set<number>, occluded = true): void {
    if (!this.inBounds(cell(origin.x), cell(origin.y))) return;
    const minX = Math.max(0, cell(origin.x - radius)),
      maxX = Math.min(this.width - 1, cell(origin.x + radius));
    const minY = Math.max(0, cell(origin.y - radius)),
      maxY = Math.min(this.height - 1, cell(origin.y + radius));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        if (revealed.has(y * this.width + x)) continue;
        const dx = x * 1024 + 512 - origin.x,
          dy = y * 1024 + 512 - origin.y;
        if (dx * dx + dy * dy <= radius * radius && (!occluded || this.clearRay(origin, x, y)))
          revealed.add(y * this.width + x);
      }
  }

  /** Integer supercover: corner ties inspect both touched side cells, preventing diagonal peeking.
   * At most width + height crossings. Higher cells block from below; opaque endpoints remain visible.
   */
  private clearRay(origin: Point, targetX: number, targetY: number): boolean {
    let x = cell(origin.x),
      y = cell(origin.y);
    if (x === targetX && y === targetY) return true;
    const level = this.level;
    const sourceLevel = level[y * this.width + x] ?? 0;
    const blocked = (cx: number, cy: number) =>
      (level[cy * this.width + cx] ?? 0) > sourceLevel || !!this.opaque[cy * this.width + cx];
    if (this.opaque[y * this.width + x]) return false;
    const dx = targetX * 1024 + 512 - origin.x,
      dy = targetY * 1024 + 512 - origin.y;
    const ax = Math.abs(dx),
      ay = Math.abs(dy),
      sx = Math.sign(dx),
      sy = Math.sign(dy);
    let nextX = sx > 0 ? (x + 1) * 1024 - origin.x : origin.x - x * 1024;
    let nextY = sy > 0 ? (y + 1) * 1024 - origin.y : origin.y - y * 1024;
    for (let crossings = 0; crossings < this.width + this.height; crossings++) {
      const comparison = ax === 0 ? 1 : ay === 0 ? -1 : nextX * ay - nextY * ax;
      if (comparison === 0) {
        if (blocked(x + sx, y) || blocked(x, y + sy)) return false;
        x += sx;
        y += sy;
        nextX += 1024;
        nextY += 1024;
      } else if (comparison < 0) {
        x += sx;
        nextX += 1024;
      } else {
        y += sy;
        nextY += 1024;
      }
      if ((level[y * this.width + x] ?? 0) > sourceLevel) return false;
      if (x === targetX && y === targetY) return true;
      if (this.opaque[y * this.width + x]) return false;
    }
    return false;
  }
}

export function initializeVision(kernel: Kernel, setup: VisionSetup): TerrainVision {
  if (kernel.vision) throw new Error("Vision is already initialized");
  register(kernel, { components: [ConstructionSite] });
  const vision = new TerrainVision(kernel, setup);
  kernel.vision = vision;
  // Register last: destruction/territory/fog share this phase, before victory and snapshots.
  register(kernel, { systems: { destruction: [() => vision.update(kernel.tick + 1)] } });
  vision.update();
  return vision;
}
