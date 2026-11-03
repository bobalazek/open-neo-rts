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
import { MoveIntent, MovementFailure } from ".";
import { type AnchorGrid, indexAnchors } from "./anchor-search";
import { compileNavigation, type NavigationObject } from "./navigation";
import { PathScheduler } from "./path-scheduler";
import { labelReachability } from "./reachability";
import { clearSegment, type Point, smoothPath } from "./segment";

interface Route {
  definition: number;
  goal: number;
  requested: Point;
  target: Point;
  path: Point[];
  searching: boolean;
  preparing: boolean;
  stuck: number;
  repaths: number;
}
interface Profile extends AnchorGrid {
  uniform: boolean;
  objects: readonly NavigationObject[];
}

/** Fixed work quota, shared by every domain/radius and Force in this match. */
export const MOVEMENT_NODE_BUDGET = 4096;
/** First-pass engineering limits: two automatic retries after two seconds without motion or turning. */
export const MOVEMENT_STUCK_TICKS = 40;
export const MOVEMENT_MAX_REPATHS = 2;

/** Map movement state. Compiled grids/labels are derived caches; routes and scheduler are hashed. */
export class TerrainMovement {
  private readonly profiles = new Map<number, Profile>();
  private readonly routes = new Map<number, Route>();
  private readonly scheduler: PathScheduler;
  private readonly definitionHash: string;
  private occupancy = "";

