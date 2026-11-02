// Searches copied fog and remembered structures, never spawn slots or hidden map/path state.
import type { Stream } from "@open-neo-rts/deterministic";
import { nextInt } from "@open-neo-rts/deterministic";
import type { WorkBudget } from "../..";
import type { PlanningView } from "../economy";
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
    memory.goal = {
      x: ghost.x + 512,
      y: ghost.y + 512,
      until: observation.tick + 400,
      handle: ghost.handle,
    };
    return true;
  }
  const count = grid.width * grid.height;
  if (memory.scout === 0) memory.scout = nextInt(random, count);
  while (memory.scoutWork < 8) {
    if (!work.take()) return false;
    // 7919 is prime and greater than either supported grid dimension, so visits every cell.
    memory.scout = (memory.scout + 7919) % count;
    memory.scoutWork++;
    if (observation.fog?.some((fog) => fog.cells[memory.scout] === 2)) continue;
    memory.goal = {
      x: (memory.scout % grid.width) * 1024 + 512,
      y: Math.floor(memory.scout / grid.width) * 1024 + 512,
      until: observation.tick + 400,
      handle: null,
    };
    break;
  }
  return true;
}
