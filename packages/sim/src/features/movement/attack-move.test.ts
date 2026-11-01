import { expect, test } from "bun:test";
import type { Command } from "../../commands";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup, SIM_VERSION } from "../../match";
import { createProjection } from "../../projection";
import { parseScenario, runScenario, SCENARIO_FORMAT } from "../../snapshots";
import { createCommandLog, flatMap } from "../../testing";
import { Transform, toDefinition } from "../entities";
import { MoveIntent } from ".";

test("attack-move remains distinct through replanning, replacement, stop, grants and replay", () => {
  const unit = toDefinition({
    id: "unit:fixture",
    health: 10,
    radius: 0.25,
    movement: { domain: "foot", speed: 4 },
  });
  const block = toDefinition({ id: "structure:fixture", health: 100, footprint: [3, 3] });
  const setup: MatchSetup = {
    map: flatMap(16),
    seed: 1,
    debug: true,
    forces: [
      { index: 1, faction: "faction:fixture" },
      { index: 2, faction: "faction:fixture" },
    ],
    seats: [1],
    grants: [{ seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
    definitions: [unit, block],
  };
  const attack = (tick: number, entities = [1]): Command => ({
    tick,
    sequence: 99,
    seat: 1,
    type: "unit.attackMove",
    payload: { entities, x: 12800, y: 6656 },
  });
  const kernel = createMatch(setup);
  const log = createCommandLog();
  const projection = createProjection(setup, 1, "debug-no-fog");
  expect(
    step(kernel, [log.spawn(0, 0, unit.id, 1, 2560, 6656), attack(0)]).map(({ result }) => result),
  ).toEqual(["accepted", "accepted"]);
  expect(kernel.world.get(1, Transform, "x")).toBeGreaterThan(2560);
  expect(projection.snapshot(kernel).entities[0]?.order?.type).toBe("attackMove");
  step(kernel, [log.spawn(1, 0, block.id, 1, 5120, 5120)]);
  expect(kernel.world.get(1, MoveIntent, "attackMove")).toBe(1);
  step(kernel, [log.spawn(2, 0, unit.id, 2, 2560, 2560)]);
  expect(step(kernel, [attack(3, [1, 3])])[0]?.result).toBe("no_grant");
  expect(kernel.world.get(1, MoveIntent, "attackMove")).toBe(1);
  expect(kernel.world.has(3, MoveIntent)).toBe(false);
  step(kernel, [log.move(4, 1, [1], 2560, 12800)]);
  expect(projection.snapshot(kernel).entities[0]?.order?.type).toBe("move");
  step(kernel, [attack(5)]);
  expect(kernel.world.get(1, MoveIntent, "attackMove")).toBe(1);
  step(kernel, [log.stop(6, 1, [1])]);
  expect(projection.snapshot(kernel).entities[0]?.order).toBeNull();
  expect(kernel.movement?.snapshot().routes).toEqual([]);
  const scenario = parseScenario({
    format: SCENARIO_FORMAT,
    simVersion: SIM_VERSION,
    setup,
    commands: kernel.log
      .filter(({ result }) => result === "accepted")
      .map(({ command }) => command),
  });
  const replay = runScenario(scenario, { ticks: kernel.tick });
  expect(replay.at(-1)?.hash).toBe(checkpointHash(kernel));
  expect(runScenario(scenario, { ticks: kernel.tick })).toEqual(replay);
  expect(() => parseScenario({ ...scenario, simVersion: SIM_VERSION - 1 })).toThrow("$.simVersion");
  const malformed = { ...attack(kernel.tick), payload: { entities: [1], x: 1.5, y: 1 } };
  expect(step(kernel, [malformed])[0]?.result).toBe("bad_payload");
});
