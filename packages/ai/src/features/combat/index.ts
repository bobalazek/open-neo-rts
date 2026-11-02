// Counted individual orders for observed enemies, bounded scouting waves and low-health retreats.
import {
  baseOf,
  distance,
  type PlanningView,
  type PolicyCommand,
  type PolicyEntity,
} from "../economy";
export function shouldRetreat(view: PlanningView, entity: PolicyEntity): boolean {
  const base = baseOf(view);
  if (!base || !view.definitions.get(base.definition)?.footprint || base.constructionSite)
    return false;
  const previous = view.memory.orders.find((order) => order.handle === entity.handle);
  return entity.health * 100 < entity.maxHealth * (previous?.retreat ? 55 : 35);
}
export function army(
  view: PlanningView,
  entity: PolicyEntity,
  waveSize: number,
  scoutHandle?: string,
): PolicyCommand | undefined {
  const { memory, observation, definitions } = view;
  const definition = definitions.get(entity.definition);
  if (definition?.role !== "combat" || !definition.weapons?.length || entity.constructionSite)
    return;
  const base = baseOf(view),
    grid = observation.fog?.[0];
  if (!base || !grid) return;
  const previous = memory.orders.find((order) => order.handle === entity.handle);
  const retreat = shouldRetreat(view, entity);
  let x: number, y: number;
  let target: PolicyEntity | undefined;
  const reserve =
    !!definitions.get(base.definition)?.footprint &&
    !base.constructionSite &&
    !memory.enemy &&
    waveSize < 6 &&
    entity.handle !== scoutHandle;
  if (retreat || reserve) {
    const footprint = definitions.get(base.definition)?.footprint ?? [1, 1];
    x = Math.max(512, Math.min(grid.width * 1024 - 512, base.x - 3 * 1024));
    y = Math.max(512, Math.min(grid.height * 1024 - 512, base.y + (footprint[1] + 3) * 1024));
  } else {
    target = observation.entities.find((candidate) => candidate.handle === memory.enemy);
    if (memory.goal?.handle?.startsWith("e") && !target) return;
    if (!memory.goal) return;
    ({ x, y } = memory.goal);
  }
  const matching = previous?.x === x && previous.y === y && previous.retreat === retreat;
  if (target && !retreat) {
    const other = definitions.get(target.definition);
    let targetX = target.x,
      targetY = target.y;
    // Match sim combatPoint: static origins are the rotated footprint's top-left corner.
    if (other?.footprint) {
      const [width, depth] = other.footprint;
      const rotated = (((target.facing >>> 14) + 3) & 1) !== 0;
      targetX += (rotated ? depth : width) * 512;
      targetY += (rotated ? width : depth) * 512;
    }
    const squared = distance(entity, { x: targetX, y: targetY });
    const supported = definition.weapons.some((weapon) => {
      const domain = other?.footprint
        ? "structure"
        : other?.domain === "air"
          ? "air"
          : other?.domain === "naval"
            ? "naval"
            : "ground";
      return (
        (weapon.targets.includes(domain) ||
          (domain === "structure" && weapon.targets.includes("ground"))) &&
        squared >= weapon.rangeSubcells[0] ** 2 &&
        squared <= weapon.rangeSubcells[1] ** 2
      );
    });
    if (supported) {
      if (entity.attackTarget === target.handle) return;
      memory.orders = memory.orders.filter((order) => order.handle !== entity.handle);
      memory.orders.push({ handle: entity.handle, x, y, until: observation.tick + 40, retreat });
      return { type: "unit.attack", payload: { entities: [entity.handle], entity: target.handle } };
    }
  }
  if (
    matching &&
    (previous.until > observation.tick || (entity.order?.x === x && entity.order.y === y))
  )
    return;
  if (distance(entity, { x, y }) < 1024 ** 2) return;
  memory.orders = memory.orders.filter((order) => order.handle !== entity.handle);
  memory.orders.push({ handle: entity.handle, x, y, until: observation.tick + 200, retreat });
  return {
    type: retreat || reserve ? "unit.move" : "unit.attackMove",
    payload: { entities: [entity.handle], x, y },
  };
}
