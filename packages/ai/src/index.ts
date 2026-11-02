// Bot players: read observations, emit commands. Deterministic, budgets in work units.
import type { Stream } from "@open-neo-rts/deterministic";

export interface DecisionState<Command, Memory = undefined> {
  cursor: number;
  target: string | null;
  pending: readonly Command[];
  memory?: Memory;
}
export interface WorkBudget {
  /** One call per evaluated candidate/work unit. False means resume from the saved cursor next tick. */
  take(): boolean;
  readonly used: number;
}
export type BotProgram<Observation, Command, Memory = undefined> = (input: {
  readonly observation: Observation;
  readonly state: DecisionState<Command, Memory>;
  readonly random: Stream;
  readonly work: WorkBudget;
}) => { state: DecisionState<Command, Memory>; commands: readonly Command[] };

/** Host-independent runner: it receives copies and returns decisions, never applies simulation state. */
export function runDecision<Observation, Command, Memory = undefined>(
  program: BotProgram<Observation, Command, Memory>,
  observation: Observation,
  state: DecisionState<Command, Memory>,
  random: Stream,
  limit: number,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 4096)
    throw new RangeError("Invalid bot work budget");
  let used = 0;
  const work: WorkBudget = {
    take() {
      if (used === limit) return false;
      used++;
      return true;
    },
    get used() {
      return used;
    },
  };
  const nextRandom = { ...random };
  const result = program({ observation, state, random: nextRandom, work });
  return { ...result, used, random: nextRandom };
}

/** Hosting capability only. Economy/scouting/combat policies are separate phase-2 tasks. */
export function idleProgram<Observation, Command, Memory = undefined>(): BotProgram<
  Observation,
  Command,
  Memory
> {
  return ({ state, work }) => {
    work.take();
    return { state, commands: [] };
  };
}

export * from "./features/economy";
export * from "./features/production";