  constructor(
    private readonly kernel: Kernel,
    private readonly definitions: readonly Definition[],
    forces: readonly number[],
  ) {
    this.scheduler = new PathScheduler(
      (request) => this.profile(this.definitionOf(request.entity)).grid,
      forces,
      MOVEMENT_NODE_BUDGET,
      (request) => this.profile(this.definitionOf(request.entity)),
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
        ...(d.nodeKinds ? [[...d.nodeKinds].sort()] : []),
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
    const objects: NavigationObject[] = this.kernel.remains?.rubbleObjects() ?? [];
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
      objects,
      ...indexAnchors(grid, labelReachability(grid)),
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

  private fail(id: number, reason: number): void {
    this.cancel(id);
    const world = this.kernel.world;
    if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
    if (world.has(id, MovementFailure)) world.remove(id, MovementFailure);
    world.add(id, MovementFailure, { reason });
  }

  /** Commands have finished before movement; cached searches always see one immutable occupancy. */
  refreshOccupancy(): void {
    const world = this.kernel.world;
    const occupied = world
      .query(Template, Transform)
      .filter((id) => {
        const definition = this.definitions[this.definitionOf(id)] as Definition;
        const kind = definition.id.split(":")[0]?.split(".").at(-1);
        return kind === "structure" || (kind === "prop" && definition.blocks !== "nothing");
      })
      .map((id) => [
        id,
        this.definitionOf(id),
        world.get(id, Transform, "x"),
        world.get(id, Transform, "y"),
        world.get(id, Transform, "facing"),
      ]);
    const signature = JSON.stringify([occupied, this.kernel.remains?.rubbleObjects() ?? []]);
    if (signature === this.occupancy) return;
    this.occupancy = signature;
    this.profiles.clear();
    for (const [id, route] of [...this.routes].sort(([a], [b]) => a - b)) {
      if (!world.isAlive(id) || !world.has(id, MoveIntent)) {
        this.cancel(id);
        continue;
      }
      if ((this.definitions[route.definition] as Definition).domain === "air") continue;
      const grid = this.profile(route.definition).grid;
      let previous = this.position(id);
      const valid = route.path.every((point) => {
        const clear = clearSegment(grid, previous, point);
        previous = point;
        return clear;
      });
      if (route.searching || !valid) this.repath(id, route, false);
    }
  }

  private repath(id: number, route: Route, stuck: boolean): void {
    if (stuck && route.repaths >= MOVEMENT_MAX_REPATHS) {
      this.fail(id, 2);
      return;
    }
    const attempts = route.repaths + (stuck ? 1 : 0);
    const attackMove = this.kernel.world.get(id, MoveIntent, "attackMove");
    this.cancel(id);
    this.kernel.world.remove(id, MoveIntent);
    this.plan(id, route.requested, "repath", attempts);
    if (this.kernel.world.has(id, MoveIntent))
      this.kernel.world.set(id, MoveIntent, "attackMove", attackMove);
  }

  order(id: number, target: Point): void {
    if (!this.kernel.world.isAlive(id) || !this.kernel.world.has(id, Transform)) return;
    if (this.kernel.unitModes?.active(id)) return;
    this.plan(id, target, "order", 0);
  }

  /** Logistics selects reachable stock/docks instead of accepting movement's nearest-goal fallback. */
  canReach(id: number, point: Point): boolean {
    if (!this.canStand(id, point)) return false;
    const { labels } = this.profile(this.definitionOf(id));
    const start = labels[this.cell(this.position(id))];
    return !!start && start === labels[this.cell(point)];
  }

  /** Certified exterior work positions use the same radius/domain/occupancy grid as normal orders. */
  canStand(id: number, point: Point): boolean {
    return this.canStandDefinition(this.definitionOf(id), point);
  }

  /** Production checks an unspawned unit against the same original navigation profile. */
  canStandDefinition(definition: number, point: Point): boolean {
    const map = this.kernel.map;
    if (
      !map ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= map.terrain.width * 1024 ||
      point.y >= map.terrain.height * 1024 ||
      point.x % 1024 !== 512 ||
      point.y % 1024 !== 512
    )
      return false;
    if (this.definitions[definition]?.domain === "air") return false;
    return !!this.profile(definition).grid.cost[this.cell(point)];
  }

  /** Boarding and unloading cannot cross a cliff or static blocker between nearby legal cells. */
  canTraverseDefinition(definition: number, from: Point, to: Point): boolean {
    return (
      this.canStandDefinition(definition, {
        x: Math.floor(to.x / 1024) * 1024 + 512,
        y: Math.floor(to.y / 1024) * 1024 + 512,
      }) && clearSegment(this.profile(definition).grid, from, to)
    );
  }

  private plan(id: number, target: Point, kind: "order" | "repath", repaths: number): void {
    const world = this.kernel.world;
    const definition = this.definitionOf(id);
    const found = this.definitions[definition] as Definition;
    const map = this.kernel.map;
    if (!map) throw new Error("Map movement requires a map");
    const radius = found.radiusSubcells as number;
    if (radius * 2 > map.terrain.width * 1024 || radius * 2 > map.terrain.height * 1024) {
      this.fail(id, 1);
      return;
    }
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
        preparing: false,
        stuck: 0,
        repaths,
      });
      return;
    }
    const { grid, labels, uniform } = this.profile(definition);
    const position = this.position(id);
    const start = this.cell(position),
      goal = this.cell(bounded);
    // Compiled passable centres certify clearance without scanning the barrier list.
    const certifiedStart =
      grid.cost[start] && position.x % 1024 === 512 && position.y % 1024 === 512;
    const certifiedGoal =
      grid.cost[goal] &&
      bounded.x % 1024 === 512 &&
      bounded.y % 1024 === 512 &&
      this.cell(target) === goal;
    if (certifiedStart && bounded.x === position.x && bounded.y === position.y) return;
    const preparing = !(certifiedStart && certifiedGoal && labels[start] === labels[goal]);
    world.add(id, MoveIntent, bounded);
    const direct = !preparing && uniform && grid.barriers.length === 0;
    this.routes.set(id, {
      definition,
      goal: preparing ? -1 : goal,
      requested: { ...target },
      target: bounded,
      path: direct ? [bounded] : [],
      searching: !direct,
      preparing,
      stuck: 0,
      repaths,
    });
    if (direct) return;
    if (preparing) {
      this.scheduler.submitAnchors([
        {
          force: world.get(id, OwnerForce, "force"),
          entity: id,
          issueTick: this.kernel.tick,
          kind,
          input: { position, requested: { ...target }, bounded, uniform },
        },
      ]);
      return;
    }
    this.scheduler.submit([
      {
        force: world.get(id, OwnerForce, "force"),
        entity: id,
        issueTick: this.kernel.tick,
        kind,
        start,
        goal,
      },
    ]);
  }

  tick(): void {
    const world = this.kernel.world;
    if (this.kernel.unitModes)
      for (const id of world.query(MoveIntent)) {
        if (!this.kernel.unitModes.active(id)) continue;
        this.cancel(id);
        world.remove(id, MoveIntent);
      }
    for (const id of [...this.routes.keys()].sort((a, b) => a - b))
      if (!world.isAlive(id) || !world.has(id, MoveIntent)) this.cancel(id);
    this.refreshOccupancy();
    const planned = this.scheduler.tick();
    for (const prepared of planned.prepared) {
      const id = prepared.request.entity,
        route = this.routes.get(id);
      if (!route) continue;
      if (!prepared.result) {
        this.fail(id, 1);
        continue;
      }
      const result = prepared.result;
      route.goal = result.goal;
      route.target = result.destination;
      route.preparing = false;
      world.set(id, MoveIntent, "x", result.destination.x);
      world.set(id, MoveIntent, "y", result.destination.y);
      if (result.direct) {
        route.path = [result.destination];
        route.searching = false;
      }
    }
    for (const result of planned.results) {
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
      if (this.kernel.disabled?.(id)) continue;
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
      if (step !== turn) {
        if (step !== 0) route.stuck = 0;
        else this.stalled(id, route);
        continue;
      }
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
      ) {
        this.stalled(id, route);
        continue;
      }
      world.set(id, Transform, "x", next.x);
      world.set(id, Transform, "y", next.y);
      if (position.x === next.x && position.y === next.y && (dx !== 0 || dy !== 0))
        this.stalled(id, route);
      else route.stuck = 0;
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
        route.preparing ? 1 : 0,
        route.stuck,
        route.repaths,
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

  private stalled(id: number, route: Route): void {
    if (++route.stuck >= MOVEMENT_STUCK_TICKS) this.repath(id, route, true);
  }

  /** Explicit diagnostics/save preparation; ordinary checkpoint hashes do not allocate this. */
  debugPaths() {
    return [...this.routes]
      .sort(([a], [b]) => a - b)
      .map(([entity, route]) => ({
        entity,
        target: { ...route.target },
        searching: route.searching,
        path: route.path.map((point) => ({ ...point })),
      }));
  }

  /** Explicit diagnostics/save preparation; ordinary checkpoint hashes do not allocate this. */
  snapshot() {
    return {
      occupancy: this.occupancy,
      profiles: [...this.profiles]
        .sort(([a], [b]) => a - b)
        .map(([definition, profile]) => ({
          definition,
          objects: profile.objects.map((object) => ({
            ...object,
            position: [...object.position] as [number, number],
          })),
        })),
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
