import { type NavGrid, type PathResult, PathSearch, type PathSearchState } from "./path-search";

export interface PathRequest {
  force: number;
  entity: number;
  issueTick: number;
  kind: "order" | "repath";
  start: number;
  goal: number;
}

interface PendingPath {
  request: PathRequest;
  search: PathSearch | null;
}

export interface PathSchedulerState {
  budget: number;
  /** Sorted Force IDs; cursor indexes the next Force to offer an expansion. */
  forces: readonly number[];
  cursor: number;
  queues: readonly (readonly { request: PathRequest; search: PathSearchState | null }[])[];
}

export interface ScheduledPathResult extends PathResult {
  request: PathRequest;
}

export interface PathTickResult {
  /** One partial/final result per request served, in canonical Force/queue order. */
  results: ScheduledPathResult[];
  expansions: number;
  queued: number;
  forces: { force: number; expansions: number; completed: number; queued: number }[];
}

const isId = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0x7fffffff;

function compare(a: PathRequest, b: PathRequest): number {
  return (
    (a.kind === "order" ? 0 : 1) - (b.kind === "order" ? 0 : 1) ||
    a.issueTick - b.issueTick ||
    a.entity - b.entity
  );
}

function copyRequest({ force, entity, issueTick, kind, start, goal }: PathRequest): PathRequest {
  return { force, entity, issueTick, kind, start, goal };
}

/** Standalone work scheduler. The caller keeps the grid immutable and submits before tick(). */
export class PathScheduler {
  private readonly forces: number[];
  private readonly queues: PendingPath[][];
  private cursor = 0;

  constructor(
    private readonly grid: NavGrid,
    forces: readonly number[],
    private readonly budget: number,
  ) {
    PathSearch.checkGrid(grid);
    if (!Number.isSafeInteger(budget) || budget < 0)
      throw new RangeError("Path budget must be a nonnegative safe integer");
    if ([...forces].some((force) => !isId(force)) || new Set(forces).size !== forces.length)
      throw new RangeError("Path Forces must be unique nonnegative int32 IDs");
    this.forces = [...forces].sort((a, b) => a - b);
    this.queues = this.forces.map(() => []);
  }

  /**
   * Atomically enqueue a tick's requests; one request per entity. Replaces any prior entity work.
   * Callers resolve conflicting commands for an entity in canonical command order before submission.
   */
  submit(requests: readonly PathRequest[]): void {
    const entities = new Set<number>();
    for (const request of requests) {
      if (
        !isId(request.force) ||
        !this.forces.includes(request.force) ||
        !isId(request.entity) ||
        !isId(request.issueTick) ||
        (request.kind !== "order" && request.kind !== "repath") ||
        entities.has(request.entity)
      )
        throw new RangeError("Invalid or duplicate path request");
      PathSearch.check(this.grid, request.start, request.goal);
      entities.add(request.entity);
    }
    for (const request of requests) {
      this.cancel(request.entity);
      const queue = this.queues[this.forces.indexOf(request.force)] as PendingPath[];
      queue.push({ request: copyRequest(request), search: null });
    }
    for (const queue of this.queues) queue.sort((a, b) => compare(a.request, b.request));
  }

  /** Stop/death/removal drops both queued and partially expanded work, even after a Force transfer. */
  cancel(entity: number): void {
    if (!isId(entity)) throw new RangeError("Path entity must be a nonnegative int32 ID");
    for (const queue of this.queues) {
      const index = queue.findIndex((pending) => pending.request.entity === entity);
      if (index !== -1) queue.splice(index, 1);
    }
  }

  tick(): PathTickResult {
    const forces = this.forces.map((force) => ({ force, expansions: 0, completed: 0, queued: 0 }));
    const served = new Map<PendingPath, number>();
    let expansions = 0;
    let idle = 0;
    while (expansions < this.budget && idle < this.forces.length) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.forces.length;
      const queue = this.queues[index] as PendingPath[];
      const pending = queue[0];
      if (!pending) {
        idle++;
        continue;
      }
      idle = 0;
      const { start, goal } = pending.request;
      pending.search ??= new PathSearch(this.grid, start, goal);
      const work = pending.search.advance(1);
      served.set(pending, (served.get(pending) ?? 0) + work);
      expansions += work;
      const counter = forces[index] as PathTickResult["forces"][number];
      counter.expansions += work;
      if (pending.search.finished) {
        queue.shift();
        counter.completed++;
      }
    }
    const results = [...served]
      .sort(([a], [b]) => a.request.force - b.request.force || compare(a.request, b.request))
      .map(([pending, work]) => ({
        ...(pending.search as PathSearch).result(),
        expansions: work,
        request: copyRequest(pending.request),
      }));
    let queued = 0;
    for (const [index, queue] of this.queues.entries()) {
      (forces[index] as PathTickResult["forces"][number]).queued = queue.length;
      queued += queue.length;
    }
    return { results, expansions, queued, forces };
  }

  /** Canonical JSON-compatible state; contains every active search, not just its current path. */
  snapshot(): PathSchedulerState {
    return {
      budget: this.budget,
      forces: [...this.forces],
      cursor: this.cursor,
      queues: this.queues.map((queue) =>
        queue.map(({ request, search }) => ({
          request: copyRequest(request),
          search: search?.snapshot() ?? null,
        })),
      ),
    };
  }

  static restore(grid: NavGrid, state: PathSchedulerState): PathScheduler {
    const scheduler = new PathScheduler(grid, state.forces, state.budget);
    if (
      !Number.isInteger(state.cursor) ||
      state.cursor < 0 ||
      state.cursor >= Math.max(1, state.forces.length) ||
      state.queues.length !== state.forces.length ||
      state.forces.some((force, index) => force !== scheduler.forces[index])
    )
      throw new RangeError("Invalid path scheduler state");
    // submit validates references/endpoints and duplicate entities before installing any search state.
    scheduler.submit(state.queues.flatMap((queue) => queue.map(({ request }) => request)));
    for (const [index, queue] of state.queues.entries()) {
      const target = scheduler.queues[index] as PendingPath[];
      for (const [position, pending] of queue.entries()) {
        if (
          pending.request.force !== state.forces[index] ||
          (position > 0 &&
            compare((queue[position - 1] as typeof pending).request, pending.request) >= 0)
        )
          throw new RangeError("Invalid path queue order");
        if (pending.search) {
          if (
            pending.search.start !== pending.request.start ||
            pending.search.goal !== pending.request.goal
          )
            throw new RangeError("Path search does not match request");
          const search = PathSearch.restore(grid, pending.search);
          if (search.finished) throw new RangeError("Completed searches cannot remain queued");
          (target[position] as PendingPath).search = search;
        }
      }
    }
    scheduler.cursor = state.cursor;
    return scheduler;
  }
}
