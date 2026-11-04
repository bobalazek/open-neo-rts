import { expect, test } from "bun:test";
import { type PackInput, resolvePacks, schemaRef } from "@open-neo-rts/content";
import faction from "../../../../../content/core/factions/eastern-collective/faction.json";
import antiAir from "../../../../../content/core/factions/eastern-collective/structures/anti-air-complex/structure.json";
import barracks from "../../../../../content/core/factions/eastern-collective/structures/barracks-complex/structure.json";
import headquarters from "../../../../../content/core/factions/eastern-collective/structures/command-center/structure.json";
import wall from "../../../../../content/core/factions/eastern-collective/structures/fortress-wall/structure.json";
import reactor from "../../../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json";
import depot from "../../../../../content/core/factions/eastern-collective/structures/supply-depot/structure.json";
import factory from "../../../../../content/core/factions/eastern-collective/structures/war-factory/structure.json";
import soldier from "../../../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json";
import tank from "../../../../../content/core/factions/eastern-collective/units/dragon-tank/unit.json";
import hunter from "../../../../../content/core/factions/eastern-collective/units/drone-hunter/unit.json";
import builder from "../../../../../content/core/factions/eastern-collective/units/field-technician/unit.json";
import apc from "../../../../../content/core/factions/eastern-collective/units/metamorphic-apc/unit.json";
import rocket from "../../../../../content/core/factions/eastern-collective/units/rocket-trooper/unit.json";
import truck from "../../../../../content/core/factions/eastern-collective/units/supply-truck/unit.json";
import extractor from "../../../../../content/core/neutral/structures/resource-extractor/structure.json";
import { compileGameplayCatalog } from "./content";
import { definitionSchema, toDefinition } from "./definitions";

type Data = Record<string, unknown>;
const roster = [
  faction,
  antiAir,
  barracks,
  headquarters,
  wall,
  reactor,
  depot,
  factory,
  soldier,
  tank,
  hunter,
  builder,
  apc,
  rocket,
  truck,
  extractor,
];

/** Definition identity uses placeholder presentation bytes; asset validation is outside this test. */
function pack(
  id = "core",
  definitions: readonly Data[] = roster,
  dependencies: Record<string, string> = {},
): PackInput {
  const json = new Map<string, unknown>();
  const files: Record<string, string[]> = {};
  const layers = new Map<string, Uint8Array>();
  for (const definition of definitions) {
    const [kind, local] = (definition.id as string).split(":") as [string, string];
    const [owner, name] = local.split("/");
    const group = kind === "faction" ? "factions" : `${kind}s`;
    const file =
      kind === "faction"
        ? `factions/${owner}/faction.json`
        : owner === "neutral"
          ? `neutral/structures/${name}/structure.json`
          : `factions/${owner}/${group}/${name}/${kind}.json`;
    files[group] ??= [];
    files[group].push(file);
    const copy = structuredClone(definition);
    copy.$schema = schemaRef(file, kind as "unit" | "structure" | "faction");
    json.set(file, copy);
    const presentation = copy.presentation as Data | undefined;
    for (const asset of [
      presentation?.model,
      presentation?.icon,
      presentation?.wreck,
      ...Object.values((presentation?.sounds ?? {}) as Data),
    ]) {
      if (typeof asset === "string")
        layers.set(file.slice(0, file.lastIndexOf("/") + 1) + asset, new Uint8Array([1]));
    }
  }
  json.set("manifest.json", {
    $schema: schemaRef("manifest.json", "manifest"),
    id,
    version: "0.1.0",
    engine: ">=0.1.0",
    name: "Fixture",
    description: "Gameplay compilation fixture.",
    dependencies,
    files,
  });
  return { id, json, files: [...json.keys(), ...layers.keys()], layers };
}

const unitId = (name: string) => `core.unit:eastern-collective/${name}`;
const structureId = (name: string) => `core.structure:eastern-collective/${name}`;

