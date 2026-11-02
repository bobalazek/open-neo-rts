import { expect, test } from "bun:test";
import { createMatch, parseScenario, sortCommands, step } from "@open-neo-rts/sim";
import { easternCollectiveTier1Definitions } from "@open-neo-rts/sim/testing";
import golden from "../../scenarios/__golden__/eastern-collective-two-forces.json";
import { scenarioGoldens } from "../../scenarios/check-eastern-collective-two-forces";
import fixture from "../../scenarios/eastern-collective-two-forces.json";
import { easternCollectiveTwoForces } from "../../scenarios/generate-eastern-collective-two-forces";

const scenario = parseScenario(fixture);

test("the committed two-Force scenario reproduces its real tier-1 setup and accepted commands", () => {
  expect(easternCollectiveTwoForces()).toEqual(scenario);
  expect(scenario.setup.definitions).toEqual(easternCollectiveTier1Definitions());
  expect(scenario.setup.forces).toHaveLength(2);
  const kernel = createMatch(scenario.setup);
  const commands = sortCommands(scenario.commands);
  let cursor = 0;
  while (kernel.tick < 10000) {
    const start = cursor;
    while (commands[cursor]?.tick === kernel.tick) cursor++;
    for (const event of step(kernel, commands.slice(start, cursor)))
      expect(event.result).toBe("accepted");
  }
  expect(cursor).toBe(commands.length);
  expect(kernel.world.query()).toHaveLength(14);
});

// Repeated full replays include cold CLI processes on shared CI runners.
test("10,000 ticks match all 100 goldens twice in one process and in two fresh CLI processes", () => {
  expect(golden.map(({ tick }) => tick)).toEqual(
    Array.from({ length: 100 }, (_, i) => (i + 1) * 100),
  );
  expect(scenarioGoldens()).toEqual([golden, golden]);
  const expected = golden.map(({ tick, hash }) => `${tick} ${hash}\n`).join("");
  const path = new URL("../../scenarios/eastern-collective-two-forces.json", import.meta.url)
    .pathname;
  const cwd = new URL("../../../../", import.meta.url).pathname;
  for (let i = 0; i < 2; i++) {
    const result = Bun.spawnSync([process.execPath, "--silent", "neo", "run", path], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe("");
    expect(result.stdout.toString()).toBe(expected);
  }
}, 15_000);
