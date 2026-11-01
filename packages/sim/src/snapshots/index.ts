// Versioned command logs and headless replay. Full-state snapshots arrive in phase 2.
import {
  arr,
  bool,
  type Issue,
  idOf,
  int,
  oneOf,
  opt,
  str,
  unknown,
  validate,
} from "@open-neo-rts/content";
import { type Command, REJECTIONS, SYSTEM_SEAT, validateCommands } from "../commands";
import { checkpointHash } from "../kernel";
import { type MatchSetup, SIM_VERSION } from "../match";

import { type RunOptions, replayScenario, scenarioTicks } from "./replay";
import { strictObject } from "./schema";

export * from "./trace";

export const SCENARIO_FORMAT = 1;

export interface Scenario {
  format: typeof SCENARIO_FORMAT;
  simVersion: typeof SIM_VERSION;
  setup: MatchSetup;
  commands: readonly Command[];
}

const INT32_MAX = 0x7fffffff;
const id = () => int(0, INT32_MAX);

const scenarioSchema = strictObject({
  format: int(SCENARIO_FORMAT, SCENARIO_FORMAT),
  simVersion: int(SIM_VERSION, SIM_VERSION),
  setup: strictObject({
    seed: int(0, 0xffffffff),
    debug: bool(),
    forces: arr(strictObject({ index: id(), faction: idOf("faction") })),
    seats: arr(int(1, INT32_MAX)),
    grants: arr(
      strictObject({
        seat: int(1, INT32_MAX),
        force: id(),
        scopes: arr(
          oneOf([
            "unit.orders",
            "unit.abilities",
            "economy.transfer",
            "economy.build",
            "production.queue",
            "research.spend",
            "diplomacy.propose",
            "diplomacy.accept",
            "commander.abilities",
            "surrender",
            "team.admin",
          ]),
        ),
        grantedAtTick: id(),
        revokedAtTick: opt(id()),
        expiresAtTick: opt(id()),
      }),
    ),
    definitions: arr(
      strictObject({
        id: str(/^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/),
        health: int(1, INT32_MAX),
        speed: int(0, INT32_MAX),
        turnRate: int(0, 0x10000),
      }),
    ),
  }),
  commands: arr(
    strictObject({ tick: id(), seat: id(), sequence: id(), type: str(), payload: unknown() }),
  ),
});

/** Checks untrusted parsed JSON, including declared references, without applying gameplay rules. */
export function parseScenario(value: unknown): Scenario {
  const issues = validate(scenarioSchema, value);
  if (issues.length) fail(issues);
  const scenario = value as Scenario;
  const { forces, seats, definitions, grants } = scenario.setup;
  const forceIds = unique(
    forces.map((force) => force.index),
    "$.setup.forces",
    ".index",
    issues,
  );
  const seatIds = unique(seats, "$.setup.seats", "", issues);
  const definitionIds = unique(
    definitions.map((definition) => definition.id),
    "$.setup.definitions",
    ".id",
    issues,
  );
  for (const [i, grant] of grants.entries()) {
    reference(seatIds, grant.seat, `$.setup.grants[${i}].seat`, issues);
    reference(forceIds, grant.force, `$.setup.grants[${i}].force`, issues);
  }
  // Debug gating is semantic: a well-formed debug command in a normal match logs debug_only.
  const results = validateCommands(scenario.commands, { debug: true });
  for (const [i, result] of results.entries()) {
    const path = `$.commands[${i}]`;
    if (!result.accepted) {
      const field =
        result.code === "duplicate"
          ? ".sequence"
          : result.code === "unknown_type"
            ? ".type"
            : ".payload";
      issues.push({ path: path + field, message: REJECTIONS[result.code] });
      continue;
    }
    const command = result.command;
    if (command.seat !== SYSTEM_SEAT) reference(seatIds, command.seat, `${path}.seat`, issues);
    if (command.type === "debug.spawn") {
      reference(forceIds, command.payload.force, `${path}.payload.force`, issues);
      reference(definitionIds, command.payload.definition, `${path}.payload.definition`, issues);
    }
  }
  if (issues.length) fail(issues);
  return scenario;
}

function unique<T>(values: readonly T[], path: string, field: string, issues: Issue[]): Set<T> {
  const ids = new Set<T>();
  for (const [i, value] of values.entries()) {
    if (ids.has(value))
      issues.push({ path: `${path}[${i}]${field}`, message: `duplicate ID ${value}` });
    ids.add(value);
  }
  return ids;
}

function reference<T>(ids: Set<T>, value: T, path: string, issues: Issue[]): void {
  if (!ids.has(value)) issues.push({ path, message: `undeclared reference ${value}` });
}

function fail(issues: Issue[]): never {
  throw new Error(
    `Invalid scenario:\n${issues.map(({ path, message }) => `${path}: ${message}`).join("\n")}`,
  );
}

export interface Checkpoint {
  tick: number;
  hash: string;
}

/** Runs all commands, returning automatic checkpoints and the final state exactly once. */
export function runScenario(scenario: Scenario, options: RunOptions = {}): Checkpoint[] {
  const ticks = scenarioTicks(scenario, options);
  const effective = {
    ...scenario,
    setup: { ...scenario.setup, seed: options.seed ?? scenario.setup.seed },
  };
  const kernel = replayScenario(effective, ticks);
  const checkpoints = [...kernel.checkpoints];
  if (checkpoints.at(-1)?.tick !== kernel.tick)
    checkpoints.push({ tick: kernel.tick, hash: checkpointHash(kernel) });
  return checkpoints;
}
