import { parseTerrain } from "@open-neo-rts/content";
import {
  checkpointHash,
  createMatch,
  createProjection,
  debugSpawnPlacement,
  parseScenario,
  runScenario,
  SCENARIO_FORMAT,
  type Scenario,
  SIM_VERSION,
  step,
  toDefinition,
  toMatchResources,
} from "@open-neo-rts/sim";
import { createCommandLog } from "@open-neo-rts/sim/testing";
import factory from "../../../content/core/factions/eastern-collective/structures/war-factory/structure.json";
import soldier from "../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json";
import reeds from "../../../content/core/props/temperate/reeds/prop.json";
import boulder from "../../../content/core/props/temperate/rock-outcrop/prop.json";
import barrier from "../../../content/core/props/urban/concrete-barrier/prop.json";

/** Owner definitions and a minimal node-binding fixture exercise authoritative static occupancy. */
export function spawnPlacementScenario(): Scenario {
  const terrain = parseTerrain(32, 32, {});
  const log = createCommandLog();
  return {
    format: SCENARIO_FORMAT,
    simVersion: SIM_VERSION,
    setup: {
      seed: 42,
      debug: true,
      forces: [{ index: 1, faction: "faction:eastern-collective" }],
      seats: [1],
      grants: [],
      definitions: [
        ...[factory, boulder, reeds, soldier, barrier].map(toDefinition),
        toDefinition({
          id: "structure:fixture/node",
          health: 100,
          footprint: [2, 2],
          nodeKinds: ["materials", "oil"],
        }),
      ],
      map: {
        id: "map:fixture-spawn-placement",
        terrain: {
          ...terrain,
          level: [...terrain.level],
          ramp: [...terrain.ramp],
          surface: [...terrain.surface],
          water: [...terrain.water],
          biome: [...terrain.biome],
        },
        spawns: [],
        resources: toMatchResources([
          { kind: "ore", position: [16, 16], amount: 100, radius: 2 },
          { kind: "materials", position: [24, 24], amount: 100 },
          { kind: "oil", position: [24.5, 8.5] },
        ]),
        objects: [
          {
            definition: boulder.id,
            position: [10 * 1024, 10 * 1024],
            rotation: 90,
            owner: "neutral",
          },
        ],
      },
    },
    commands: [
      log.spawn(0, 1, factory.id, 1, 4 * 1024, 20 * 1024, 0x4000),
      log.spawn(0, 1, factory.id, 1, 4 * 1024, 20 * 1024, 0x4000),
      log.spawn(0, 1, boulder.id, 1, 20 * 1024, 8 * 1024, 0x8000),
      log.spawn(0, 1, soldier.id, 1, 20 * 1024, 8 * 1024),
      log.spawn(0, 1, soldier.id, 1, 16 * 1024, 16 * 1024),
      log.spawn(0, 1, boulder.id, 1, 16 * 1024, 16 * 1024, 0x4000),
      { tick: 1, sequence: 0, seat: 1, type: "debug.remove", payload: { entity: 2 } },
      log.spawn(2, 1, boulder.id, 1, 20 * 1024, 8 * 1024, 0),
      ...[0, 1, 2, 3].flatMap((r) => [
        log.spawn(3 + r, 1, barrier.id, 1, (4 + 4 * r) * 1024, 4 * 1024, ((r + 1) & 3) * 0x4000),
        log.spawn(
          3 + r,
          1,
          soldier.id,
          1,
          (4 + 4 * r + (r % 2 ? 0 : 1)) * 1024,
          (4 + (r % 2 ? 1 : 0)) * 1024,
        ),
      ]),
      log.spawn(99, 1, reeds.id, 1, 24 * 1024, 24 * 1024, 0x4000),
      log.spawn(10, 1, "structure:fixture/node", 1, 23 * 1024, 23 * 1024, 0x4000),
      log.spawn(10, 1, "structure:fixture/node", 1, 23 * 1024, 7 * 1024, 0x8000),
      log.spawn(10, 1, "structure:fixture/node", 1, 23 * 1024, 23 * 1024, 0x4000),
      log.spawn(10, 1, "structure:fixture/node", 1, 16 * 1024, 16 * 1024, 0x4000),
    ],
  };
}

/** Browser and Bun must agree on outcomes, projection and all canonical checkpoints. */
export function placementProof() {
  const scenario = parseScenario(spawnPlacementScenario());
  const kernel = createMatch(scenario.setup);
  for (let tick = 0; tick < 100; tick++)
    step(
      kernel,
      scenario.commands.filter((command) => command.tick === tick),
    );
  return {
    hashes: runScenario(scenario),
    hash: checkpointHash(kernel),
    results: kernel.log.map((entry) => entry.result),
    snapshot: createProjection(scenario.setup, 1, "debug-no-fog").snapshot(kernel),
    staticRefusal: debugSpawnPlacement(kernel, scenario.setup.definitions, {
      definition: boulder.id,
      force: 1,
      x: 10 * 1024,
      y: 10 * 1024,
      facing: 0x4000,
    }),
  };
}

if (import.meta.main) {
  const scenario = parseScenario(spawnPlacementScenario());
  await Bun.write(
    new URL("./spawn-placement.json", import.meta.url),
    `${JSON.stringify(scenario, null, 2)}\n`,
  );
  await Bun.write(
    new URL("./__golden__/spawn-placement.json", import.meta.url),
    `${JSON.stringify(placementProof(), null, 2)}\n`,
  );
}