test("Force production Surge requires explicit scope and a single bounded supported effect", () => {
  const ability = {
    ...headquarters.abilities[0]!,
    effects: headquarters.abilities[0]!.effects.map((effect) => {
      const { scope: _scope, ...unscoped } = effect;
      return unscoped;
    }),
  };
  const compile = (value: Data) =>
    compileGameplayCatalog(
      resolvePacks(
        [
          pack(
            "core",
            roster.map((definition) =>
              definition === headquarters
                ? {
                    ...headquarters,
                    abilities: [value],
                    productionReward: { resource: "industrial-capacity", amount: 1, cap: 100 },
                  }
                : definition,
            ),
          ),
        ],
        "0.1.0",
      ),
    ).definitions.find((definition) => definition.id === structureId("command-center"));
  expect(compile(ability)?.productionSurge).toBeUndefined();
  const effect = { ...ability.effects[0], scope: "force" };
  const supported = { ...ability, effects: [effect] };
  expect(compile(supported)).toMatchObject({
    productionSurge: {
      id: "production-surge",
      perMille: 1500,
      durationTicks: 400,
      cooldownTicks: 2400,
      cost: { "industrial-capacity": 20 },
    },
    productionReward: { resource: "industrial-capacity", amount: 1, cap: 100 },
  });
  for (const invalid of [
    { ...supported, target: "point" },
    { ...supported, effects: [effect, effect] },
    { ...supported, effects: [{ ...effect, percent: 201 }] },
    { ...supported, effects: [{ ...effect, duration: 0 }] },
    { ...supported, effects: [{ ...effect, amount: 1 }] },
    { ...supported, autoCast: true },
  ])
    expect(() => compile(invalid)).toThrow();
  const issues: { path: string; message: string }[] = [];
  definitionSchema.check(
    {
      id: "structure:fixture/producer",
      health: 100,
      speed: 0,
      turnRate: 0,
      footprint: [1, 1],
      power: 20,
      productionReward: { resource: "power", amount: 1, cap: 100 },
    },
    "$",
    issues,
  );
  expect(issues.length).toBeGreaterThan(0);
});

test("authored deployed passenger fire compiles as a bounded transport capability", () => {
  const edited = roster.map((definition) =>
    definition === apc
      ? { ...apc, transport: { ...apc.transport, fireWhileDeployed: true } }
      : definition,
  );
  const resolved = resolvePacks([pack("core", edited)], "0.1.0");
  const before = JSON.stringify([...resolved.definitions]);
  const unit = compileGameplayCatalog(resolved).definitions.find(
    (definition) => definition.id === unitId("metamorphic-apc"),
  );
  expect(unit).toMatchObject({
    transportSlots: 5,
    transportFireWhileDeployed: true,
    deployMode: { id: "bunker-mode", armorPerMille: 1500 },
  });
  expect(JSON.stringify([...resolved.definitions])).toBe(before);
  expect(
    compileGameplayCatalog(resolvePacks([pack()], "0.1.0")).definitions.find(
      (definition) => definition.id === unitId("metamorphic-apc"),
    )?.transportFireWhileDeployed,
  ).toBe(true);
  expect(() =>
    compileGameplayCatalog(
      resolvePacks(
        [pack("core", [factory, { ...apc, transport: { slots: 5, fireWhileDeployed: "yes" } }])],
        "0.1.0",
      ),
    ),
  ).toThrow();
  for (const raw of [
    { ...apc, abilities: [], transport: { slots: 5, fireWhileDeployed: true } },
    {
      ...apc,
      movement: { ...apc.movement, domain: "naval" },
      transport: { slots: 5, fireWhileDeployed: true },
    },
  ])
    expect(() =>
      compileGameplayCatalog(resolvePacks([pack("core", [factory, raw])], "0.1.0")),
    ).toThrow("deployed passenger fire requires a ground transport with a deploy mode");
});

test("self-deploy effects compile without changing the authored ability or base weapon", () => {
  const ability = {
    ...tank.abilities[0],
    effects: [
      { type: "modifyStat", stat: "range", amount: 3 },
      { type: "modifyStat", stat: "damage", percent: 125 },
      { type: "modifyStat", stat: "mobile", percent: 0 },
    ],
  };
  const compile = (effects = ability.effects) =>
    compileGameplayCatalog(
      resolvePacks(
        [pack("core", [factory, { ...tank, abilities: [{ ...ability, effects }] }])],
        "0.1.0",
      ),
    ).definitions.find((definition) => definition.id === unitId("dragon-tank"));
  const before = JSON.stringify(ability);
  const definition = compile();
  expect(definition?.deployMode).toEqual({
    id: "siege-mode",
    cooldownTicks: 60,
    damagePerMille: 1250,
    armorPerMille: 1000,
    rangePerMille: 1000,
    rangeBonusSubcells: 3072,
    cost: {},
  });
  expect(definition?.abilities[0]?.name).toBe(ability.name);
  expect(definition?.weapons[0]?.rangeSubcells).toEqual([0, 7168]);
  expect(JSON.stringify(ability)).toBe(before);
  expect(() =>
    compile([...ability.effects, { type: "modifyStat", stat: "speed", percent: 50 }]),
  ).toThrow();
  expect(() =>
    compile([...ability.effects, { type: "modifyStat", stat: "damage", percent: 150 }]),
  ).toThrow();
});

