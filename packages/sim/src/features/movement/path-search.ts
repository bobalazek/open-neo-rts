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

export interface PathResult {
  status: "searching" | "found" | "unreachable";
  /** Includes the start and the best reachable endpoint, even while searching. */
  path: number[];
  cost: number;
  /** Nodes expanded by this step, including the goal when found. */
  expansions: number;
}

/**
 * Incremental A* for one request, separate from kernel state. Keep the supplied grid unchanged until
 * completion. Best partial / unreachable endpoint: lowest octile distance, then path cost, then index.
 */
export class PathSearch {
  private readonly cost: number[];
  private readonly parent: Int32Array;
  private readonly position: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap: number[] = [];
  private best: number;
  private status: PathResult["status"] = "searching";

  constructor(
    private readonly grid: NavGrid,
    start: number,
    private readonly goal: number,
  ) {
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
    if (cost.length !== cells || connections.length !== cells)
      throw new RangeError("Nav grid layers must contain width × height cells");
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(goal) ||
      start < 0 ||
      goal < 0 ||
      start >= cells ||
      goal >= cells ||
      cost[start] === 0
    )
      throw new RangeError("Path endpoints must be cell indices and the start must be passable");
    this.cost = new Array<number>(cells).fill(-1);
    this.parent = new Int32Array(cells).fill(-1);
    this.position = new Int32Array(cells).fill(-1);
    this.closed = new Uint8Array(cells);
    this.cost[start] = 0;
    this.best = start;
    this.pushOrRaise(start);
  }

  step(budget: number): PathResult {
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
        if (this.closed[next] || !this.canCross(cell, next, direction)) continue;
        if (dx !== 0 && dy !== 0) {
          const horizontal = cell + dx;
          const vertical = cell + dy * this.grid.width;
          const eastWest = dx < 0 ? 3 : 4;
          const northSouth = dy < 0 ? 1 : 6;
          // Both routes round a diagonal must be clear, including their cliff edges.
          if (
            !this.canCross(cell, horizontal, eastWest) ||
            !this.canCross(cell, vertical, northSouth) ||
            !this.canCross(horizontal, next, northSouth) ||
            !this.canCross(vertical, next, eastWest)
          )
            continue;
        }
        const cost =
          (this.cost[cell] as number) +
          (dx !== 0 && dy !== 0 ? 14 : 10) * (this.grid.cost[next] as number);
        if (this.cost[next] !== -1 && cost >= (this.cost[next] as number)) continue;
        this.cost[next] = cost;
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
    const path: number[] = [];
    for (let cell = this.best; cell !== -1; cell = this.parent[cell] as number) path.push(cell);
    path.reverse();
    return { status: this.status, path, cost: this.cost[this.best] as number, expansions };
  }

  private canCross(from: number, to: number, direction: number): boolean {
    return (
      this.grid.cost[to] !== 0 && ((this.grid.connections[from] as number) & (1 << direction)) !== 0
    );
  }

  private heuristic(cell: number): number {
    const width = this.grid.width;
    const dx = Math.abs((cell % width) - (this.goal % width));
    const dy = Math.abs(Math.floor(cell / width) - Math.floor(this.goal / width));
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
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
