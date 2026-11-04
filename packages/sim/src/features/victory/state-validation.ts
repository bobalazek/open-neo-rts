import {
  type CanonicalValidation,
  canonicalInvariant as check,
} from "../../snapshots/validation-context";
import { OwnerForce, Template } from "../entities";
import { DEFEAT_REASONS, ForceOutcome, MatchOutcome } from ".";
import {
  ControllerStatistics,
  ForceStatistics,
  MAX_STAT_SAMPLES,
  STAT_SAMPLE_TICKS,
  StatisticsSample,
  StatisticsSeries,
  TypeStatistics,
} from "./statistics";

export function prepareVictoryValidation(context: CanonicalValidation): () => void {
  const { world, rows, has, kernel, setup, forces } = context;
  const anchors = [
    context.fixed(ForceOutcome, ["force", "team"]),
    context.fixed(MatchOutcome, []),
    context.fixed(ForceStatistics, ["force"]),
    context.fixed(ControllerStatistics, ["force", "seat"]),
    context.fixed(StatisticsSeries, ["force"]),
  ];
  return () => {
    for (const validate of anchors) validate();
    const teams = new Set(setup.normal?.forces.map((force) => force.team));
    const active = new Set<number>(),
      defeated = new Set<number>();
    const validVotes = setup.seats.reduce((mask, _, index) => mask | (1 << index), 0);
    for (const id of rows(ForceOutcome)) {
      const reason = world.get(id, ForceOutcome, "reason"),
        tick = world.get(id, ForceOutcome, "tick");
      check(
        reason < DEFEAT_REASONS.length && tick <= kernel.tick,
        `Force outcome ${id} is invalid`,
      );
      check(reason !== 0 || tick === 0, `active Force ${id} has a defeat tick`);
      check(
        (world.get(id, ForceOutcome, "votes") & validVotes) ===
          world.get(id, ForceOutcome, "votes"),
        `Force ${id} has unknown surrender voters`,
      );
      if (reason === 0) active.add(world.get(id, ForceOutcome, "team"));
      else defeated.add(world.get(id, ForceOutcome, "force"));
    }
    for (const id of rows(Template))
      check(
        !defeated.has(world.get(id, OwnerForce, "force")),
        `defeated Force still owns actor ${id}`,
      );
    for (const id of rows(MatchOutcome)) {
      const ended = world.get(id, MatchOutcome, "ended"),
        winner = world.get(id, MatchOutcome, "winner"),
        tick = world.get(id, MatchOutcome, "tick");
      check(ended <= 1, `match outcome ${id} has an invalid flag`);
      if (kernel.tick > 0)
        check(
          Boolean(ended) === (teams.size > 1 && active.size <= 1),
          "match result disagrees with its survivor set",
        );
      if (!ended) check(winner === 0xffffffff && tick === 0, "running match has a result");
      else {
        check(
          teams.size > 1 && active.size <= 1 && tick === kernel.tick,
          "terminal match has an invalid result tick or survivor set",
        );
        check(
          winner === (active.size ? [...active][0] : 0xffffffff),
          "match winner disagrees with active teams",
        );
      }
    }
    for (const component of [
      ForceOutcome,
      MatchOutcome,
      ForceStatistics,
      ControllerStatistics,
      StatisticsSeries,
    ])
      for (const id of rows(component))
        check(!has(id, Template), `${component.name} row ${id} is also an actor`);
    const types = new Set<string>();
    for (const id of rows(TypeStatistics)) {
      const force = world.get(id, TypeStatistics, "force"),
        definition = world.get(id, TypeStatistics, "definition"),
        key = `${force}:${definition}`;
      check(
        forces.has(force) && !has(id, Template) && !types.has(key),
        `duplicate or invalid type statistics ${id}`,
      );
      context.definition(definition);
      types.add(key);
    }
    const history = new Map<number, number[]>();
    for (const id of rows(StatisticsSample)) {
      const force = world.get(id, StatisticsSample, "force"),
        tick = world.get(id, StatisticsSample, "tick");
      check(
        forces.has(force) && tick <= kernel.tick && !has(id, Template),
        `statistics sample ${id} is invalid`,
      );
      const previous = history.get(force) ?? [];
      check(
        !previous.length || tick > previous[previous.length - 1]!,
        `statistics sample ${id} is not ordered`,
      );
      previous.push(tick);
      check(previous.length <= MAX_STAT_SAMPLES, `Force ${force} exceeds the sample limit`);
      history.set(force, previous);
    }
    for (const id of rows(StatisticsSeries)) {
      const interval = world.get(id, StatisticsSeries, "interval"),
        finished = world.get(id, StatisticsSeries, "finished");
      let cadence = Math.floor(interval / STAT_SAMPLE_TICKS);
      while (cadence > 1 && cadence % 2 === 0) cadence = Math.floor(cadence / 2);
      check(
        interval === 0x7fffffff || (interval % STAT_SAMPLE_TICKS === 0 && cadence === 1),
        `statistics series ${id} has an invalid interval`,
      );
      check(finished <= kernel.tick, `statistics series ${id} finishes in the future`);
      const samples = history.get(world.get(id, StatisticsSeries, "force"));
      check(
        samples?.[0] === 0 && (!finished || samples[samples.length - 1] === finished),
        `statistics series ${id} has an invalid boundary sample`,
      );
    }
  };
}
