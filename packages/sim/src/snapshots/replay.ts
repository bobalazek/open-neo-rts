import { sortCommands } from "../commands";
import { type Kernel, step } from "../kernel";
import { createMatch } from "../match";
import type { Scenario } from ".";

export interface RunOptions {
  seed?: number;
  ticks?: number;
}

export function scenarioTicks(scenario: Scenario, options: RunOptions): number {
  const required = scenario.commands.reduce(
    (ticks, command) => Math.max(ticks, command.tick + 1),
    0,
  );
  const ticks = options.ticks ?? required;
  if (!Number.isInteger(ticks) || ticks < required || ticks > 0x80000000)
    throw new RangeError(
      `ticks must be an integer from ${required} to ${0x80000000}; all logged commands must execute`,
    );
  return ticks;
}

/** Internal replay also permits stopping before the end of the log for divergence diagnosis. */
export function replayScenario(
  scenario: Scenario,
  ticks: number,
  observe?: (kernel: Kernel) => void,
): Kernel {
  const kernel = createMatch(scenario.setup);
  const commands = sortCommands(scenario.commands);
  let cursor = 0;
  observe?.(kernel);
  while (kernel.tick < ticks) {
    const start = cursor;
    while (commands[cursor]?.tick === kernel.tick) cursor++;
    step(kernel, commands.slice(start, cursor));
    observe?.(kernel);
  }
  return kernel;
}
