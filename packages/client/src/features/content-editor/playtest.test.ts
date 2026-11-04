import { expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import { parseTerrain, type TerrainLayers } from "@open-neo-rts/content";
import {
  checkpointHash,
  createMatch,
  createMatchKeyframe,
  createMatchRecord,
  createNormalMatchSetup,
  createProjection,
  parseScenario,
  SCENARIO_FORMAT,
  SIM_VERSION,
  step,
  verifyMatchRecord,
} from "@open-neo-rts/sim";
import { flatMap } from "@open-neo-rts/sim/testing";
import soldier from "../../../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json";
import technician from "../../../../../content/core/factions/eastern-collective/units/field-technician/unit.json";
import resourceMap from "../../../../../content/core/maps/sandbox-resources/map.json";
import trainingMap from "../../../../../content/core/maps/training-grounds/map.json";
import { defaultSkirmish, normalSkirmish } from "../skirmish/setup";
import { prepareDefinitionClone } from "./creation";
import { type EditorFile, readEditorPack } from "./definition-pack";
import { prepareDraftPlaytest } from "./playtest";
import { defaultDraftScenario, draftScenarioSetup } from "./scenarios";

const root = resolve(import.meta.dir, "../../../../../content/core");
async function core() {
  return readEditorPack(
    "core",
    new Map<string, EditorFile>(
      [...new Bun.Glob("**/*").scanSync({ cwd: root, onlyFiles: true })].map((path) => [
        path,
        Bun.file(resolve(root, path)),
      ]),
    ),
  );
}
const path = "factions/eastern-collective/units/dragon-tank/unit.json";

test("draft scenarios preserve normal defaults, authored maps and legal mirrored starting kits", async () => {
  const pack = await core();
  const prepared = await prepareDraftPlaytest([pack], "core", path, pack.input.json.get(path));
  try {
    const catalog = prepared.skirmish.content.catalog!;
    const trainingGrid = parseTerrain(128, 128, {});
    expect(
      draftScenarioSetup(
        defaultDraftScenario(),
        trainingMap,
        trainingGrid,
        catalog,
        prepared.definition,
      ),
    ).toEqual(normalSkirmish(defaultSkirmish(), trainingGrid, catalog));
    const grid = parseTerrain(64, 64, {});
    const config = {
      ...defaultDraftScenario(),
      map: `core.${resourceMap.id}`,
      yourSpawn: "east",
      otherSpawn: "west",
      seed: 77,
      opponent: "draft-mirror" as const,
    };
    const setup = draftScenarioSetup(config, resourceMap, grid, catalog, prepared.definition);
    const kernel = createMatch(setup);
    expect(setup.map.id).toBe("core.map:sandbox-resources");
    expect(setup.map.resources).toHaveLength(resourceMap.resources.length);
    expect(setup.normal!.bots).toEqual([{ seat: 2, kind: "idle" }]);
    expect(setup.debug).toBe(false);
    expect(
      setup.normal!.forces.map(
        (force) => force.start.units.find((unit) => unit.unit === prepared.definition)?.count,
      ),
    ).toEqual([1, 1]);
    step(kernel, []);
    expect(setup.seed).toBe(77);
    const twin = createMatchKeyframe(kernel, setup).restore(setup);
    for (let tick = 0; tick < 20; tick++) {
      step(kernel, []);
      step(twin, []);
    }
    expect(checkpointHash(twin)).toBe(checkpointHash(kernel));
    expect(() =>
      createMatch(
        draftScenarioSetup(
          { ...config, yourSpawn: "west" },
          resourceMap,
          grid,
          catalog,
          prepared.definition,
        ),
      ),
    ).toThrow();
    expect(() =>
      draftScenarioSetup({ ...config, seed: -1 }, resourceMap, grid, catalog, prepared.definition),
    ).toThrow();
    expect(() =>
      draftScenarioSetup(
        config,
        resourceMap,
        grid,
        catalog,
        "core.structure:eastern-collective/command-center",
      ),
    ).toThrow("requires");
    expect(() =>
      draftScenarioSetup(config, trainingMap, trainingGrid, catalog, prepared.definition),
    ).toThrow("Invalid draft scenario");
    const idle = draftScenarioSetup(
      { ...config, opponent: "idle" },
      resourceMap,
      grid,
      catalog,
      prepared.definition,
    );
    expect(
      idle.normal!.forces.every(
        (force) => !force.start.units.some((unit) => unit.unit === prepared.definition),
      ),
    ).toBe(true);
    const repeat = await prepareDraftPlaytest(
      [pack],
      "core",
      path,
      pack.input.json.get(path),
      config,
    );
    try {
      config.seed = 99;
      expect(repeat.skirmish.scenario.seed).toBe(77);
    } finally {
      repeat.dispose();
    }
    for (const [file, raw] of pack.input.json) {
      if (!file.startsWith("maps/") || !file.endsWith("/map.json")) continue;
      const map = raw as typeof trainingMap;
      const folder = file.slice(0, file.lastIndexOf("/") + 1);
      const layers = Object.fromEntries(
        Object.entries(map.layers ?? {}).map(([key, path]) => [
          key,
          pack.input.layers?.get(folder + path),
        ]),
      ) as TerrainLayers;
      const grid = parseTerrain(map.size.width, map.size.height, layers, map.biome);
      const scenario = {
        ...defaultDraftScenario(),
        map: `core.${map.id}`,
        yourSpawn: map.spawns[0]!.id,
        otherSpawn: map.spawns.at(-1)!.id,
      };
      const match = createMatch(
        draftScenarioSetup(scenario, map, grid, catalog, prepared.definition),
      );
      for (let tick = 0; tick < 20; tick++) step(match, []);
      expect(match.tick).toBe(20);
    }
  } finally {
    prepared.dispose();
  }
});

function skirmish(prepared: Awaited<ReturnType<typeof prepareDraftPlaytest>>) {
  return createNormalMatchSetup({
    catalog: prepared.skirmish.content.catalog!,
    seed: 1,
    mapSupport: { start: "faction", players: { min: 2, max: 2 } },
    map: {
      ...flatMap(48),
      resources: [
        { kind: "ore", position: [8 * 1024, 20 * 1024], amount: 30000, radius: 3 * 1024 },
        { kind: "ore", position: [40 * 1024, 30 * 1024], amount: 30000, radius: 3 * 1024 },
      ],
      spawns: [
        { id: "near", position: [12 * 1024, 12 * 1024], facing: 0 },
        { id: "far", position: [34 * 1024, 34 * 1024], facing: 32768 },
      ],
    },
    forces: [0, 1].map((index) => ({
      index,
      faction: "core.faction:eastern-collective",
      team: index,
      spawn: index ? "far" : "near",
    })),
    seats: [1, 2],
    settings: { veterancy: false },
    grants: [0, 1].map((force) => ({
      force,
      seat: force + 1,
      scopes: ["unit.orders", "economy.build", "production.queue", "surrender"],
      grantedAtTick: 0,
    })),
    bots: [{ seat: 2, kind: "basic-skirmish", force: 1 }],
  });
}

test("playtests own validated unsaved definitions and models without changing the source pack", async () => {
  const pack = await core();
  const original = pack.input.json.get(path) as Record<string, unknown>;
  const draft = {
    ...structuredClone(original),
    health: 1901,
    movement: { ...(original.movement as object), speed: 3 },
  };
  const revoke = spyOn(URL, "revokeObjectURL");
  const prepared = await prepareDraftPlaytest([pack], "core", path, draft);
  try {
    const entry = prepared.catalog.find((entry) => entry.definition.id === prepared.definition)!;
    expect(entry.definition.health).toBe(1901);
    expect(entry.definition.speed).toBe(Math.round((3 * 1024) / 20));
    expect(entry.model).toStartWith("blob:");
    const bytes = new Uint8Array(await (await fetch(entry.model!)).arrayBuffer());
    expect(bytes).toEqual(
      new Uint8Array(
        await pack.files.get(path.replace("unit.json", "dragon-tank.glb"))!.arrayBuffer(),
      ),
    );
    expect((pack.input.json.get(path) as { health: number }).health).toBe(900);
    draft.health = 1;
    expect(entry.definition.health).toBe(1901);
    const scenario = parseScenario({
      format: SCENARIO_FORMAT,
      simVersion: SIM_VERSION,
      commands: [],
      setup: {
        debug: true,
        seed: 1,
        seats: [1],
        grants: [],
        forces: [{ index: 0, faction: "core.faction:eastern-collective" }],
        map: {
          id: "core.map:sandbox-flat",
          terrain: {
            width: 32,
            height: 32,
            level: new Array(1024).fill(0),
            ramp: new Array(1024).fill(0),
            surface: new Array(1024).fill(0),
            water: new Array(1024).fill(0),
            biome: new Array(1024).fill(0),
          },
          objects: [],
          spawns: [],
          resources: [],
        },
        definitions: prepared.catalog.map((entry) => entry.definition),
      },
    });
    expect(
      scenario.setup.definitions.find((definition) => definition.id === entry.definition.id)
        ?.health,
    ).toBe(1901);
    prepared.dispose();
    const revoked = revoke.mock.calls.length;
    expect(revoked).toBeGreaterThan(100);
    prepared.dispose();
    expect(revoke.mock.calls).toHaveLength(revoked);
  } finally {
    prepared.dispose();
    revoke.mockRestore();
  }
}, 20000);

test("draft skirmishes use authored edited damage in real normal combat and retain strict setup rules", async () => {
  const pack = await core();
  const draft = structuredClone(soldier);
  draft.health = 1901;
  draft.weapons[0]!.warheads[0]!.amount = 33;
  const prepared = await prepareDraftPlaytest(
    [pack],
    "core",
    "factions/eastern-collective/units/collective-soldier/unit.json",
    draft,
  );
  try {
    expect(prepared.supportsSkirmish).toBe(true);
    const setup = skirmish(prepared);
    expect(setup.debug).toBe(false);
    expect(setup.normal?.bots).toEqual([{ seat: 2, kind: "basic-skirmish", force: 1 }]);
    expect(() => createMatch({ ...setup, debug: true })).toThrow(
      "normal starting kits cannot enable debug",
    );
    const kernel = createMatch(setup);
    const projection = createProjection(setup, 1, "controlled");
    const army = projection
      .snapshot(kernel)
      .entities.filter((entity) => entity.definition === prepared.definition);
    expect(army).toHaveLength(3);
    expect(army.every((entity) => entity.maxHealth === 1901)).toBe(true);
    expect(
      step(kernel, [
        {
          tick: 0,
          seat: 1,
          sequence: 0,
          type: "unit.attackMove",
          payload: {
            entities: army.map((entity) => projection.resolve(entity.handle, "unit.orders")!),
            x: 34 * 1024,
            y: 34 * 1024,
          },
        },
      ])[0]?.result,
    ).toBe("accepted");
    let damage = false;
    for (let i = 0; i < 1000 && !damage && !kernel.victory?.ended; i++) {
      step(kernel, []);
      damage = (kernel.combatEvents ?? []).some(
        (event) => event.type === "damage" && event.amount === 33,
      );
    }
    expect(damage).toBe(true);
    expect(
      step(kernel, [
        { tick: kernel.tick, seat: 1, sequence: 1, type: "match.surrender", payload: { force: 0 } },
      ])[0]?.result,
    ).toBe("accepted");
    expect(verifyMatchRecord(createMatchRecord(kernel, setup)).hash).toBeDefined();
    const asset = prepared.skirmish.assets.find((entry) => entry.id === prepared.definition)!;
    expect((await fetch(asset.icon!)).headers.get("content-type")).toBe("image/png");
    expect((await fetch(asset.sounds!.fire!)).headers.get("content-type")).toBe("audio/ogg");
    expect(
      (
        pack.input.json.get("factions/eastern-collective/units/collective-soldier/unit.json") as {
          health: number;
        }
      ).health,
    ).toBe(100);
  } finally {
    prepared.dispose();
  }
}, 20000);

test("draft recipes charge the edited price and tier-1 clones join only the temporary roster", async () => {
  const pack = await core();
  const draft = { ...structuredClone(technician), cost: { credits: 17 }, buildTime: 1 };
  const prepared = await prepareDraftPlaytest(
    [pack],
    "core",
    "factions/eastern-collective/units/field-technician/unit.json",
    draft,
  );
  try {
    const setup = skirmish(prepared),
      kernel = createMatch(setup),
      projection = createProjection(setup, 1, "controlled");
    const initial = projection.snapshot(kernel);
    const headquarters = initial.entities.find((entity) =>
      entity.definition.endsWith("/command-center"),
    )!;
    expect(
      step(kernel, [
        {
          tick: 0,
          seat: 1,
          sequence: 0,
          type: "production.enqueue",
          payload: {
            entity: projection.resolve(headquarters.handle, "production.queue")!,
            definition: prepared.definition,
          },
        },
      ])[0]?.result,
    ).toBe("accepted");
    expect(kernel.economy?.balance(0)?.credits).toBe(4983);
    for (let i = 0; i < 25; i++) step(kernel, []);
    expect(
      projection.snapshot(kernel).entities.find((entity) => entity.handle === headquarters.handle)
        ?.production?.queue[0],
    ).toMatchObject({ state: "exit", completedTicks: 20, totalTicks: 20 });
    expect(
      projection
        .snapshot(kernel)
        .entities.filter((entity) => entity.definition === prepared.definition),
    ).toHaveLength(2);
    const blockers = projection
      .snapshot(kernel)
      .entities.filter((entity) => entity.definition.endsWith("/collective-soldier"));
    expect(
      step(kernel, [
        {
          tick: kernel.tick,
          seat: 1,
          sequence: 1,
          type: "unit.move",
          payload: {
            entities: blockers.map((entity) => projection.resolve(entity.handle, "unit.orders")!),
            x: 20 * 1024,
            y: 18 * 1024,
          },
        },
      ])[0]?.result,
    ).toBe("accepted");
    for (
      let i = 0;
      i < 80 &&
      projection
        .snapshot(kernel)
        .entities.filter((entity) => entity.definition === prepared.definition).length < 3;
      i++
    )
      step(kernel, []);
    expect(
      projection
        .snapshot(kernel)
        .entities.filter((entity) => entity.definition === prepared.definition),
    ).toHaveLength(3);
  } finally {
    prepared.dispose();
  }
  const clone = await prepareDefinitionClone(
    [pack],
    "core",
    "factions/eastern-collective/units/collective-soldier/unit.json",
    "test-rifle",
    "Test Rifle",
  );
  const copied = await prepareDraftPlaytest([clone.candidate], "core", clone.path, clone.draft);
  try {
    expect(copied.supportsSkirmish).toBe(true);
    expect(copied.skirmish.roster.has("core.unit:eastern-collective/test-rifle")).toBe(true);
    expect(
      copied.skirmish.content.catalog!.definitions.find((entry) =>
        entry.id.endsWith("/barracks-complex"),
      )!.produces,
    ).toContain("core.unit:eastern-collective/test-rifle");
    expect(pack.input.files).not.toContain(clone.path);
  } finally {
    copied.dispose();
  }
}, 20000);

test("invalid drafts create no asset URLs and suitable water/node maps use authored terrain", async () => {
  const pack = await core();
  const create = spyOn(URL, "createObjectURL");
  try {
    const original = pack.input.json.get(path) as object;
    await expect(
      prepareDraftPlaytest([pack], "core", path, { ...original, health: -1 }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    for (const [file, map] of [
      ["factions/eastern-collective/structures/shipyard/structure.json", "core.map:sandbox-water"],
      ["neutral/structures/resource-extractor/structure.json", "core.map:sandbox-resources"],
    ] as const) {
      const prepared = await prepareDraftPlaytest([pack], "core", file, pack.input.json.get(file));
      try {
        expect(prepared.initial.map).toBe(map);
      } finally {
        prepared.dispose();
      }
    }
  } finally {
    create.mockRestore();
  }
}, 20000);
