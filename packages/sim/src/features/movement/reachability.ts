import { canTraverse, NAV_DIRECTIONS, type NavGrid, PathSearch } from "./path-search";

/** Components of a reciprocal navigation grid. Blocked cells have label zero. */
export function labelReachability(grid: NavGrid): Uint32Array {
  PathSearch.checkGrid(grid);
  const labels = new Uint32Array(grid.cost.length);
  const queue: number[] = [];
  let component = 0;
  for (let start = 0; start < labels.length; start++) {
    if (!grid.cost[start] || labels[start]) continue;
    labels[start] = ++component;
    queue.length = 0;
    queue.push(start);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor] as number;
      for (const [direction, [dx, dy]] of NAV_DIRECTIONS.entries()) {
        const x = (cell % grid.width) + dx;
        const y = Math.floor(cell / grid.width) + dy;
        if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
        const next = y * grid.width + x;
        if (!canTraverse(grid, cell, next, direction)) continue;
        if (!canTraverse(grid, next, cell, 7 - direction))
          throw new RangeError("Reachability requires reciprocal navigation edges");
        if (labels[next]) continue;
        labels[next] = component;
        queue.push(next);
      }
    }
  }
  return labels;
}

/** Nearest cell by octile distance, ties by row-major index. Target cell coordinates may be off-map. */
export function nearestReachable(
  grid: NavGrid,
  labels: Uint32Array,
  start: number,
  target: { x: number; y: number },
): number | undefined {
  if (
    labels.length !== grid.cost.length ||
    !Number.isInteger(start) ||
    start < 0 ||
    start >= labels.length ||
    !Number.isInteger(target.x) ||
    !Number.isInteger(target.y) ||
    Math.abs(target.x) > 0x7fffffff ||
    Math.abs(target.y) > 0x7fffffff
  )
    throw new RangeError("Invalid reachability endpoints");
  const component = labels[start];
  if (!component) return undefined;
  if (target.x >= 0 && target.y >= 0 && target.x < grid.width && target.y < grid.height) {
    const goal = target.y * grid.width + target.x;
    if (labels[goal] === component) return goal;
  }
  let best: number | undefined;
  let distance = Number.MAX_SAFE_INTEGER;
  for (let cell = 0; cell < labels.length; cell++) {
    if (labels[cell] !== component) continue;
    const dx = Math.abs((cell % grid.width) - target.x);
    const dy = Math.abs(Math.floor(cell / grid.width) - target.y);
    const next = 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
    if (next < distance) {
      best = cell;
      distance = next;
    }
  }
  return best;
}
