import { expect, test } from "bun:test";
import { defaultSkirmish, rule, validateSkirmish } from "./setup";

test("normal quick-start defaults use the supported match settings and authored opposing spawns", () => {
  const setup = defaultSkirmish();
  expect(validateSkirmish(JSON.parse(JSON.stringify(setup)))).toEqual(setup);
  expect(setup).toMatchObject({
    format: 1,
    seed: 1,
    yourSpawn: "north-west",
    otherSpawn: "south-east",
    startingCredits: rule("startingCredits").default,
    popCap: rule("popCap").default,
    structureCap: rule("structureCap").default,
  });
  expect(
    validateSkirmish({
      ...setup,
      seed: 0xffffffff,
      yourSpawn: "south-west",
      otherSpawn: "north-east",
    }).seed,
  ).toBe(0xffffffff);
});

test("saved or entered setups refuse malformed fields, unsupported additions and invalid spawn/rule combinations", () => {
  const setup = defaultSkirmish();
  for (const input of [
    null,
    [],
    {},
    { ...setup, format: 2 },
    { ...setup, seed: -1 },
    { ...setup, seed: 0x100000000 },
    { ...setup, seed: "1" },
    { ...setup, seed: 0.5 },
    { ...setup, startingCredits: 50001 },
    { ...setup, popCap: 49 },
    { ...setup, structureCap: 401 },
    { ...setup, yourSpawn: setup.otherSpawn },
    { ...setup, otherSpawn: "unknown" },
    { ...setup, bot: "hard" },
    Object.create(setup),
  ])
    expect(() => validateSkirmish(input)).toThrow();
  const saved = validateSkirmish(setup);
  saved.seed = 7;
  expect(setup.seed).toBe(1);
});
