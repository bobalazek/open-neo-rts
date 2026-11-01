import type { GroundDomain } from "@open-neo-rts/content";
import {
  addInt,
  addString,
  addU32,
  atan2,
  divFloor,
  type Hasher,
  isqrt,
} from "@open-neo-rts/deterministic";
import type { Kernel } from "../../kernel";
import { type Definition, OwnerForce, Template, Transform } from "../entities";
import { MoveIntent } from ".";
import { compileNavigation, type NavigationGrid, type NavigationObject } from "./navigation";
import { PathScheduler } from "./path-scheduler";
import { labelReachability, nearestReachable } from "./reachability";
import { clearSegment, type Point, smoothPath } from "./segment";

interface Route {
  definition: number;
  goal: number;
  requested: Point;
  target: Point;
  path: Point[];
  searching: boolean;
}
interface Profile {
  grid: NavigationGrid;
  labels: Uint32Array;
  uniform: boolean;
}

/** Fixed work quota, shared by every domain/radius and Force in this match. */
export const MOVEMENT_NODE_BUDGET = 4096;

/** Map movement state. Compiled grids/labels are derived caches; routes and scheduler are hashed. */
export class TerrainMovement {
  private readonly profiles = new Map<number, Profile>();
  private readonly routes = new Map<number, Route>();
  private readonly scheduler: PathScheduler;
  private readonly definitionHash: string;

  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
    forces: readonly number[],
  ) {
    this.scheduler = new PathScheduler(
      (request) => this.profile(this.definitionOf(request.entity)).grid,
      forces,
      MOVEMENT_NODE_BUDGET,
    );
    this.definitionHash = JSON.stringify(
      definitions.map((d) => [
        d.id,
        d.health,
        d.speed,
        d.turnRate,
        d.domain ?? null,
        d.radiusSubcells ?? null,
        d.footprint ?? null,
        d.cells ?? null,
        d.blocks ?? null,
        d.domains ? [...d.domains].sort() : null,
      ]),
    );
  }

  private definitionOf(id: number): number {
    return this.kernel.world.get(id, Template, "definition");
  }
  private position(id: number): Point {
    return {
      x: this.kernel.world.get(id, Transform, "x"),
      y: this.kernel.world.get(id, Transform, "y"),
    };
  }
  private cell(point: Point): number {
    const width = this.kernel.map?.terrain.width as number;
    return Math.floor(point.y / 1024) * width + Math.floor(point.x / 1024);
  }
  private centre(cell: number): Point {
    const width = this.kernel.map?.terrain.width as number;
    return { x: (cell % width) * 1024 + 512, y: Math.floor(cell / width) * 1024 + 512 };
  }
  private profile(definition: number): Profile {
    let profile = this.profiles.get(definition);
    if (profile) return profile;
    const found = this.definitions[definition] as Definition;
    const map = this.kernel.map;
    if (
      !map ||
      found.domain === undefined ||
      found.domain === "air" ||
      found.radiusSubcells === undefined
    )
      throw new Error("Ground movement requires original domain and radius");
    const objects: NavigationObject[] = [];
    for (const id of this.kernel.world.query(Template, Transform)) {
      const object = this.definitions[this.definitionOf(id)] as Definition;
      if (object.id.split(":")[0]?.split(".").at(-1) === "unit") continue;
      const p = this.position(id);
      objects.push({
        definition: object.id,
        position: [p.x, p.y],
        rotation: (((this.kernel.world.get(id, Transform, "facing") >>> 14) + 3) & 3) * 90,
        owner: "neutral",
      });
    }
    const grid = compileNavigation(
      map,
      this.definitions,
      { domain: found.domain as GroundDomain, radiusSubcells: found.radiusSubcells },
      objects,
    );
    const first = grid.cost.findIndex((cost) => cost !== 0);
    profile = {
      grid,
      labels: labelReachability(grid),
      uniform: grid.cost.every(
        (cost, index) =>
          cost === 0 ||
          (cost === grid.cost[first] && grid.speedPercent[index] === grid.speedPercent[first]),
      ),
    };
    this.profiles.set(definition, profile);
    return profile;
  }

  cancel(id: number): void {
    this.scheduler.cancel(id);
    this.routes.delete(id);
  }

  order(id: number, target: Point): void {
    const world = this.kernel.world;
    const definition = this.definitionOf(id);
    const found = this.definitions[definition] as Definition;
    const map = this.kernel.map;
    if (!map) throw new Error("Map movement requires a map");
    const radius = found.radiusSubcells as number;
    if (radius * 2 > map.terrain.width * 1024 || radius * 2 > map.terrain.height * 1024) return;
    const bounded = {
      x: Math.max(radius, Math.min(map.terrain.width * 1024 - Math.max(1, radius), target.x)),
      y: Math.max(radius, Math.min(map.terrain.height * 1024 - Math.max(1, radius), target.y)),
    };
    if (found.domain === "air") {
      world.add(id, MoveIntent, bounded);
      this.routes.set(id, {
        definition,
        goal: -1,
        requested: { ...target },
        target: bounded,
        path: [bounded],
        searching: false,
      });
      return;
    }
    const { grid, labels, uniform } = this.profile(definition);
    const start = this.cell(this.position(id));
    const goal = nearestReachable(grid, labels, start, {
      x: Math.floor(target.x / 1024),
      y: Math.floor(target.y / 1024),
    });
    if (goal === undefined || !clearSegment(grid, this.position(id), this.centre(start))) return;
    const destination =
      goal === this.cell(bounded) && clearSegment(grid, this.centre(goal), bounded)
        ? bounded
        : this.centre(goal);
    world.add(id, MoveIntent, destination);
    // String pulling would produce this same unobstructed segment; no search queue is needed.
    const direct = uniform && clearSegment(grid, this.position(id), destination);
    this.routes.set(id, {
      definition,
      goal,
      requested: { ...target },
      target: destination,
      path: direct ? [destination] : [],
      searching: !direct,
    });
    if (direct) return;
    this.scheduler.submit([
      {
        force: world.get(id, OwnerForce, "force"),
        entity: id,
        issueTick: this.kernel.tick,
        kind: "order",
        start,
        goal,
      },
    ]);
  }

  tick(): void {
    const world = this.kernel.world;
    for (const id of [...this.routes.keys()].sort((a, b) => a - b))
      if (!world.isAlive(id) || !world.has(id, MoveIntent)) this.cancel(id);
    for (const result of this.scheduler.tick().results) {
      const id = result.request.entity;
      const route = this.routes.get(id);
      if (!route) continue;
      const { grid, uniform } = this.profile(route.definition);
      const position = this.position(id);
      const points = result.path.map((cell) => this.centre(cell));
      if (result.status !== "searching") points.push(route.target);
      let first = 0;
      if (uniform) {
        for (let i = 0; i < points.length; i++)
          if (clearSegment(grid, position, points[i] as Point)) first = i;
        route.path = smoothPath(grid, position, points.slice(first));
      } else if (!route.path.length || result.status !== "searching") {
        const current = result.path.lastIndexOf(this.cell(position));
        first = Math.max(0, current);
        if (first + 1 < points.length && clearSegment(grid, position, points[first + 1] as Point))
          first++;
        route.path = points.slice(first);
      }
      route.searching = result.status === "searching";
    }
    for (const [id, route] of [...this.routes].sort(([a], [b]) => a - b)) {
      const position = this.position(id);
      while (route.path[0]?.x === position.x && route.path[0]?.y === position.y) route.path.shift();
      const waypoint = route.path[0];
      if (!waypoint) {
        if (!route.searching) {
          world.remove(id, MoveIntent);
          this.cancel(id);
        }
        continue;
      }
      const definition = this.definitions[route.definition] as Definition;
      const dx = waypoint.x - position.x;
      const dy = waypoint.y - position.y;
      const facing = world.get(id, Transform, "facing");
      const turn = ((atan2(dy, dx) - facing + 0x8000) & 0xffff) - 0x8000;
      const step = Math.max(0 - definition.turnRate, Math.min(definition.turnRate, turn));
      world.set(id, Transform, "facing", (facing + step) & 0xffff);
      if (step !== turn) continue;
      const percent =
        definition.domain === "air"
          ? 100
          : (this.profile(route.definition).grid.speedPercent[this.cell(position)] as number);
      const speed = Math.floor((definition.speed * percent) / 100);
      const distance = isqrt(dx * dx + dy * dy);
      const next =
        distance <= speed
          ? waypoint
          : {
              x: position.x + divFloor(2 * dx * speed + distance, 2 * distance),
              y: position.y + divFloor(2 * dy * speed + distance, 2 * distance),
            };
      if (
        definition.domain !== "air" &&
        !clearSegment(this.profile(route.definition).grid, position, next)
      )
        continue;
      world.set(id, Transform, "x", next.x);
      world.set(id, Transform, "y", next.y);
      if (next.x === waypoint.x && next.y === waypoint.y) route.path.shift();
      if (!route.searching && route.path.length === 0) {
        world.remove(id, MoveIntent);
        this.cancel(id);
      }
    }
  }

  hashInto(h: Hasher): void {
    // Static definition input also determines every derived grid and movement outcome.
    addString(h, this.definitionHash);
    addU32(h, this.routes.size);
    for (const [id, route] of [...this.routes].sort(([a], [b]) => a - b)) {
      for (const n of [
        id,
        route.definition,
        route.goal,
        route.requested.x,
        route.requested.y,
        route.target.x,
        route.target.y,
        route.searching ? 1 : 0,
        route.path.length,
      ])
        addInt(h, n);
      for (const point of route.path) {
        addInt(h, point.x);
        addInt(h, point.y);
      }
    }
    this.scheduler.hashInto(h);
  }

  /** Explicit diagnostics/save preparation; ordinary checkpoint hashes do not allocate this. */
  snapshot() {
    return {
      routes: [...this.routes]
        .sort(([a], [b]) => a - b)
        .map(([entity, route]) => ({
          entity,
          ...route,
          requested: { ...route.requested },
          target: { ...route.target },
          path: route.path.map((point) => ({ ...point })),
        })),
      scheduler: this.scheduler.snapshot(),
    };
  }
}
