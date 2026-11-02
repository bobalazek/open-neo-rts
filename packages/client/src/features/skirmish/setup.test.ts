import { expect, test } from "bun:test";
import { parseTerrain, resolvePacks } from "@open-neo-rts/content";
import { checkpointHash, compileGameplayCatalog, createMatch, step } from "@open-neo-rts/sim";
import { defaultSkirmish, map, normalSkirmish, rule, validateSkirmish } from "./setup";

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

test("normal defaults activate the real core bot opponent and grant both controllers surrender", async () => {
  const root = new URL("../../../../../content/core/", import.meta.url);
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*").scan({ cwd: root.pathname, onlyFiles: true }))
    files.push(file);
  files.sort();
  const json = new Map<string, unknown>(),
    bytes = new Map<string, Uint8Array>();
  for (const file of files) {
    const source = Bun.file(new URL(file, root));
    if (file.endsWith(".json")) json.set(file, await source.json());
    else if (!file.includes("/source/") && !file.endsWith(".gitkeep"))
      bytes.set(`core/${file}`, new Uint8Array(await source.arrayBuffer()));
  }
  const catalog = compileGameplayCatalog(
    resolvePacks([{ id: "core", files, json }], "0.1.0", { bytes }),
  );
  const grid = parseTerrain(
    map.size.width,
    map.size.height,
    {
      height: bytes.get(`core/maps/training-grounds/${map.layers.height}`),
      ramps: bytes.get(`core/maps/training-grounds/${map.layers.ramps}`),
    },
    map.biome,
  );
  const setup = normalSkirmish(defaultSkirmish(), grid, catalog);
  expect(setup.debug).toBe(false);
  expect(setup.normal?.bots).toEqual([{ seat: 2, kind: "basic-skirmish", force: 1 }]);
  expect(setup.normal?.gameplayHash).toBe(catalog.gameplayHash);
  expect(setup.map.terrain.level).toEqual([...grid.level]);
  expect(
    setup.grants.map((grant) => [grant.seat, grant.force, grant.scopes.includes("surrender")]),
  ).toEqual([
    [1, 0, true],
    [2, 1, true],
  ]);
  const alternate = normalSkirmish(
    { ...defaultSkirmish(), seed: 42, yourSpawn: "south-east", otherSpawn: "north-west" },
    grid,
    catalog,
  );
  expect(alternate.normal?.bots).toEqual(setup.normal?.bots);
  expect(alternate.normal?.forces.find((force) => force.index === 1)?.spawn).toBe("north-west");
  const kernel = createMatch(setup);
  expect(kernel.bots?.hasSeat(1)).toBe(false);
  expect(kernel.bots?.hasSeat(2)).toBe(true);
  step(kernel, []);
  expect(kernel.bots?.serialize().bots[0]?.state.memory).toBeDefined();
  expect(kernel.queued.length).toBeGreaterThan(0);
  expect(
    step(kernel, [
      { tick: kernel.tick, sequence: 0, seat: 1, type: "match.surrender", payload: { force: 0 } },
    ]).some((entry) => entry.source === "input" && entry.result === "accepted"),
  ).toBe(true);
  expect(kernel.victory?.snapshot().result).toMatchObject({ winner: 1, reason: "lastManStanding" });
  expect(kernel.checkpoints.at(-1)?.hash).toBe(checkpointHash(kernel));
}, 15000);
