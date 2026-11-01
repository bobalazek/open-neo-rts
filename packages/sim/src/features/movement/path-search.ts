/** Neighbour bits in NavGrid.connections, in row-major order around a cell. */
export const NAV_DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/** A compiled movement domain, row-major like TerrainGrid. The caller owns terrain policy. */
export interface NavGrid {
  width: number;
  height: number;
  /** Zero blocks a cell; positive values multiply its 10/14 entry cost. */
  cost: Uint16Array;
  /** Outgoing neighbour bits; missing connections block edges such as cliffs. */
  connections: Uint8Array;
}

/** Both orthogonal routes round a diagonal must be clear, including their cliff edges. */
export function canTraverse(grid: NavGrid, from: number, to: number, direction: number): boolean {
  const [dx, dy] = NAV_DIRECTIONS[direction] as (typeof NAV_DIRECTIONS)[number];
  const crosses = (a: number, b: number, d: number) =>
    grid.cost[b] !== 0 && ((grid.connections[a] as number) & (1 << d)) !== 0;
  if (!crosses(from, to, direction)) return false;
  if (dx === 0 || dy === 0) return true;
  const horizontal = from + dx;
  const vertical = from + dy * grid.width;
  const eastWest = dx < 0 ? 3 : 4;
  const northSouth = dy < 0 ? 1 : 6;
  return (
    crosses(from, horizontal, eastWest) &&
    crosses(from, vertical, northSouth) &&
    crosses(horizontal, to, northSouth) &&
    crosses(vertical, to, eastWest)
  );
}

export interface PathResult {
  status: "searching" | "found" | "unreachable";
  /** Includes the start and the best reachable endpoint, even while searching. */
  path: number[];
  cost: number;
  /** Nodes expanded by this step, including the goal when found. */
  expansions: number;
}

/** Plain integer state, including the heap order; the grid is supplied separately on restore. */
export interface PathSearchState {
  start: number;
  goal: number;
  cost: readonly number[];
  parent: readonly number[];
  closed: readonly number[];
  heap: readonly number[];
  best: number;
  status: PathResult["status"];
}

/**
 * Incremental A* for one request, separate from kernel state. Keep the supplied grid unchanged until
 * completion. Best partial / unreachable endpoint: lowest octile distance, then path cost, then index.
 */
export class PathSearch {
  private readonly minimumCost: number;
  private readonly visited = new Set<number>();
  private readonly cost: number[];
  private readonly parent: Int32Array;
  private readonly position: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap: number[] = [];
  private best: number;
  private status: PathResult["status"] = "searching";

  constructor(
    private readonly grid: NavGrid,
    private readonly start: number,
    private readonly goal: number,
  ) {
    PathSearch.check(grid, start, goal);
    this.minimumCost = 65535;
    for (const cost of grid.cost)
      if (cost !== 0) this.minimumCost = Math.min(this.minimumCost, cost);
    const cells = grid.width * grid.height;
    this.cost = new Array<number>(cells).fill(-1);
    this.parent = new Int32Array(cells).fill(-1);
    this.position = new Int32Array(cells).fill(-1);
    this.closed = new Uint8Array(cells);
    this.cost[start] = 0;
    this.visited.add(start);
    this.best = start;
    this.pushOrRaise(start);
  }

