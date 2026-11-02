import { addInt, type Hasher } from "@open-neo-rts/deterministic";
import type { AnchorIndex } from "./anchor-index";
import type { NavigationGrid } from "./navigation";
import { clearsBarrier, type Point, SegmentSweep, type SweepState } from "./segment";

interface Entry {
  node: number;
  lo: number;
  hi: number;
}
export interface VisibleState {
  work: number;
  stack: Entry[];
  active: Entry | null;
  occluders: number[];
  cursor: number;
  corner: number;
  best: number;
  distance: number;
  sweep: SweepState | null;
}

/** Exact nearest swept-visible centre. Uncertified boxes always subdivide, with no range cap. */
export class VisibleAnchor {
  private readonly state: Omit<VisibleState, "sweep">;
  private sweep: SegmentSweep | undefined;
  constructor(
    private readonly grid: NavigationGrid,
    private readonly index: AnchorIndex,
    private readonly position: Point,
    root: number | undefined,
  ) {
    this.state = {
      work: 0,
      stack: root === undefined ? [] : [{ node: root, lo: -1, hi: -1 }],
      active: null,
      occluders: [],
      cursor: 0,
      corner: 0,
      best: -1,
      distance: Number.MAX_SAFE_INTEGER,
    };
  }
  private box(e: Entry) {
    const n = this.index.nodes[e.node] as AnchorIndex["nodes"][number];
    const x0 = e.lo < 0 ? n.x0 : e.lo,
      x1 = e.hi < 0 ? n.x1 : e.hi;
    return {
      x0: x0 * 1024 + 512,
      x1: x1 * 1024 + 512,
      y0: n.y0 * 1024 + 512,
      y1: n.y1 * 1024 + 512,
      first: n.first + (e.lo < 0 ? 0 : e.lo - n.x0),
    };
  }
  private lower(e: Entry): number {
    const b = this.box(e),
      dx = Math.max(0, b.x0 - this.position.x, this.position.x - b.x1),
      dy = Math.max(0, b.y0 - this.position.y, this.position.y - b.y1);
    return dx * dx + dy * dy;
  }
  private expand(e: Entry): void {
    const n = this.index.nodes[e.node] as AnchorIndex["nodes"][number],
      b = this.box(e);
    let a: Entry, c: Entry;
    if (n.left >= 0) {
      a = { node: n.left, lo: -1, hi: -1 };
      c = { node: n.right, lo: -1, hi: -1 };
    } else if (b.x0 !== b.x1) {
      const lo = e.lo < 0 ? n.x0 : e.lo,
        hi = e.hi < 0 ? n.x1 : e.hi,
        middle = Math.floor((lo + hi) / 2);
      a = { node: e.node, lo, hi: middle };
      c = { node: e.node, lo: middle + 1, hi };
    } else {
      this.sweep = new SegmentSweep(this.grid, this.position, { x: b.x0, y: b.y0 });
      return;
    }
    const order = this.lower(a) - this.lower(c) || this.box(a).first - this.box(c).first;
    this.state.stack.push(order <= 0 ? c : a, order <= 0 ? a : c);
    this.state.active = null;
  }
  advance(): void {
    if (this.finished) return;
    const s = this.state;
    s.work++;
    if (this.sweep) {
      this.sweep.advance();
      if (this.sweep.result === "searching") return;
      if (this.sweep.result === "clear") {
        const e = s.active as Entry,
          b = this.box(e),
          distance = this.lower(e);
        if (distance < s.distance || (distance === s.distance && b.first < s.best)) {
          s.best = b.first;
          s.distance = distance;
        }
      } else if (this.sweep.blocker >= 0) {
        // A bounded memo of certificates only; eviction never excludes a candidate.
        s.occluders = s.occluders.filter((id) => id !== this.sweep?.blocker);
        s.occluders.unshift(this.sweep.blocker);
        s.occluders.length = Math.min(2, s.occluders.length);
      }
      this.sweep = undefined;
      s.active = null;
      return;
    }
    if (!s.active) {
      const entry = s.stack.pop() as Entry,
        lower = this.lower(entry),
        first = this.box(entry).first;
      if (lower > s.distance || (lower === s.distance && s.best >= 0 && first >= s.best)) return;
      s.active = entry;
      s.cursor = 0;
      s.corner = 0;
      return;
    }
    if (s.cursor < s.occluders.length) {
      const b = this.box(s.active),
        corner = { x: s.corner % 2 ? b.x1 : b.x0, y: s.corner < 2 ? b.y0 : b.y1 };
      const barrier = this.grid.barriers[
        s.occluders[s.cursor] as number
      ] as NavigationGrid["barriers"][number];
      if (clearsBarrier(this.grid.radiusSubcells, this.position, corner, barrier)) {
        s.cursor++;
        s.corner = 0;
      } else if (++s.corner === 4) {
        // The shadow of one convex radius-expanded rectangle is convex. All four
        // corners inside that SAME shadow certify the whole centre box hidden.
        s.active = null;
      }
      return;
    }
    this.expand(s.active);
  }
  get finished(): boolean {
    return !this.state.stack.length && !this.state.active && !this.sweep;
  }
  get result(): number {
    return this.state.best;
  }
  snapshot(): VisibleState {
    return {
      ...this.state,
      stack: this.state.stack.map((e) => ({ ...e })),
      active: this.state.active ? { ...this.state.active } : null,
      occluders: [...this.state.occluders],
      sweep: this.sweep?.snapshot() ?? null,
    };
  }
  hashInto(h: Hasher): void {
    const s = this.state;
    for (const n of [s.work, s.cursor, s.corner, s.best, s.distance, s.stack.length]) addInt(h, n);
    for (const e of s.stack) for (const n of [e.node, e.lo, e.hi]) addInt(h, n);
    addInt(h, s.active ? 1 : 0);
    if (s.active) for (const n of [s.active.node, s.active.lo, s.active.hi]) addInt(h, n);
    addInt(h, s.occluders.length);
    for (const n of s.occluders) addInt(h, n);
    const sweep = this.sweep?.snapshot();
    addInt(h, sweep ? 1 : 0);
    if (sweep) {
      for (const n of [
        sweep.a.x,
        sweep.a.y,
        sweep.b.x,
        sweep.b.y,
        sweep.cursor,
        sweep.blocker,
        sweep.status === "searching" ? 0 : sweep.status === "clear" ? 1 : 2,
        sweep.stack.length,
      ])
        addInt(h, n);
      for (const n of sweep.stack) addInt(h, n);
    }
  }
  static restore(
    grid: NavigationGrid,
    index: AnchorIndex,
    position: Point,
    root: number | undefined,
    state: VisibleState,
  ): VisibleAnchor {
    if (!Number.isSafeInteger(state.work) || state.work < 0)
      throw new RangeError("Invalid visible-anchor cursor");
    const search = new VisibleAnchor(grid, index, position, root);
    for (let n = 0; n < state.work; n++) {
      if (search.finished) throw new RangeError("Invalid visible-anchor continuation");
      search.advance();
    }
    // Explicit restore is outside tick work. Replay verifies every cached certificate,
    // virtual span, partial barrier traversal and cursor against immutable derived data.
    const h = (s: VisibleState) =>
      JSON.stringify([
        s.work,
        s.stack.map((e) => [e.node, e.lo, e.hi]),
        s.active ? [s.active.node, s.active.lo, s.active.hi] : null,
        s.occluders,
        s.cursor,
        s.corner,
        s.best,
        s.distance,
        s.sweep
          ? [
              s.sweep.a.x,
              s.sweep.a.y,
              s.sweep.b.x,
              s.sweep.b.y,
              s.sweep.cursor,
              s.sweep.status,
              s.sweep.stack,
              s.sweep.blocker,
            ]
          : null,
      ]);
    if (h(search.snapshot()) !== h(state)) throw new RangeError("Invalid visible-anchor state");
    return search;
  }
}
