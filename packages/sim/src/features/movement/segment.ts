import type { NavigationGrid } from "./navigation";

export interface Point {
  x: number;
  y: number;
}

/** Exact squared point/segment clearance; BigInt keeps cross products exact on 512-cell maps. */
function near(point: Point, a: Point, b: Point, radius: number): boolean {
  const dx = BigInt(b.x - a.x);
  const dy = BigInt(b.y - a.y);
  const px = BigInt(point.x - a.x);
  const py = BigInt(point.y - a.y);
  const length = dx * dx + dy * dy;
  const dot = px * dx + py * dy;
  const r = BigInt(radius) * BigInt(radius);
  if (dot <= 0n || length === 0n) return px * px + py * py < r;
  if (dot >= length) {
    const x = BigInt(point.x - b.x);
    const y = BigInt(point.y - b.y);
    return x * x + y * y < r;
  }
  const cross = px * dy - py * dx;
  return cross * cross < r * length;
}

function side(a: Point, b: Point, p: Point): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
    Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
    Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
    Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
    side(a, b, c) * side(a, b, d) <= 0 &&
    side(c, d, a) * side(c, d, b) <= 0
  );
}

/** Swept circular clearance against the compiler's exact obstacles, cliffs and map boundary. */
function inBounds(grid: NavigationGrid, a: Point, b: Point): boolean {
  const r = grid.radiusSubcells;
  return ![a, b].some(
    (p) => p.x < r || p.y < r || p.x > grid.width * 1024 - r || p.y > grid.height * 1024 - r,
  );
}

export function clearsBarrier(
  r: number,
  a: Point,
  b: Point,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): boolean {
  if (
    Math.max(a.x, b.x) + r < x0 ||
    Math.min(a.x, b.x) - r > x1 ||
    Math.max(a.y, b.y) + r < y0 ||
    Math.min(a.y, b.y) - r > y1
  )
    return true;
  if ([a, b].some((p) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1)) return false;
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  for (let i = 0; i < 4; i++) {
    const c = corners[i] as Point;
    const d = corners[(i + 1) % 4] as Point;
    if (
      intersects(a, b, c, d) ||
      near(a, c, d, r) ||
      near(b, c, d, r) ||
      near(c, a, b, r) ||
      near(d, a, b, r)
    )
      return false;
  }
  return true;
}

export function clearSegment(grid: NavigationGrid, a: Point, b: Point): boolean {
  return (
    inBounds(grid, a, b) &&
    grid.barriers.every((barrier) => clearsBarrier(grid.radiusSubcells, a, b, barrier))
  );
}

export interface SweepState {
  a: Point;
  b: Point;
  cursor: number;
  status: "searching" | "clear" | "blocked";
  stack: number[];
  blocker: number;
}

export interface BarrierNode {
  bounds: readonly [number, number, number, number];
  left: number;
  right: number;
  barrier: number;
}

/** Immutable broad phase, built once with the navigation profile, never per request. */
export function indexBarriers(barriers: NavigationGrid["barriers"]): BarrierNode[] {
  const nodes: BarrierNode[] = [];
  const build = (ids: number[]): number => {
    let x0 = Number.MAX_SAFE_INTEGER,
      y0 = Number.MAX_SAFE_INTEGER,
      x1 = 0,
      y1 = 0;
    let cx0 = Number.MAX_SAFE_INTEGER,
      cy0 = Number.MAX_SAFE_INTEGER,
      cx1 = 0,
      cy1 = 0;
    for (const id of ids) {
      const b = barriers[id] as readonly [number, number, number, number];
      x0 = Math.min(x0, b[0]);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]);
      y1 = Math.max(y1, b[3]);
      cx0 = Math.min(cx0, b[0] + b[2]);
      cy0 = Math.min(cy0, b[1] + b[3]);
      cx1 = Math.max(cx1, b[0] + b[2]);
      cy1 = Math.max(cy1, b[1] + b[3]);
    }
    const id = nodes.length,
      node: BarrierNode = {
        bounds: [x0, y0, x1, y1],
        left: -1,
        right: -1,
        barrier: ids.length === 1 ? (ids[0] as number) : -1,
      };
    nodes.push(node);
    if (ids.length > 1) {
      const horizontal = cx1 - cx0 >= cy1 - cy0,
        middle = Math.floor(((horizontal ? cx0 : cy0) + (horizontal ? cx1 : cy1)) / 2);
      let left: number[] = [],
        right: number[] = [];
      for (const i of ids) {
        const b = barriers[i] as readonly [number, number, number, number];
        ((horizontal ? b[0] + b[2] : b[1] + b[3]) <= middle ? left : right).push(i);
      }
      if (!left.length || !right.length) {
        left = ids.slice(0, Math.floor(ids.length / 2));
        right = ids.slice(left.length);
      }
      node.left = build(left);
      node.right = build(right);
    }
    return id;
  };
  if (barriers.length) build(barriers.map((_, i) => i));
  return nodes;
}

