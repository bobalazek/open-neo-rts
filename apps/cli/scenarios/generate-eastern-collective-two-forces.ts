import { parseScenario, runScenario, type Scenario, SIM_VERSION } from "@open-neo-rts/sim";
import { createCommandLog, easternCollectiveTier1Definitions } from "@open-neo-rts/sim/testing";

/** Hand-authored flat-world movement script; no combat or terrain in phase 1a. */
export function easternCollectiveTwoForces(): Scenario {
  const definitions = easternCollectiveTier1Definitions();
  const log = createCommandLog();
  const first = [1, 2, 3, 4, 5, 6, 7];
  const second = [8, 9, 10, 11, 12, 13, 14];
  return {
    format: 1,
    simVersion: SIM_VERSION,
    setup: {
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
      ...definitions.map(({ id }, i) => log.spawn(0, 0, id, 0, 20000, 200000 + i * 1024, 0x8000)),
      ...definitions.map(({ id }, i) => log.spawn(0, 0, id, 1, 380000, 200000 - i * 1024, 0)),
      log.move(1, 1, first, 380000, 300000),
      log.move(1, 2, second, 20000, 100000),
      log.stop(1250, 1, [3, 1, 2]),
      log.stop(1250, 2, [14, 12, 13]),
      log.move(1260, 1, [3, 1, 2], 380000, 300000),
      log.move(1260, 2, [14, 12, 13], 20000, 100000),
      log.move(2500, 1, first, 100000, 380000),
      log.move(2500, 2, second, 300000, 20000),
      log.stop(4999, 1, first),
      log.stop(4999, 2, second),
      log.move(5000, 1, first, 20000, 100000),
      log.move(5000, 2, second, 380000, 300000),
      log.move(7500, 1, first, 300000, 20000),
      log.move(7500, 2, second, 100000, 380000),
      // The last command makes the default CLI run exactly 10,000 steps.
      log.stop(9999, 1, first),
      log.stop(9999, 2, second),
    ],
  };
}

if (import.meta.main) {
  const scenario = parseScenario(easternCollectiveTwoForces());
  await Bun.write(
    new URL("./eastern-collective-two-forces.json", import.meta.url),
    `${JSON.stringify(scenario, null, 2)}\n`,
  );
  await Bun.write(
    new URL("./__golden__/eastern-collective-two-forces.json", import.meta.url),
    `${JSON.stringify(runScenario(scenario), null, 2)}\n`,
  );
}
