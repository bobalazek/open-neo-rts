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

function clearsBarrier(
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
}

/** One barrier (including broad-phase rejection) per credit; no hidden full-list sweep. */
export class SegmentSweep {
  private cursor = 0;
  private status: SweepState["status"];
  private readonly a: Point;
  private readonly b: Point;
  constructor(
    private readonly grid: NavigationGrid,
    a: Point,
    b: Point,
  ) {
    this.a = { ...a };
    this.b = { ...b };
    this.status = !inBounds(grid, a, b) ? "blocked" : grid.barriers.length ? "searching" : "clear";
  }
  advance(): void {
    if (this.status !== "searching") return;
    const barrier = this.grid.barriers[this.cursor++] as readonly [number, number, number, number];
    if (!clearsBarrier(this.grid.radiusSubcells, this.a, this.b, barrier)) this.status = "blocked";
    else if (this.cursor === this.grid.barriers.length) this.status = "clear";
  }
  get result() {
    return this.status;
  }
  snapshot(): SweepState {
    return { a: { ...this.a }, b: { ...this.b }, cursor: this.cursor, status: this.status };
  }
  static restore(grid: NavigationGrid, state: SweepState): SegmentSweep {
    if (
      ![state.a.x, state.a.y, state.b.x, state.b.y, state.cursor].every(Number.isSafeInteger) ||
      state.cursor < 0 ||
      state.cursor > grid.barriers.length
    )
      throw new RangeError("Invalid segment sweep state");
    const sweep = new SegmentSweep(grid, { ...state.a }, { ...state.b });
    for (let i = 0; i < state.cursor; i++) {
      if (sweep.result !== "searching") throw new RangeError("Invalid sweep continuation");
      sweep.advance();
    }
    if (sweep.result !== state.status) throw new RangeError("Invalid sweep status");
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
