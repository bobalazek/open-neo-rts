import type { NavigationGrid } from "./navigation";

interface Node {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  first: number;
  left: number;
  right: number;
}

/** Immutable, derived spatial trees. Construction belongs beside cold profile compilation. */
export class AnchorIndex {
  readonly nodes: Node[] = [];
  readonly regions = new Map<number, number>();
  readonly components = new Map<number, number>();
  readonly regionComponents = new Map<number, number[]>();
  constructor(grid: NavigationGrid, labels: Uint32Array) {
    interface Run {
      x0: number;
      x1: number;
      y: number;
      first: number;
    }
    const regions = new Map<number, Run[]>(),
      components = new Map<number, Run[]>();
    const members = new Map<number, Set<number>>();
    const append = (groups: Map<number, Run[]>, key: number, cell: number) => {
      const x = cell % grid.width,
        y = Math.floor(cell / grid.width),
        list = groups.get(key),
        last = list?.at(-1);
      if (last && last.y === y && last.x1 + 1 === x) last.x1 = x;
      else if (list) list.push({ x0: x, x1: x, y, first: cell });
      else groups.set(key, [{ x0: x, x1: x, y, first: cell }]);
    };
    for (let cell = 0; cell < labels.length; cell++) {
      const component = labels[cell] as number,
        region = grid.physicalRegions[cell] as number;
      if (!component) continue;
      append(components, component, cell);
      append(regions, region, cell);
      const found = members.get(region);
      if (found) found.add(component);
      else members.set(region, new Set([component]));
    }
    const build = (runs: Run[]): number => {
      let x0 = grid.width,
        y0 = grid.height,
        x1 = 0,
        y1 = 0,
        first = Number.MAX_SAFE_INTEGER;
      let cx0 = 2 * grid.width,
        cx1 = 0,
        cy0 = grid.height,
        cy1 = 0;
      for (const run of runs) {
        x0 = Math.min(x0, run.x0);
        x1 = Math.max(x1, run.x1);
        y0 = Math.min(y0, run.y);
        y1 = Math.max(y1, run.y);
        first = Math.min(first, run.first);
        cx0 = Math.min(cx0, run.x0 + run.x1);
        cx1 = Math.max(cx1, run.x0 + run.x1);
        cy0 = Math.min(cy0, run.y);
        cy1 = Math.max(cy1, run.y);
      }
      const id = this.nodes.length,
        node = { x0, y0, x1, y1, first, left: -1, right: -1 };
      this.nodes.push(node);
      if (runs.length > 1) {
        const horizontal = cx1 - cx0 >= 2 * (cy1 - cy0),
          middle = Math.floor(((horizontal ? cx0 : cy0) + (horizontal ? cx1 : cy1)) / 2);
        const left: Run[] = [],
          right: Run[] = [];
        for (const run of runs)
          ((horizontal ? run.x0 + run.x1 : run.y) <= middle ? left : right).push(run);
        node.left = build(left);
        node.right = build(right);
      }
      return id;
    };
    for (const [key, runs] of components) this.components.set(key, build(runs));
    for (const [key, runs] of regions) {
      const ids = [...(members.get(key) as Set<number>)].sort((a, b) => a - b);
      this.regionComponents.set(key, ids);
      this.regions.set(
        key,
        ids.length === 1 ? (this.components.get(ids[0] as number) as number) : build(runs),
      );
    }
  }
}

export interface NearestState {
  stack: number[];
  best: number;
  distance: number;
  visits: number;
}

/** Exact octile nearest cell, ties by row-major index; one tree node per advance. */
export class NearestAnchor {
  private readonly state: NearestState;
  constructor(
    private readonly index: AnchorIndex,
    private readonly x: number,
    private readonly y: number,
    root: number | undefined,
  ) {
    this.state = {
      stack: root === undefined ? [] : [root],
      best: -1,
      distance: Number.MAX_SAFE_INTEGER,
      visits: 0,
    };
  }
  private lower(id: number): number {
    const n = this.index.nodes[id] as Node;
    const dx = Math.max(0, n.x0 - this.x, this.x - n.x1),
      dy = Math.max(0, n.y0 - this.y, this.y - n.y1);
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  }
  advance(): void {
    const id = this.state.stack.pop();
    if (id === undefined) return;
    this.state.visits++;
    const node = this.index.nodes[id] as Node,
      lower = this.lower(id),
      s = this.state;
    if (lower > s.distance || (lower === s.distance && node.first >= s.best && s.best >= 0)) return;
    if (node.left < 0) {
      s.best = node.first + Math.max(0, Math.min(node.x1 - node.x0, this.x - node.x0));
      s.distance = lower;
      return;
    }
    const a = node.left,
      b = node.right;
    const order =
      this.lower(a) - this.lower(b) ||
      (this.index.nodes[a] as Node).first - (this.index.nodes[b] as Node).first;
    s.stack.push(order <= 0 ? b : a, order <= 0 ? a : b);
  }
  get finished(): boolean {
    return this.state.stack.length === 0;
  }
  get result(): number {
    return this.state.best;
  }
  get distance(): number {
    return this.state.distance;
  }
  snapshot(): NearestState {
    return { ...this.state, stack: [...this.state.stack] };
  }
  static restore(
    index: AnchorIndex,
    x: number,
    y: number,
    root: number | undefined,
    state: NearestState,
  ): NearestAnchor {
    if (
      !Number.isSafeInteger(state.best) ||
      state.best < -1 ||
      !Number.isSafeInteger(state.distance) ||
      state.distance < 0 ||
      !Number.isInteger(state.visits) ||
      state.visits < 0 ||
      state.visits > index.nodes.length ||
      state.stack.some((n) => !Number.isInteger(n) || n < 0 || n >= index.nodes.length)
    )
      throw new RangeError("Invalid nearest-anchor continuation");
    const search = new NearestAnchor(index, x, y, root);
    for (let n = 0; n < state.visits; n++) {
      if (search.finished) throw new RangeError("Invalid nearest-anchor cursor");
      search.advance();
    }
    const expected = search.state;
    if (
      expected.best !== state.best ||
      expected.distance !== state.distance ||
      expected.stack.length !== state.stack.length ||
      expected.stack.some((n, i) => n !== state.stack[i])
    )
      throw new RangeError("Invalid nearest-anchor state");
    return search;
  }
}