test("authored paid builder repair compiles into bounded integer match metadata without activating roster defaults", () => {
  const repair = {
    targets: { structures: true, roles: ["power"], tags: ["power"] },
    rate: 10,
    costPercent: 25,
    range: 0,
  };
  const compiled = compileGameplayCatalog(
    resolvePacks(
      [
        pack(
          "core",
          roster.map((definition) =>
            definition === builder ? { ...builder, repair } : definition,
          ),
        ),
      ],
      "0.1.0",
    ),
  );
  const unit = compiled.definitions.find(
    (definition) => definition.id === unitId("field-technician"),
  );
  if (!unit) throw new Error("Missing authored builder");
  expect(unit.repair).toEqual({
    targets: { families: [], roles: ["power"], tags: ["power"], structures: true },
    rateMilliHealthPerSecond: 10_000,
    costPerMille: 250,
    rangeSubcells: 0,
  });
  const base = toDefinition(builder);
  expect(base.repair).toBeUndefined();
  for (const metadata of [
    unit.repair,
    { ...unit.repair, rateMilliHealthPerSecond: -1 },
    { ...unit.repair, rateMilliHealthPerSecond: 1_000_001 },
    { ...unit.repair, costPerMille: 1001 },
    { ...unit.repair, rangeSubcells: 0.5 },
    { ...unit.repair, extra: true },
  ]) {
    const issues: import("@open-neo-rts/content").Issue[] = [];
    definitionSchema.check({ ...base, repair: metadata }, "$", issues);
    expect(issues.length === 0).toBe(metadata === unit.repair);
  }
});

