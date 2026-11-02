import type { NavigationGrid } from "./navigation";
import { canTraverse, NAV_DIRECTIONS, type NavGrid, PathSearch } from "./path-search";
import { clearSegment, type Point } from "./segment";

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

/** Synchronous reference/offline join selection; kernel preparation uses counted AnchorSearch. */
export function reachableStart(
  grid: NavigationGrid,
  labels: Uint32Array,
  position: Point,
  target: { x: number; y: number },
): number | undefined {
  const x = Math.min(grid.width - 1, Math.floor(position.x / 1024));
  const y = Math.min(grid.height - 1, Math.floor(position.y / 1024));
  const centre = (cell: number): Point => ({
    x: (cell % grid.width) * 1024 + 512,
    y: Math.floor(cell / grid.width) * 1024 + 512,
  });
  const start = y * grid.width + x;
  if (labels[start] && clearSegment(grid, position, centre(start))) return start;
  if (!clearSegment(grid, position, position)) return undefined;

  // An exact goal's component wins; blocked goals retain nearest-cell/row-major fallback.
  let preferred =
    target.x >= 0 && target.y >= 0 && target.x < grid.width && target.y < grid.height
      ? labels[target.y * grid.width + target.x] || undefined
      : undefined;
  let goalDistance = Number.MAX_SAFE_INTEGER;
  if (preferred === undefined) {
    for (let cell = 0; cell < labels.length; cell++) {
      if (!labels[cell]) continue;
      const dx = Math.abs((cell % grid.width) - target.x);
      const dy = Math.abs(Math.floor(cell / grid.width) - target.y);
      const distance = 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
      if (distance < goalDistance) {
        goalDistance = distance;
        preferred = labels[cell];
      }
    }
  }
  const anchors = new Map<number, { cell: number; distance: number }>();
  const consider = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) return;
    const cell = cy * grid.width + cx;
    if (cell === start) return;
    const component = labels[cell] as number;
    if (!component) return;
    const point = centre(cell);
    const distance = (point.x - position.x) ** 2 + (point.y - position.y) ** 2;
    const previous = anchors.get(component);
    if (
      previous &&
      (distance > previous.distance || (distance === previous.distance && cell > previous.cell))
    )
      return;
    if (clearSegment(grid, position, point)) anchors.set(component, { cell, distance });
  };
  // Perimeters avoid sorting/scanning the whole grid in the common local-corner case.
  const limit = Math.max(x, y, grid.width - 1 - x, grid.height - 1 - y);
  for (let ring = 0; ring <= limit; ring++) {
    for (let cx = x - ring; cx <= x + ring; cx++) {
      consider(cx, y - ring);
      if (ring) consider(cx, y + ring);
    }
    for (let cy = y - ring + 1; cy < y + ring; cy++) {
      consider(x - ring, cy);
      if (ring) consider(x + ring, cy);
    }
    const best = preferred === undefined ? undefined : anchors.get(preferred);
    // Every unvisited centre is at least ring*1024+512 away along one axis.
    if (best && best.distance < (ring * 1024 + 512) ** 2) return best.cell;
  }
  // No visible preferred component: choose the existing nearest reachable goal across joins.
  let selected: number | undefined;
  goalDistance = Number.MAX_SAFE_INTEGER;
  for (let cell = 0; cell < labels.length; cell++) {
    const anchor = anchors.get(labels[cell] as number);
    if (!anchor) continue;
    const dx = Math.abs((cell % grid.width) - target.x);
    const dy = Math.abs(Math.floor(cell / grid.width) - target.y);
    const distance = 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
    if (distance < goalDistance) {
      selected = anchor.cell;
      goalDistance = distance;
    }
  }
  return selected;
}
