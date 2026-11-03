// Searches copied fog and remembered structures, never spawn slots or hidden map/path state.
import type { Stream } from "@open-neo-rts/deterministic";
import { isqrt, nextInt } from "@open-neo-rts/deterministic";
import type { WorkBudget } from "../..";
import { shouldRetreat } from "../combat";
import { distance, type PlanningView } from "../economy";

const PERIMETER = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

/** A goal candidate's travel bound uses already-scanned own observations, never a path oracle. */
export function goalDeadline(view: PlanningView, point: { x: number; y: number }): number {
  let travel = 0;
  for (const entity of view.own) {
    const definition = view.definitions.get(entity.definition),
      speed = definition?.speed;
    if (definition?.role !== "combat" || !speed || shouldRetreat(view, entity)) continue;
    travel = Math.max(travel, Math.floor((2 * isqrt(distance(entity, point)) + speed - 1) / speed));
  }
  return Math.min(0xffffffff, view.observation.tick + 400 + travel);
}
export function scout(view: PlanningView, work: WorkBudget, random: Stream): boolean {
  const { memory, observation, policy } = view;
  const grid = observation.fog?.[0];
  if (!grid) {
    memory.goal = null;
    return true;
  }
  const goal = memory.goal;
  if (goal && goal.until > observation.tick) {
    if (goal.handle?.startsWith("g")) {
      if (observation.ghosts?.some((ghost) => ghost.handle === goal.handle)) return true;
    } else if (!goal.handle) {
      const cell = Math.floor(goal.y / 1024) * grid.width + Math.floor(goal.x / 1024);
      if (!observation.fog?.some((fog) => fog.cells[cell] === 2)) return true;
    }
  }
  memory.goal = null;
  if (goal?.handle?.startsWith("g") && goal.until <= observation.tick)
    memory.avoid = { handle: goal.handle, until: observation.tick + 400 };
  const ghost = observation.ghosts?.find(
    (ghost) =>
      !policy.allies.includes(ghost.force) &&
      !(memory.avoid?.handle === ghost.handle && memory.avoid.until > observation.tick),
  );
  if (ghost && goal?.handle !== ghost.handle && work.take()) {
    const point = { x: ghost.x + 512, y: ghost.y + 512 };
    memory.goal = {
      ...point,
      until: goalDeadline(view, point),
      handle: ghost.handle,
    };
    return true;
  }
  const base = memory.enemyBase;
  while (base && memory.baseScout < PERIMETER.length) {
    if (!work.take()) return false;
    const [dx, dy] = PERIMETER[memory.baseScout++]!;
    const point = {
      x: Math.max(512, Math.min(grid.width * 1024 - 512, base.x + dx * base.radius)),
      y: Math.max(512, Math.min(grid.height * 1024 - 512, base.y + dy * base.radius)),
    };
    const cell = Math.floor(point.y / 1024) * grid.width + Math.floor(point.x / 1024);
    if (observation.fog?.some((fog) => fog.cells[cell] === 2)) continue;
    memory.goal = { ...point, until: goalDeadline(view, point), handle: null };
    return true;
  }
  const count = grid.width * grid.height;
  if (memory.scout === 0) memory.scout = nextInt(random, count);
  while (memory.scoutWork < 8) {
    if (!work.take()) return false;
    // 7919 is prime and greater than either supported grid dimension, so visits every cell.
    memory.scout = (memory.scout + 7919) % count;
    memory.scoutWork++;
    if (
      observation.fog?.some((fog) => fog.cells[memory.scout] === 2) ||
      (memory.scoutWork < 8 && observation.fog?.some((fog) => fog.cells[memory.scout] === 1))
    )
      continue;
    const point = {
      x: (memory.scout % grid.width) * 1024 + 512,
      y: Math.floor(memory.scout / grid.width) * 1024 + 512,
    };
    memory.goal = {
      ...point,
      until: goalDeadline(view, point),
      handle: null,
    };
    break;
  }
  return true;
}