  /** Validate queued requests without allocating their search arrays yet. */
  static check(grid: NavGrid, start: number, goal: number): void {
    PathSearch.checkGrid(grid);
    const cells = grid.width * grid.height;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(goal) ||
      start < 0 ||
      goal < 0 ||
      start >= cells ||
      goal >= cells ||
      grid.cost[start] === 0
    )
      throw new RangeError("Path endpoints must be cell indices and the start must be passable");
  }

  static checkGrid(grid: NavGrid): void {
    const { width, height, cost, connections } = grid;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 512 ||
      height > 512
    )
      throw new RangeError("Nav grid dimensions must be integers in [1, 512]");
    const cells = width * height;
    if (
      !(cost instanceof Uint16Array) ||
      !(connections instanceof Uint8Array) ||
      cost.length !== cells ||
      connections.length !== cells
    )
      throw new RangeError("Nav grid layers must contain width × height cells");
  }

  step(budget: number): PathResult {
    const expansions = this.advance(budget);
    return { ...this.result(), expansions };
  }

  /** Expand without reconstructing a partial path at every round-robin turn. */
  advance(budget: number): number {
    if (!Number.isSafeInteger(budget) || budget < 0)
      throw new RangeError("Path budget must be a nonnegative safe integer");
    let expansions = 0;
    while (this.status === "searching" && expansions < budget) {
      const cell = this.pop();
      this.closed[cell] = 1;
      expansions++;
      if (cell === this.goal) {
        this.best = cell;
        this.status = "found";
        break;
      }
      const x = cell % this.grid.width;
      const y = Math.floor(cell / this.grid.width);
      for (const [direction, [dx, dy]] of NAV_DIRECTIONS.entries()) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.grid.width || ny >= this.grid.height) continue;
        const next = ny * this.grid.width + nx;
        if (this.closed[next] || !canTraverse(this.grid, cell, next, direction)) continue;
        const cost =
          (this.cost[cell] as number) +
          (dx !== 0 && dy !== 0 ? 14 : 10) * (this.grid.cost[next] as number);
        if (this.cost[next] !== -1 && cost >= (this.cost[next] as number)) continue;
        this.cost[next] = cost;
        this.visited.add(next);
        this.parent[next] = cell;
        this.pushOrRaise(next);
        const h = this.heuristic(next);
        const bestH = this.heuristic(this.best);
        if (
          h < bestH ||
          (h === bestH &&
            (cost < (this.cost[this.best] as number) ||
              (cost === this.cost[this.best] && next < this.best)))
        )
          this.best = next;
      }
      if (this.heap.length === 0) this.status = "unreachable";
    }
    return expansions;
  }

  /** Observes the current partial/final path without expanding any nodes. */
  result(): PathResult {
    const path: number[] = [];
    for (let cell = this.best; cell !== -1; cell = this.parent[cell] as number) path.push(cell);
    path.reverse();
    return { status: this.status, path, cost: this.cost[this.best] as number, expansions: 0 };
  }

  get finished(): boolean {
    return this.status !== "searching";
  }

  snapshot(): PathSearchState {
    return {
      start: this.start,
      goal: this.goal,
      cost: [...this.cost],
      parent: [...this.parent],
      closed: [...this.closed],
      heap: [...this.heap],
      best: this.best,
      status: this.status,
    };
  }

  /** Hash directly: checkpoint publication does not allocate full search snapshots. */
  hashInto(h: Hasher): void {
    for (const n of [this.start, this.goal, this.best]) addU32(h, n);
    addString(h, this.status);
    addU32(h, this.cost.length);
    // Unvisited entries have fixed defaults. Only discovered nodes need hash words.
    addU32(h, this.visited.size);
    for (const i of [...this.visited].sort((a, b) => a - b)) {
      addU32(h, i);
      addInt(h, this.cost[i] as number);
      addU32(h, this.parent[i] as number);
      addU32(h, this.closed[i] as number);
    }
    addU32(h, this.heap.length);
    for (const cell of this.heap) addU32(h, cell);
  }

  /** Restore a snapshot against the same immutable grid. Reject malformed internal links. */
  static restore(grid: NavGrid, state: PathSearchState): PathSearch {
    const search = new PathSearch(grid, state.start, state.goal);
    const cells = grid.width * grid.height;
    const index = (value: number) => Number.isInteger(value) && value >= 0 && value < cells;
    if (
      !Array.isArray(state.cost) ||
      !Array.isArray(state.parent) ||
      !Array.isArray(state.closed) ||
      !Array.isArray(state.heap) ||
      state.cost.length !== cells ||
      state.parent.length !== cells ||
      state.closed.length !== cells ||
      !index(state.best) ||
      state.cost[state.start] !== 0 ||
      state.parent[state.start] !== -1 ||
      state.cost[state.best] === -1 ||
      !["searching", "found", "unreachable"].includes(state.status)
    )
      throw new RangeError("Invalid path search state");
    search.position.fill(-1);
    for (let cell = 0; cell < cells; cell++) {
      const cost = state.cost[cell] as number;
      const parent = state.parent[cell] as number;
      const closed = state.closed[cell] as number;
      if (
        !Number.isSafeInteger(cost) ||
        cost < -1 ||
        cost > cells * 14 * 65535 ||
        (closed !== 0 && closed !== 1) ||
        (cost === -1 && (parent !== -1 || closed !== 0)) ||
        (cost !== -1 &&
          cell !== state.start &&
          (!index(parent) ||
            (state.cost[parent] as number) < 0 ||
            (state.cost[parent] as number) >= cost))
      )
        throw new RangeError("Invalid path search node");
      if (cost !== -1 && cell !== state.start) {
        const dx = (cell % grid.width) - (parent % grid.width);
        const dy = Math.floor(cell / grid.width) - Math.floor(parent / grid.width);
        const direction = NAV_DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
        if (
          direction === -1 ||
          state.closed[parent] !== 1 ||
          !canTraverse(grid, parent, cell, direction) ||
          cost !==
            (state.cost[parent] as number) +
              (dx !== 0 && dy !== 0 ? 14 : 10) * (grid.cost[cell] as number)
        )
          throw new RangeError("Invalid path search parent edge");
      }
      search.cost[cell] = cost;
      if (cost !== -1) search.visited.add(cell);
      search.parent[cell] = parent;
      search.closed[cell] = closed;
    }
    search.heap.length = 0;
    for (const cell of state.heap) {
      if (
        !index(cell) ||
        search.position[cell] !== -1 ||
        search.cost[cell] === -1 ||
        search.closed[cell]
      )
        throw new RangeError("Invalid path search heap");
      const position = search.heap.length;
      if (
        position > 0 &&
        search.before(cell, search.heap[Math.floor((position - 1) / 2)] as number)
      )
        throw new RangeError("Invalid path search heap order");
      search.position[cell] = position;
      search.heap.push(cell);
    }
    for (let cell = 0; cell < cells; cell++)
      if (search.cost[cell] !== -1 && !search.closed[cell] && search.position[cell] === -1)
        throw new RangeError("Missing open path search node");
    if (
      (state.status === "searching" && search.heap.length === 0) ||
      (state.status === "unreachable" && search.heap.length !== 0) ||
      (state.status === "found" && (state.best !== state.goal || !search.closed[state.goal]))
    )
      throw new RangeError("Invalid path search status");
    search.best = state.best;
    search.status = state.status;
    return search;
  }

  private heuristic(cell: number): number {
    const width = this.grid.width;
    const dx = Math.abs((cell % width) - (this.goal % width));
    const dy = Math.abs(Math.floor(cell / width) - Math.floor(this.goal / width));
    return (10 * Math.max(dx, dy) + 4 * Math.min(dx, dy)) * this.minimumCost;
  }

  private before(a: number, b: number): boolean {
    const ah = this.heuristic(a);
    const bh = this.heuristic(b);
    const af = (this.cost[a] as number) + ah;
    const bf = (this.cost[b] as number) + bh;
    return af < bf || (af === bf && (ah < bh || (ah === bh && a < b)));
  }

  private pushOrRaise(cell: number): void {
    let i = this.position[cell] as number;
    if (i === -1) {
      i = this.heap.length;
      this.heap.push(cell);
    }
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      const above = this.heap[parent] as number;
      if (!this.before(cell, above)) break;
      this.heap[i] = above;
      this.position[above] = i;
      i = parent;
    }
    this.heap[i] = cell;
    this.position[cell] = i;
  }

  private pop(): number {
    const first = this.heap[0] as number;
    const last = this.heap.pop() as number;
    this.position[first] = -1;
    if (this.heap.length === 0) return first;
    let i = 0;
    while (i * 2 + 1 < this.heap.length) {
      let child = i * 2 + 1;
      if (
        child + 1 < this.heap.length &&
        this.before(this.heap[child + 1] as number, this.heap[child] as number)
      )
        child++;
      const below = this.heap[child] as number;
      if (!this.before(below, last)) break;
      this.heap[i] = below;
      this.position[below] = i;
      i = child;
    }
    this.heap[i] = last;
    this.position[last] = i;
    return first;
  }
}

import { addInt, addString, addU32, type Hasher } from "@open-neo-rts/deterministic";