/** One enclosing AABB/leaf predicate per credit; a clear enclosure certifies its whole subtree. */
export class SegmentSweep {
  private cursor = 0;
  private status: SweepState["status"];
  private readonly a: Point;
  private readonly b: Point;
  private readonly stack: number[];
  private blockedBy = -1;
  constructor(
    private readonly grid: NavigationGrid,
    a: Point,
    b: Point,
  ) {
    this.a = { ...a };
    this.b = { ...b };
    this.status = !inBounds(grid, a, b) ? "blocked" : grid.barriers.length ? "searching" : "clear";
    this.stack = this.status === "searching" ? [0] : [];
  }
  advance(): void {
    if (this.status !== "searching") return;
    const node = this.grid.barrierTree[this.stack.pop() as number] as BarrierNode;
    this.cursor++;
    if (!clearsBarrier(this.grid.radiusSubcells, this.a, this.b, node.bounds)) {
      if (node.barrier >= 0) {
        this.status = "blocked";
        this.blockedBy = node.barrier;
      } else this.stack.push(node.right, node.left);
    }
    if (this.status === "searching" && !this.stack.length) this.status = "clear";
  }
  get result() {
    return this.status;
  }
  get blocker(): number {
    return this.blockedBy;
  }
  snapshot(): SweepState {
    return {
      a: { ...this.a },
      b: { ...this.b },
      cursor: this.cursor,
      status: this.status,
      stack: [...this.stack],
      blocker: this.blockedBy,
    };
  }
  static restore(grid: NavigationGrid, state: SweepState): SegmentSweep {
    if (
      ![state.a.x, state.a.y, state.b.x, state.b.y, state.cursor].every(Number.isSafeInteger) ||
      state.cursor < 0 ||
      state.cursor > grid.barrierTree.length ||
      !Array.isArray(state.stack) ||
      state.stack.some((n) => !Number.isInteger(n) || n < 0 || n >= grid.barrierTree.length)
    )
      throw new RangeError("Invalid segment sweep state");
    const sweep = new SegmentSweep(grid, { ...state.a }, { ...state.b });
    for (let i = 0; i < state.cursor; i++) {
      if (sweep.result !== "searching") throw new RangeError("Invalid sweep continuation");
      sweep.advance();
    }
    if (
      sweep.result !== state.status ||
      sweep.blocker !== state.blocker ||
      sweep.stack.length !== state.stack.length ||
      sweep.stack.some((n, i) => n !== state.stack[i])
    )
      throw new RangeError("Invalid sweep status");
    return sweep;
  }
}

/** Greedy string pulling; every retained segment has full circular clearance. */
export function smoothPath(grid: NavigationGrid, start: Point, path: readonly Point[]): Point[] {
  const result: Point[] = [];
  let anchor = start;
  let index = 0;
  while (index < path.length) {
    let next = index;
    for (let candidate = index; candidate < path.length; candidate++) {
      if (!clearSegment(grid, anchor, path[candidate] as Point)) break;
      next = candidate;
    }
    anchor = path[next] as Point;
    result.push(anchor);
    index = next + 1;
  }
  return result;
}
