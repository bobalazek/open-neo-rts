import { strict as assert } from "node:assert";
import {
  createMatch,
  MoveIntent,
  parseScenario,
  runScenario,
  SCENARIO_FORMAT,
  type Scenario,
  SIM_VERSION,
  step,
  Template,
  Transform,
} from "@open-neo-rts/sim";
import {
  createCommandLog,
  easternCollectiveTier1Definitions,
  terrainMap,
} from "@open-neo-rts/sim/testing";

/** Current-version map movement script over the original tier-1 movement profiles. */
export function easternCollectiveTwoForces(): Scenario {
  const definitions = easternCollectiveTier1Definitions();
  const log = createCommandLog();
  const first = [1, 2, 3, 4, 5, 6, 7];
  const second = [8, 9, 10, 11, 12, 13, 14];
  return {
    format: SCENARIO_FORMAT,
    simVersion: SIM_VERSION,
    setup: {
      map: {
        ...terrainMap(),
        spawns: [{ id: "west", position: [1536, 3584], facing: 0x8000 }],
        objects: [
          {
            definition: "unit:eastern-collective/collective-soldier",
            position: [1024, 1024],
            rotation: 90,
            owner: "west",
          },
        ],
      },
      seed: 0x12345678,
      debug: true,
      forces: [
        { index: 0, faction: "faction:eastern-collective" },
        { index: 1, faction: "faction:eastern-collective" },
      ],
      seats: [1, 2],
      grants: [
        { seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
        { seat: 2, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
      ],
      definitions,
    },
    commands: [
      ...definitions.map(({ id }, i) => log.spawn(0, 0, id, 0, 1536, 3584 + i * 16, 0x8000)),
      ...definitions.map(({ id }, i) => log.spawn(0, 0, id, 1, 6656, 1536 + i * 16, 0)),
      log.move(1, 1, first, 5937, 4687),
      log.move(1, 2, second, 312, 1562),
      log.stop(1250, 1, [3, 1, 2]),
      log.stop(1250, 2, [14, 12, 13]),
      log.move(1260, 1, [3, 1, 2], 5937, 4687),
      log.move(1260, 2, [14, 12, 13], 312, 1562),
      log.move(2500, 1, first, 1562, 5937),
      log.move(2500, 2, second, 4687, 312),
      log.stop(4999, 1, first),
      log.stop(4999, 2, second),
      log.move(5000, 1, first, 312, 1562),
      log.move(5000, 2, second, 5937, 4687),
      log.move(7500, 1, first, 4687, 312),
      log.move(7500, 2, second, 1562, 5937),
      // The last command makes the default CLI run exactly 10,000 steps.
      log.stop(9999, 1, first),
      log.stop(9999, 2, second),
    ],
  };
}

if (import.meta.main) {
  const scenario = parseScenario(easternCollectiveTwoForces());
  const kernel = createMatch(scenario.setup);
  step(
    kernel,
    scenario.commands.filter((command) => command.tick === 0),
  );
  const ids = kernel.world.query(Template);
  assert.equal(ids.length, scenario.setup.definitions.length * 2);
  const before = ids.map((id) => [
    kernel.world.get(id, Transform, "x"),
    kernel.world.get(id, Transform, "y"),
  ]);
  step(
    kernel,
    scenario.commands.filter((command) => command.tick === 1),
  );
  assert(kernel.log.every((entry) => entry.result === "accepted"));
  assert.equal(kernel.world.query(MoveIntent).length, ids.length);
  assert(
    ids.every(
      (id, index) =>
        kernel.world.get(id, Transform, "x") !== before[index]?.[0] ||
        kernel.world.get(id, Transform, "y") !== before[index]?.[1],
    ),
    "Every original roster unit must start moving",
  );
  await Bun.write(
    new URL("./eastern-collective-two-forces.json", import.meta.url),
    `${JSON.stringify(scenario, null, 2)}\n`,
  );
  await Bun.write(
    new URL("./__golden__/eastern-collective-two-forces.json", import.meta.url),
    `${JSON.stringify(runScenario(scenario), null, 2)}\n`,
  );
}