test("compiles the authored tier-1 roster once without changing frozen human-unit data", () => {
  const resolved = resolvePacks([pack()], "0.1.0");
  const before = JSON.stringify([...resolved.definitions]);
  const compiled = compileGameplayCatalog(resolved);
  const definitions = new Map(compiled.definitions.map((d) => [d.id, d]));
  const dragon = definitions.get(unitId("dragon-tank"));
  expect(definitions.get(unitId("field-technician"))?.repair).toEqual({
    targets: { families: [], roles: [], tags: [], structures: true },
    rateMilliHealthPerSecond: 10_000,
    costPerMille: 250,
    rangeSubcells: 0,
    automatic: false,
  });
  expect(definitions.get(unitId("supply-truck"))).toMatchObject({
    harvestCapacity: 500,
    harvestAmountPerSecond: 5,
    construction: { cost: { credits: 1300 }, buildTicks: 300 },
  });
  expect(compiled.gameplayHash).toBe(resolved.gameplayHash);
  expect(compiled.definitions).toHaveLength(15);
  expect(compiled.definitions.map((d) => d.id)).toEqual([...definitions.keys()].sort());
  expect(dragon).toMatchObject({
    ...toDefinition({ ...tank, id: unitId("dragon-tank") }),
    visionSubcells: 8192,
    pop: 3,
    construction: { cost: { credits: 1000, materials: 100 }, buildTicks: 300 },
    turretTurnAnglePerTick: 728,
    producedBy: [structureId("war-factory")],
    weapons: [
      {
        rangeSubcells: [0, 7168],
        reloadTicks: 60,
        scatterSubcells: 205,
        projectile: {
          kind: "bullet",
          speedSubcellsPerTick: 1024,
          blockedBy: ["terrain", "structures"],
        },
        warheads: [
          {
            type: "damage",
            amount: 90,
            versusPerMille: { default: 1000, infantry: 300, aircraft: 0, structure: 800 },
          },
          { type: "damage", amount: 15, radiusSubcells: 512, falloffPerMille: [1000, 500] },
        ],
      },
    ],
    abilities: [
      {
        id: "siege-mode",
        cooldownTicks: 60,
        effects: [
          { type: "modifyStat", stat: "range", amount: { value: 3072, unit: "subcells" } },
          { type: "modifyStat", stat: "damage", perMille: 1250 },
          { type: "modifyStat", stat: "mobile", perMille: 0 },
        ],
      },
    ],
  });
  expect(definitions.get(structureId("command-center"))).toMatchObject({
    productionReward: { resource: "industrial-capacity", amount: 1, cap: 100 },
    productionSurge: {
      id: "production-surge",
      perMille: 1500,
      durationTicks: 400,
      cooldownTicks: 2400,
      cost: { "industrial-capacity": 20 },
    },
    construction: null,
    power: 20,
    produces: [unitId("field-technician")],
    exits: [{ side: "south", cell: [1, 2] }],
    abilities: [
      {
        cooldownTicks: 2400,
        cost: { "industrial-capacity": 20 },
        effects: [{ durationTicks: 400, perMille: 1500 }],
      },
    ],
  });
  for (const name of ["command-center", "barracks-complex", "war-factory"])
    expect(definitions.get(structureId(name))?.productionReward).toEqual({
      resource: "industrial-capacity",
      amount: 1,
      cap: 100,
    });
  expect(definitions.get(structureId("supply-depot"))?.productionReward).toBeUndefined();
  expect(definitions.get("core.structure:neutral/resource-extractor")).toMatchObject({
    construction: { cost: { credits: 800 }, buildTicks: 400 },
    extraction: {
      materials: { resource: "materials", amountPerSecond: 1 },
      oil: { resource: "credits", amountPerSecond: 2 },
    },
  });
  expect(definitions.get(unitId("field-technician"))?.builds).toEqual(
    [
      "anti-air-complex",
      "barracks-complex",
      "fortress-wall",
      "industrial-reactor",
      "supply-depot",
      "war-factory",
    ]
      .map(structureId)
      .concat("core.structure:neutral/resource-extractor"),
  );
  expect(definitions.get(structureId("barracks-complex"))).toMatchObject({
    produces: ["collective-soldier", "drone-hunter", "rocket-trooper"].map(unitId),
    productionSlots: 2,
    exits: [
      { side: "south", cell: [0, 1] },
      { side: "south", cell: [2, 1] },
    ],
  });
  expect(definitions.get(structureId("war-factory"))).toMatchObject({
    produces: ["dragon-tank", "metamorphic-apc", "supply-truck"].map(unitId),
    exits: [{ side: "south", cell: [1, 2] }],
  });
  expect(definitions.get(structureId("supply-depot"))).toMatchObject({
    dock: true,
    spawnsWith: [unitId("supply-truck")],
    exits: [{ side: "south", cell: [1, 2] }],
  });
  for (const name of ["command-center", "supply-depot", "war-factory"])
    expect(definitions.get(structureId(name))?.productionSlots ?? 1).toBe(1);
  for (const definition of compiled.definitions)
    for (const id of [...definition.produces, ...definition.spawnsWith]) {
      expect(definitions.get(id)).toMatchObject({ kind: "unit" });
      expect(definitions.get(id)?.pop).toBeGreaterThanOrEqual(0);
      expect(definitions.get(id)?.radiusSubcells).toBeGreaterThan(0);
    }
  expect(definitions.get(structureId("industrial-reactor"))?.adjacency).toEqual([
    { tags: ["power"], radiusSubcells: 1024, stat: "power", perMille: 1100, maxSources: 3 },
  ]);
  expect(definitions.get(structureId("industrial-reactor"))?.powerAdjacency).toEqual([
    { tags: ["power"], radiusSubcells: 1024, perMille: 1100, maxSources: 3 },
  ]);
  expect(definitions.get(unitId("rocket-trooper"))?.weapons[0]?.projectile).toMatchObject({
    speedSubcellsPerTick: 717,
    turnAnglePerTick: 1092,
    flightTicks: 40,
    interceptable: true,
  });
  expect(definitions.get(unitId("metamorphic-apc"))?.transportSlots).toBe(5);
  expect(definitions.get(unitId("metamorphic-apc"))?.transportFireWhileDeployed).toBe(true);
  expect(dragon?.deployMode).toMatchObject({
    id: "siege-mode",
    cooldownTicks: 60,
    rangeBonusSubcells: 3072,
    damagePerMille: 1250,
  });
  expect(definitions.get(unitId("metamorphic-apc"))?.deployMode).toMatchObject({
    id: "bunker-mode",
    cooldownTicks: 60,
    armorPerMille: 1500,
  });
  expect(definitions.get(unitId("supply-truck"))?.harvestCapacity).toBe(500);
  // Compilation does not settle whether a ground-only weapon may attack structures.
  expect(definitions.get(unitId("collective-soldier"))?.weapons[0]?.targets).toEqual(["ground"]);
  expect(compiled.factions[0]?.start).toEqual({
    structures: [structureId("command-center")],
    units: [
      { unit: unitId("field-technician"), count: 2 },
      { unit: unitId("supply-truck"), count: 1 },
      { unit: unitId("collective-soldier"), count: 3 },
    ],
    resources: { credits: 5000 },
  });
  const checkIntegers = (value: unknown): void => {
    if (typeof value === "number") expect(Number.isInteger(value)).toBe(true);
    else if (Array.isArray(value)) for (const child of value) checkIntegers(child);
    else if (value && typeof value === "object")
      for (const child of Object.values(value)) checkIntegers(child);
  };
  checkIntegers(compiled);
  expect(JSON.stringify([...resolved.definitions])).toBe(before);
  expect(Object.isFrozen(resolved.definitions.get(unitId("dragon-tank")))).toBe(true);
});

