import { addInt, addU32, type Hasher } from "@open-neo-rts/deterministic";
import {
  type AnchorGrid,
  type AnchorInput,
  type AnchorResult,
  AnchorSearch,
  type AnchorState,
} from "./anchor-search";
import { type NavGrid, type PathResult, PathSearch, type PathSearchState } from "./path-search";

type RequestGrid = NavGrid | ((request: PathRequest) => NavGrid);
interface Envelope {
  force: number;
  entity: number;
  issueTick: number;
  kind: "order" | "repath";
}
export interface PathRequest extends Envelope {
  start: number;
  goal: number;
}
export interface AnchorRequest extends Envelope {
  input: AnchorInput;
}
interface PendingPath {
  request: PathRequest;
  search: PathSearch | null;
}
interface PendingAnchor {
  request: AnchorRequest;
  search: AnchorSearch | null;
}
export interface PathSchedulerState {
  budget: number;
  forces: readonly number[];
  cursor: number;
  queues: readonly (readonly { request: PathRequest; search: PathSearchState | null }[])[];
  anchors: readonly (readonly { request: AnchorRequest; search: AnchorState | null }[])[];
  anchorCursors: readonly number[];
  turns: readonly number[];
}
export interface ScheduledPathResult extends PathResult {
  request: PathRequest;
}
export interface PathTickResult {
  results: ScheduledPathResult[];
  prepared: { request: AnchorRequest; result: AnchorResult | null }[];
  /** Shared credits: one A* expansion or one anchor cell/transition/barrier step. */
  work: number;
  expansions: number;
  queued: number;
  forces: { force: number; expansions: number; completed: number; queued: number; work: number }[];
}
const isId = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0x7fffffff;
function compare(a: Envelope, b: Envelope): number {
  return (
    (a.kind === "order" ? 0 : 1) - (b.kind === "order" ? 0 : 1) ||
    a.issueTick - b.issueTick ||
    a.entity - b.entity
  );
}
function copyRequest({ force, entity, issueTick, kind, start, goal }: PathRequest): PathRequest {
  return { force, entity, issueTick, kind, start, goal };
}
function copyAnchor({ force, entity, issueTick, kind, input }: AnchorRequest): AnchorRequest {
  return {
    force,
    entity,
    issueTick,
    kind,
    input: {
      position: { ...input.position },
      requested: { ...input.requested },
      bounded: { ...input.bounded },
      uniform: input.uniform,
    },
  };
}

