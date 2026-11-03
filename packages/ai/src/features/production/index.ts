// Small fixed roster/build order; every policy candidate and command proposal spends counted work.
import type { BotProgram } from "../..";
import { army, shouldRetreat } from "../combat";
import {
  affordable,
  baseOf,
  complete,
  distance,
  economy,
  nextStructure,
  type PlanningView,
  type PolicyCommand,
  type PolicyEntity,
  type PolicyObservation,
  placement,
  prerequisites,
  type SkirmishMemory,
  type SkirmishPolicy,
} from "../economy";
import { goalDeadline, scout } from "../scouting";

function produce(view: PlanningView, producer: PolicyEntity): PolicyCommand | undefined {
  if (
    !complete(producer) ||
    !producer.production ||
    producer.production.queue.length >= producer.production.slots
  )
    return;
  const { policy, own, definitions } = view;
  const count = (id: string) =>
    own.filter((entity) => entity.definition === id).length +
    own.reduce(
      (total, entity) =>
        total + (entity.production?.queue.filter((item) => item.definition === id).length ?? 0),
      0,
    );
  const combatCount =
    own.filter(
      (entity) =>
        definitions.get(entity.definition)?.role === "combat" && !shouldRetreat(view, entity),
    ).length +
    own.reduce(
      (total, entity) =>
        total +
        (entity.production?.queue.filter(
          (item) => definitions.get(item.definition)?.role === "combat",
        ).length ?? 0),
      0,
    );
  const candidates = [
    ...(count(policy.builder) < 2 ? [policy.builder] : []),
    ...(count(policy.truck) < 2 ? [policy.truck] : []),
    ...(combatCount < 24 ? [policy.tank, policy.soldier] : []),
  ];
  for (const id of candidates) {
    const definition = definitions.get(id);
    const next = nextStructure(view);
    const reserve =
      id === policy.builder
        ? 0
        : next
          ? (definitions.get(next)?.construction?.cost.credits ?? 0)
          : id === policy.soldier &&
              own.some((entity) => entity.definition === policy.extractor && complete(entity)) &&
              count(policy.tank) < 6
            ? (definitions.get(policy.tank)?.construction?.cost.credits ?? 0)
            : 0;
    if (
      definitions.get(producer.definition)?.produces?.includes(id) &&
      definition &&
      prerequisites(view, definition) &&
      affordable(view, definition, reserve)
    )
      return { type: "production.enqueue", payload: { entity: producer.handle, definition: id } };
  }
}
export const initialSkirmishMemory = (): SkirmishMemory => ({
  stage: 0,
  nextPlan: 0,
  buildAfter: 0,
  placement: 0,
  scout: 0,
  scoutWork: 0,
  owned: [],
  enemy: null,
  goal: null,
  avoid: null,
  site: null,
  orders: [],
});
/** Public catalog/config is immutable for this program. Every evolving choice lives in returned memory. */
export function basicSkirmishProgram(
  policy: SkirmishPolicy,
): BotProgram<PolicyObservation, PolicyCommand, SkirmishMemory> {
  const definitions = new Map(policy.definitions.map((definition) => [definition.id, definition]));
  return ({ observation, state, work, random }) => {
    const memory = state.memory ?? initialSkirmishMemory();
    const commands: PolicyCommand[] = [];
    let cursor = state.cursor;
    if (memory.stage === 0 && observation.tick < memory.nextPlan) return { state, commands };
    const entities = new Map(observation.entities.map((entity) => [entity.handle, entity]));
    if (memory.stage === 0) {
      while (cursor < observation.entities.length) {
        if (!work.take()) return { state: { ...state, cursor, memory }, commands };
        const entity = observation.entities[cursor++];
        if (!entity || entity.health <= 0) continue;
        if (entity.force === policy.force) {
          if (!memory.owned.includes(entity.handle)) memory.owned.push(entity.handle);
        } else if (
          !policy.allies.includes(entity.force) &&
          !(memory.avoid?.handle === entity.handle && memory.avoid.until > observation.tick)
        ) {
          const previous = memory.enemy && entities.get(memory.enemy);
          const rank = (candidate: PolicyEntity) =>
            definitions.get(candidate.definition)?.role === "combat" ? 0 : 1;
          if (!previous || rank(entity) < rank(previous)) memory.enemy = entity.handle;
        }
      }
      memory.stage = 1;
      cursor = 0;
    }
    const own = memory.owned
      .map((handle) => entities.get(handle))
      .filter(
        (entity): entity is PolicyEntity =>
          !!entity && entity.force === policy.force && entity.health > 0,
      );
    const view: PlanningView = { observation, policy, memory, own, definitions };
    if (memory.stage === 1) {
      let command: PolicyCommand | undefined;
      if (cursor === 0) {
        if (!work.take()) return { state: { ...state, cursor, memory }, commands };
        command = economy(view);
        cursor = 1;
      }
      while (!command && cursor <= 8) {
        if (!work.take()) return { state: { ...state, cursor, memory }, commands };
        const result = placement(view, memory.placement);
        if (result === null) break;
        command = result;
        cursor++;
        memory.placement = (memory.placement + 1) % 1089;
      }
      if (command) commands.push(command);
      memory.stage = 2;
      cursor = 0;
    }
    if (memory.stage === 2) {
      while (cursor < own.length) {
        if (!work.take()) return { state: { ...state, cursor, memory }, commands };
        const entity = own[cursor++];
        const command = entity && produce(view, entity);
        if (command) {
          commands.push(command);
          break;
        }
      }
      memory.stage = 3;
      cursor = 0;
    }
    if (memory.stage === 3) {
      const enemy = memory.enemy && entities.get(memory.enemy);
      if (enemy && !policy.allies.includes(enemy.force)) {
        if (!work.take()) return { state: { ...state, cursor, memory }, commands };
        const base = baseOf(view);
        const previous = memory.goal?.handle === enemy.handle ? memory.goal : null;
        const point = {
          x: enemy.x + (definitions.get(enemy.definition)?.footprint ? 512 : 0),
          y: enemy.y + (definitions.get(enemy.definition)?.footprint ? 512 : 0),
        };
        const until = previous
          ? enemy.health < (previous.health ?? enemy.health)
            ? Math.max(previous.until, observation.tick + 400)
            : previous.until
          : goalDeadline(view, point);
        // A known unreachable distant objective gets a bounded pause before another attempt.
        if (
          previous &&
          until <= observation.tick &&
          base &&
          distance(base, enemy) > (12 * 1024) ** 2
        ) {
          memory.avoid = { handle: enemy.handle, until: observation.tick + 400 };
          memory.enemy = null;
          memory.goal = null;
        } else
          memory.goal = {
            ...point,
            until,
            handle: enemy.handle,
            health: enemy.health,
          };
      } else memory.enemy = null;
      if (!memory.enemy && !scout(view, work, random))
        return { state: { ...state, cursor, memory }, commands };
      memory.stage = 4;
      cursor = 0;
    }
    if (memory.stage === 4) {
      const armyEntities = own.filter(
        (entity) => definitions.get(entity.definition)?.role === "combat",
      );
      const scoutHandle = armyEntities.find((entity) => !shouldRetreat(view, entity))?.handle;
      while (cursor < armyEntities.length) {
        if (!work.take()) return { state: { ...state, cursor, memory }, commands };
        const entity = armyEntities[cursor++];
        const command = entity && army(view, entity, armyEntities.length, scoutHandle);
        if (command) commands.push(command);
      }
      memory.orders = memory.orders.filter((order) => entities.has(order.handle));
      memory.owned = [];
      memory.enemy = null;
      memory.stage = 0;
      memory.scoutWork = 0;
      memory.nextPlan = observation.tick + 10;
      cursor = 0;
    }
    return {
      state: { cursor, target: memory.goal?.handle ?? null, pending: [], memory },
      commands,
    };
  };
}