test("reference qualification follows local, transitive and present optional dependency precedence", () => {
  const base = pack("base", [factory]);
  const middle = pack("middle", [], { base: "^0.1.0" });
  const local = pack("local", [tank, factory], { middle: "^0.1.0" });
  const optional = pack("optional", [rocket], { middle: "^0.1.0" });
  const manifest = optional.json.get("manifest.json") as Data;
  manifest.dependencies = {};
  manifest.optionalDependencies = { local: "^0.1.0" };
  (
    optional.json.get("factions/eastern-collective/units/rocket-trooper/unit.json") as Data
  ).producedBy = ["base.structure:eastern-collective/war-factory"];
  const resolved = resolvePacks([optional, local, base, middle], "0.1.0");
  expect(resolved.referenceScopes.get("optional")).toEqual(["optional", "local", "middle", "base"]);
  const compiled = compileGameplayCatalog(resolved);
  expect(
    compiled.definitions.find((d) => d.id === "local.unit:eastern-collective/dragon-tank")
      ?.producedBy,
  ).toEqual(["local.structure:eastern-collective/war-factory"]);
  expect(
    compiled.definitions.find((d) => d.id === "optional.unit:eastern-collective/rocket-trooper")
      ?.producedBy,
  ).toEqual(["base.structure:eastern-collective/war-factory"]);
  const ref = optional.json.get(
    "factions/eastern-collective/units/rocket-trooper/unit.json",
  ) as Data;
  ref.producedBy = ["structure:eastern-collective/war-factory"];
  const withoutLocalFactory = pack("local", [tank], { middle: "^0.1.0" });
  expect(
    compileGameplayCatalog(
      resolvePacks([base, middle, withoutLocalFactory, optional], "0.1.0"),
    ).definitions.find((d) => d.id === "local.unit:eastern-collective/dragon-tank")?.producedBy,
  ).toEqual(["base.structure:eastern-collective/war-factory"]);
});

test("missing construction stays unavailable; partial recipes, unsafe quantities and inverted ranges fail", () => {
  for (const partial of [
    { ...factory, buildTime: undefined },
    { ...factory, cost: undefined },
  ]) {
    const clean = JSON.parse(JSON.stringify(partial));
    expect(() => compileGameplayCatalog(resolvePacks([pack("core", [clean])], "0.1.0"))).toThrow(
      "construction requires both cost and buildTime",
    );
  }
  expect(() =>
    compileGameplayCatalog(
      resolvePacks([pack("core", [{ ...factory, cost: { credits: 0x80000000 } }])], "0.1.0"),
    ),
  ).toThrow(RangeError);
  expect(() =>
    compileGameplayCatalog(
      resolvePacks(
        [pack("core", [factory, { ...tank, weapons: [{ ...tank.weapons[0], range: [7, 2] }] }])],
        "0.1.0",
      ),
    ),
  ).toThrow("inverted range");
});