/** One shared counted planner. A long anchor job cannot block this Force's ready path work. */
export class PathScheduler {
  private readonly forces: number[];
  private readonly queues: PendingPath[][];
  private readonly anchors: PendingAnchor[][];
  private readonly anchorCursors: number[];
  private readonly anchorOrders: number[];
  private readonly turns: number[];
  /** Derived membership only; canonical state remains the queues and their cursors. */
  private readonly queuedEntities = new Set<number>();
  private cursor = 0;
  constructor(
    private readonly grid: RequestGrid,
    forces: readonly number[],
    private readonly budget: number,
    private readonly anchorGrid?: (request: AnchorRequest) => AnchorGrid,
  ) {
    if (typeof grid !== "function") PathSearch.checkGrid(grid);
    if (!Number.isSafeInteger(budget) || budget < 0)
      throw new RangeError("Path budget must be a nonnegative safe integer");
    if (forces.some((force) => !isId(force)) || new Set(forces).size !== forces.length)
      throw new RangeError("Path Forces must be unique nonnegative int32 IDs");
    this.forces = [...forces].sort((a, b) => a - b);
    this.queues = this.forces.map(() => []);
    this.anchors = this.forces.map(() => []);
    this.anchorCursors = this.forces.map(() => 0);
    this.anchorOrders = this.forces.map(() => 0);
    this.turns = this.forces.map(() => 0);
  }
  private validate(request: Envelope, seen: Set<number>): void {
    if (
      !isId(request.force) ||
      !this.forces.includes(request.force) ||
      !isId(request.entity) ||
      !isId(request.issueTick) ||
      (request.kind !== "order" && request.kind !== "repath") ||
      seen.has(request.entity)
    )
      throw new RangeError("Invalid or duplicate path request");
    seen.add(request.entity);
  }
  submit(requests: readonly PathRequest[]): void {
    const seen = new Set<number>();
    for (const request of requests) {
      this.validate(request, seen);
      PathSearch.check(this.gridFor(request), request.start, request.goal);
    }
    for (const request of requests) {
      this.cancel(request.entity);
      this.queues[this.forces.indexOf(request.force)]?.push({
        request: copyRequest(request),
        search: null,
      });
      this.queuedEntities.add(request.entity);
    }
    for (const queue of this.queues) queue.sort((a, b) => compare(a.request, b.request));
  }
  submitAnchors(requests: readonly AnchorRequest[]): void {
    if (!this.anchorGrid) throw new Error("Anchor preparation requires a navigation profile");
    const seen = new Set<number>();
    for (const request of requests) {
      this.validate(request, seen);
      const i = request.input;
      if (
        typeof i.uniform !== "boolean" ||
        [i.position, i.requested, i.bounded].some(
          (p) => ![p.x, p.y].every((n) => Number.isInteger(n) && n >= 0 && n <= 524288),
        )
      )
        throw new RangeError("Invalid anchor input");
    }
    const touched = new Set<number>();
    for (const request of requests) {
      this.cancel(request.entity);
      const index = this.forces.indexOf(request.force),
        queue = this.anchors[index] as PendingAnchor[];
      const pending: PendingAnchor = {
        request: copyAnchor(request),
        search: null,
      };
      if (requests.length === 1) {
        const last = queue.at(-1);
        if (!last || compare(last.request, request) <= 0) queue.push(pending);
        else {
          let low = 0,
            high = queue.length;
          while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (compare((queue[middle] as PendingAnchor).request, request) <= 0) low = middle + 1;
            else high = middle;
          }
          queue.splice(low, 0, pending);
        }
      } else queue.push(pending);
      this.queuedEntities.add(request.entity);
      if (request.kind === "order")
        this.anchorOrders[index] = (this.anchorOrders[index] as number) + 1;
      touched.add(index);
    }
    // Batch cancellation observes the old append-before-sort intermediate indices.
    if (requests.length > 1)
      for (const index of touched)
        this.anchors[index]?.sort((a, b) => compare(a.request, b.request));
  }
  private removeAnchor(force: number, index: number): void {
    const queue = this.anchors[force] as PendingAnchor[];
    const pending = queue[index];
    if (pending) this.queuedEntities.delete(pending.request.entity);
    if (queue[index]?.request.kind === "order")
      this.anchorOrders[force] = (this.anchorOrders[force] as number) - 1;
    queue.splice(index, 1);
    if (index < (this.anchorCursors[force] as number))
      this.anchorCursors[force] = (this.anchorCursors[force] as number) - 1;
    if ((this.anchorCursors[force] as number) >= queue.length) this.anchorCursors[force] = 0;
  }
  cancel(entity: number): void {
    if (!isId(entity)) throw new RangeError("Path entity must be a nonnegative int32 ID");
    if (!this.queuedEntities.has(entity)) return;
    for (const [force, queue] of this.queues.entries()) {
      const i = queue.findIndex((p) => p.request.entity === entity);
      if (i !== -1) queue.splice(i, 1);
      const j = (this.anchors[force] as PendingAnchor[]).findIndex(
        (p) => p.request.entity === entity,
      );
      if (j !== -1) this.removeAnchor(force, j);
    }
    this.queuedEntities.delete(entity);
  }
  tick(): PathTickResult {
    const forces = this.forces.map((force) => ({
      force,
      expansions: 0,
      completed: 0,
      queued: 0,
      work: 0,
    }));
    const served = new Map<PendingPath, number>();
    const prepared: PathTickResult["prepared"] = [];
    let expansions = 0,
      work = 0,
      idle = 0;
    while (work < this.budget && idle < this.forces.length) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.forces.length;
      const paths = this.queues[index] as PendingPath[],
        anchors = this.anchors[index] as PendingAnchor[];
      if (!paths.length && !anchors.length) {
        idle++;
        continue;
      }
      idle = 0;
      const order = paths[0]?.request.kind === "order" || (this.anchorOrders[index] as number) > 0;
      const path = paths[0] && (!order || paths[0].request.kind === "order") ? paths[0] : undefined;
      const end = order ? (this.anchorOrders[index] as number) : anchors.length;
      const hasAnchor = end > 0;
      const useAnchor = hasAnchor && (!path || this.turns[index] === 0);
      const counter = forces[index] as PathTickResult["forces"][number];
      if (path && hasAnchor) this.turns[index] = useAnchor ? 1 : 0;
      work++;
      counter.work++;
      if (useAnchor) {
        let cursor = this.anchorCursors[index] as number;
        if (cursor >= end) cursor = 0;
        const pending = anchors[cursor] as PendingAnchor;
        this.anchorCursors[index] = (cursor + 1) % end;
        pending.search ??= new AnchorSearch(
          (this.anchorGrid as NonNullable<typeof this.anchorGrid>)(pending.request),
          pending.request.input,
        );
        pending.search.advance();
        if (pending.search.finished) {
          const result = pending.search.result() ?? null;
          prepared.push({ request: copyAnchor(pending.request), result });
          this.removeAnchor(index, cursor);
          if (result && !result.direct) {
            const request: PathRequest = {
              force: pending.request.force,
              entity: pending.request.entity,
              issueTick: pending.request.issueTick,
              kind: pending.request.kind,
              start: result.start,
              goal: result.goal,
            };
            paths.push({ request, search: null });
            this.queuedEntities.add(request.entity);
            paths.sort((a, b) => compare(a.request, b.request));
          } else counter.completed++;
        }
      } else if (path) {
        path.search ??= new PathSearch(
          this.gridFor(path.request),
          path.request.start,
          path.request.goal,
        );
        const used = path.search.advance(1);
        served.set(path, (served.get(path) ?? 0) + used);
        expansions += used;
        counter.expansions += used;
        if (path.search.finished) {
          paths.shift();
          this.queuedEntities.delete(path.request.entity);
          counter.completed++;
        }
      }
    }
    const results = [...served]
      .sort(([a], [b]) => a.request.force - b.request.force || compare(a.request, b.request))
      .map(([pending, used]) => ({
        ...(pending.search as PathSearch).result(),
        expansions: used,
        request: copyRequest(pending.request),
      }));
    let queued = 0;
    for (const [i, queue] of this.queues.entries()) {
      const n = queue.length + (this.anchors[i] as PendingAnchor[]).length;
      (forces[i] as PathTickResult["forces"][number]).queued = n;
      queued += n;
    }
    return { results, prepared, work, expansions, queued, forces };
  }
  snapshot(): PathSchedulerState {
    return {
      budget: this.budget,
      forces: [...this.forces],
      cursor: this.cursor,
      queues: this.queues.map((q) =>
        q.map((p) => ({ request: copyRequest(p.request), search: p.search?.snapshot() ?? null })),
      ),
      anchors: this.anchors.map((q) =>
        q.map((p) => ({ request: copyAnchor(p.request), search: p.search?.snapshot() ?? null })),
      ),
      anchorCursors: [...this.anchorCursors],
      turns: [...this.turns],
    };
  }
  hashInto(h: Hasher): void {
    addInt(h, this.budget);
    addU32(h, this.cursor);
    addU32(h, this.forces.length);
    for (const [index, force] of this.forces.entries()) {
      addU32(h, force);
      addU32(h, this.anchorCursors[index] as number);
      addU32(h, this.turns[index] as number);
      const queue = this.queues[index] as PendingPath[];
      addU32(h, queue.length);
      for (const { request, search } of queue) {
        for (const n of [request.entity, request.issueTick, request.start, request.goal])
          addU32(h, n);
        addU32(h, request.kind === "order" ? 0 : 1);
        addU32(h, search ? 1 : 0);
        search?.hashInto(h);
      }
      const anchors = this.anchors[index] as PendingAnchor[];
      addU32(h, anchors.length);
      for (const { request, search } of anchors) {
        for (const n of [
          request.entity,
          request.issueTick,
          request.kind === "order" ? 0 : 1,
          request.input.position.x,
          request.input.position.y,
          request.input.requested.x,
          request.input.requested.y,
          request.input.bounded.x,
          request.input.bounded.y,
          request.input.uniform ? 1 : 0,
        ])
          addInt(h, n);
        addU32(h, search ? 1 : 0);
        search?.hashInto(h);
      }
    }
  }
  private gridFor(request: PathRequest): NavGrid {
    return typeof this.grid === "function" ? this.grid(request) : this.grid;
  }
  static restore(
    grid: RequestGrid,
    state: PathSchedulerState,
    anchorGrid?: (request: AnchorRequest) => AnchorGrid,
  ): PathScheduler {
    const scheduler = new PathScheduler(grid, state.forces, state.budget, anchorGrid),
      count = state.forces.length;
    if (
      !Number.isInteger(state.cursor) ||
      state.cursor < 0 ||
      state.cursor >= Math.max(1, count) ||
      state.queues.length !== count ||
      state.anchors.length !== count ||
      state.anchorCursors.length !== count ||
      state.turns.length !== count ||
      state.forces.some((f, i) => f !== scheduler.forces[i])
    )
      throw new RangeError("Invalid path scheduler state");
    const seen = new Set<number>();
    for (const [index, queue] of state.queues.entries()) {
      for (const [position, pending] of queue.entries()) {
        scheduler.validate(pending.request, seen);
        if (
          pending.request.force !== state.forces[index] ||
          (position > 0 &&
            compare((queue[position - 1] as typeof pending).request, pending.request) >= 0)
        )
          throw new RangeError("Invalid path queue order");
        scheduler.submit([pending.request]);
        if (pending.search) {
          if (
            pending.search.start !== pending.request.start ||
            pending.search.goal !== pending.request.goal
          )
            throw new RangeError("Path search does not match request");
          const search = PathSearch.restore(scheduler.gridFor(pending.request), pending.search);
          if (search.finished) throw new RangeError("Completed searches cannot remain queued");
          (scheduler.queues[index]?.at(-1) as PendingPath).search = search;
        }
      }
    }
    for (const [index, queue] of state.anchors.entries()) {
      for (const [position, pending] of queue.entries()) {
        scheduler.validate(pending.request, seen);
        if (
          pending.request.force !== state.forces[index] ||
          (position > 0 &&
            compare((queue[position - 1] as typeof pending).request, pending.request) >= 0)
        )
          throw new RangeError("Invalid anchor queue order");
        scheduler.submitAnchors([pending.request]);
        if (pending.search) {
          const search = AnchorSearch.restore(
            (anchorGrid as NonNullable<typeof anchorGrid>)(pending.request),
            pending.request.input,
            pending.search,
          );
          if (search.finished) throw new RangeError("Completed anchors cannot remain queued");
          (scheduler.anchors[index]?.at(-1) as PendingAnchor).search = search;
        }
      }
      const cursor = state.anchorCursors[index] as number,
        turn = state.turns[index] as number;
      if (
        !Number.isInteger(cursor) ||
        cursor < 0 ||
        cursor >= Math.max(1, queue.length) ||
        (turn !== 0 && turn !== 1)
      )
        throw new RangeError("Invalid preparation cursor");
      scheduler.anchorCursors[index] = cursor;
      scheduler.turns[index] = turn;
    }
    scheduler.cursor = state.cursor;
    return scheduler;
  }
}