test("preserves research, fractional rates, burn units and ordered timed effects without inventing missing durations", () => {
  const raw = {
    ...factory,
    repair: {
      targets: { families: ["vehicle"], structures: true },
      rate: 0.25,
      range: 1.5,
      costPercent: 25,
      automatic: false,
    },
    research: [
      {
        id: "fixture-upgrade",
        name: "Fixture upgrade",
        description: "Test only.",
        cost: { credits: 123 },
        researchTime: 1.25,
        requires: [factory.id],
        effects: [
          { type: "modifyStat", stat: "speed", amount: 1.5, target: { tags: ["vehicle"] } },
          { type: "modifyStat", stat: "reload", amount: 0.25, duration: 1.5 },
          { type: "modifyStat", stat: "range", amount: 0.5 },
          { type: "damageArea", amount: 20, radius: 2 },
          { type: "spawn", unit: tank.id },
        ],
      },
    ],
  };
  const armed = {
    ...tank,
    weapons: [
      {
        ...tank.weapons[0],
        burst: { count: 3, delay: 0.25 },
        arc: 90,
        projectile: { kind: "grenade", speed: 1.5, gravity: 0.75, fuse: 1.25 },
        warheads: [
          { type: "burn", amount: 5, duration: 2.5, delay: 0.25 },
          { type: "slow", percent: 25 },
          { type: "spawn", unit: tank.id, count: 1 },
        ],
      },
    ],
  };
  const compiled = compileGameplayCatalog(resolvePacks([pack("core", [raw, armed])], "0.1.0"));
  const upgrade = compiled.definitions.find((d) => d.id === structureId("war-factory"));
  expect(upgrade?.repair).toEqual({
    targets: { families: ["vehicle"], roles: [], tags: [], structures: true },
    rateMilliHealthPerSecond: 250,
    rangeSubcells: 1536,
    costPerMille: 250,
    automatic: false,
  });
  expect(upgrade?.research).toEqual([
    {
      id: "fixture-upgrade",
      cost: { credits: 123 },
      researchTicks: 25,
      requires: [structureId("war-factory")],
      effects: [
        {
          type: "modifyStat",
          stat: "speed",
          amount: { value: 77, unit: "subcells-per-tick" },
          target: { tags: ["vehicle"] },
        },
        {
          type: "modifyStat",
          stat: "reload",
          amount: { value: 5, unit: "ticks" },
          durationTicks: 30,
        },
        { type: "modifyStat", stat: "range", amount: { value: 512, unit: "subcells" } },
        { type: "damageArea", amount: { value: 20, unit: "health" }, radiusSubcells: 2048 },
        { type: "spawn", unit: unitId("dragon-tank") },
      ],
    },
  ]);
  expect(
    compiled.definitions.find((d) => d.id === unitId("dragon-tank"))?.weapons[0],
  ).toMatchObject({
    burst: { count: 3, delayTicks: 5 },
    arcAngle: 16384,
    projectile: { kind: "grenade", speedSubcellsPerTick: 77, gravityPerMille: 750, fuseTicks: 25 },
    warheads: [
      { type: "burn", amountPerSecond: 5, durationTicks: 50, delayTicks: 5 },
      { type: "slow", perMille: 250 },
      { type: "spawn", unit: unitId("dragon-tank"), count: 1 },
    ],
  });
  expect(
    compiled.definitions.find((d) => d.id === unitId("dragon-tank"))?.weapons[0]?.warheads[1],
  ).not.toHaveProperty("durationTicks");
});

test("unimplemented era selection and ambiguous effect quantities fail explicitly", () => {
  expect(() =>
    compileGameplayCatalog(
      resolvePacks([pack("core", [{ ...factory, eraVariants: { "era:future": {} } }])], "0.1.0"),
    ),
  ).toThrow("era selection");
  const ability = {
    id: "fixture",
    name: "Fixture",
    description: "Test only.",
    target: "self",
    cooldown: 1,
    effects: [{ type: "modifyStat", stat: "armor", amount: 1.5 }],
  };
  expect(() =>
    compileGameplayCatalog(
      resolvePacks([pack("core", [{ ...factory, abilities: [ability] }])], "0.1.0"),
    ),
  ).toThrow("Unsupported gameplay effect amount");
});

test("production capacity and exit cells remain authored data through compilation", () => {
  const edited = roster.map((definition) =>
    definition.id === barracks.id
      ? {
          ...definition,
          productionSlots: 2,
          exits: [
            { side: "south", cell: [0, 1] },
            { side: "south", cell: [2, 1] },
          ],
        }
      : definition,
  );
  const compiled = compileGameplayCatalog(resolvePacks([pack("core", edited)], "0.1.0"));
  const definition = compiled.definitions.find(
    (definition) => definition.id === `core.${barracks.id}`,
  );
  expect(definition?.productionSlots).toBe(2);
  expect(definition?.exits).toEqual([
    { side: "south", cell: [0, 1] },
    { side: "south", cell: [2, 1] },
  ]);
  expect(definition?.produces).toContain(`core.${soldier.id}`);
  expect(() => toDefinition({ ...barracks, exits: [{ side: "south", cell: [0, 0] }] })).toThrow(
    "exit cell must be on its declared footprint side",
  );
});
