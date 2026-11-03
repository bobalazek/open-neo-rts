import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import reactor from "../../../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json";
import type { ConstructionBuild } from "../../commands";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup, toMatchResources } from "../../match";
import { createProjection } from "../../projection";
import { ExperienceYield } from "../abilities";
import { applyWarhead } from "../combat/damage";
import {
  type Definition,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
  toDefinition,
} from "../entities";
import type { GameplayWeapon } from "../entities/weapons";
import { MoveIntent } from "../movement";
import { Remains, SalvageOrder } from "../salvage";
import { ConstructionSite } from ".";
import { BuilderConstruction, CONSTRUCTION_CLEARANCE_TICKS, ConstructionRequest } from "./sites";

const hq: Definition = {
  id: "structure:fixture/headquarters",
  health: 1000,
  speed: 0,
  turnRate: 0,
  role: "headquarters",
  footprint: [2, 2],
};
const building: Definition = {
  id: "structure:fixture/factory",
  health: 100,
  speed: 0,
  turnRate: 0,
  role: "production",
  footprint: [2, 1],
  construction: { cost: { credits: 600, materials: 10 }, buildTicks: 100 },
  requires: [hq.id],
};
const defense: Definition = {
  ...building,
  id: "structure:fixture/turret",
  role: "defense",
  footprint: [1, 1],
};
const extractor: Definition = {
  ...building,
  id: "structure:fixture/extractor",
  role: "extractor",
  footprint: [2, 2],
  nodeKinds: ["materials"],
  requires: [],
};
const builder: Definition = {
  id: "unit:fixture/builder",
  health: 50,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  role: "builder",
  builds: [building.id, defense.id, extractor.id, hq.id],
};
function setup(): MatchSetup {
  const terrain = parseTerrain(48, 48, {});
  return {
    map: {
      id: "map:fixture",
      terrain: {
        ...terrain,
        level: [...terrain.level],
        ramp: [...terrain.ramp],
        surface: [...terrain.surface],
        water: [...terrain.water],
        biome: [...terrain.biome],
      },
      spawns: [{ id: "north", position: [12 * 1024, 12 * 1024], facing: 16384 }],
      objects: [],
      resources: toMatchResources([{ kind: "materials", position: [30, 30], amount: 200 }]),
    },
    seed: 1,
    debug: false,
    definitions: [hq, building, defense, extractor, builder],
    forces: [{ index: 0, faction: "faction:fixture" }],
    seats: [1, 2],
    grants: [{ seat: 1, force: 0, scopes: ["economy.build", "unit.orders"], grantedAtTick: 0 }],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 1 } },
      settings: { startingCredits: 1000, popCap: 500, structureCap: 400 },
      forces: [
        {
          index: 0,
          team: 0,
          spawn: "north",
          start: {
            structures: [hq.id],
            units: [{ unit: builder.id, count: 2, pop: 1, role: "builder" }],
            resources: { credits: 1000, materials: 100 },
          },
        },
      ],
    },
  };
}
function fixture(input = setup()) {
  const kernel = createMatch(input);
  const builders = kernel.world
    .query(Template)
    .filter((id) => kernel.world.get(id, Template, "definition") === 4);
  // Fixtures move starters away from candidate footprints; gameplay uses ordinary move orders below.
  for (const [i, id] of builders.entries()) {
    kernel.world.set(id, Transform, "x", (8 + i) * 1024 + 512);
    kernel.world.set(id, Transform, "y", 8 * 1024 + 512);
  }
  return { kernel, builders, input };
}
function payload(
  builders: number[],
  x = 15,
  y = 12,
  definition = building.id,
  rotation = 0,
): ConstructionBuild {
  return {
    builders,
    definition,
    force: 0,
    x: x * 1024,
    y: y * 1024,
    facing: ((rotation + 1) & 3) * 16384,
  };
}
const build = (
  kernel: ReturnType<typeof createMatch>,
  data: ConstructionBuild,
  sequence = 0,
  seat = 1,
) => ({ tick: kernel.tick, sequence, seat, type: "economy.build" as const, payload: data });
const sites = (kernel: ReturnType<typeof createMatch>) => kernel.world.query(ConstructionSite);

test("refundable unfinished sites cannot mint XP; completed structures still give actual damage credit", () => {
  const base = setup();
  if (!base.normal) throw new Error("Expected normal construction fixture");
  const weapon: GameplayWeapon = {
    id: "gun",
    targets: ["ground"],
    rangeSubcells: [0, 32768],
    reloadTicks: 1000,
    projectile: { kind: "instant" },
    warheads: [{ type: "damage", amount: 10, tags: [] }],
  };
  const attacker: Definition = {
    id: "unit:fixture/attacker",
    armor: "infantry",
    role: "combat",
    health: 100,
    speed: 64,
    turnRate: 65536,
    domain: "foot",
    radiusSubcells: 128,
    construction: { cost: { credits: 100 }, buildTicks: 1 },
    weapons: [weapon],
  };
  const input: MatchSetup = {
    ...base,
    definitions: [...base.definitions, attacker],
    forces: [...base.forces, { index: 1, faction: "faction:fixture" }],
    grants: [...base.grants, { seat: 2, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
    map: {
      ...base.map,
      spawns: [...base.map.spawns, { id: "south", position: [30 * 1024, 12 * 1024], facing: 0 }],
    },
    normal: {
      ...base.normal,
      mapSupport: { ...base.normal.mapSupport, players: { min: 1, max: 2 } },
      forces: [
        ...base.normal.forces,
        {
          index: 1,
          team: 1,
          spawn: "south",
          start: {
            structures: [hq.id],
            units: [{ unit: attacker.id, count: 1, pop: 1, role: "combat" }],
            resources: { credits: 1000 },
          },
        },
      ],
    },
  };
  const { kernel, builders } = fixture(input),
    { world } = kernel;
  const source = world.query(Template).find((id) => world.get(id, Template, "definition") === 5)!;
  const damage = (site: number) => {
    const x = world.get(site, Transform, "x"),
      y = world.get(site, Transform, "y");
    applyWarhead(
      kernel,
      input.definitions,
      weapon,
      weapon.warheads[0]!,
      { source, force: 1, direct: site, x, y, fromX: x + 1024, fromY: y, air: false, maxLevel: 2 },
      true,
    );
  };
  for (let repeat = 0; repeat < 2; repeat++) {
    expect(step(kernel, [build(kernel, payload(builders))])[0]?.result).toBe("accepted");
    const site = sites(kernel)[0]!;
    expect(kernel.economy?.balance(0)).toMatchObject({ credits: 400, materials: 90 });
    damage(site);
    expect(world.get(site, Health, "current")).toBe(90);
    expect(world.get(site, ExperienceYield, "damagedAt")).toBe(kernel.tick);
    expect(kernel.veterancy?.snapshot(source, true)).toBeUndefined();
    expect(
      step(kernel, [
        {
          tick: kernel.tick,
          sequence: 0,
          seat: 1,
          type: "economy.cancelConstruction",
          payload: { entity: site },
        },
      ])[0]?.result,
    ).toBe("accepted");
    expect(world.isAlive(site)).toBe(false);
    expect(kernel.economy?.balance(0)).toMatchObject({ credits: 1000, materials: 100 });
  }
  expect(step(kernel, [build(kernel, payload(builders))])[0]?.result).toBe("accepted");
  const completed = sites(kernel)[0]!;
  damage(completed);
  for (let ticks = 0; ticks < 250 && world.has(completed, ConstructionSite); ticks++)
    step(kernel, []);
  expect(world.has(completed, ConstructionSite)).toBe(false);
  expect(kernel.veterancy?.snapshot(source, true)).toBeUndefined();
  damage(completed);
  expect(kernel.veterancy?.snapshot(source, true)).toEqual({ rank: 0, xp: 66560, nextXp: 102400 });
});

test("normal build pays full authored cost once, occupies its rotated cells and cancels once", () => {
  for (const rotation of [0, 1, 2, 3]) {
    const funded = setup();
    if (funded.normal)
      funded.normal = {
        ...funded.normal,
        settings: { ...funded.normal.settings, startingCredits: 2000 },
        forces: funded.normal.forces.map((force) => ({
          ...force,
          start: { ...force.start, resources: { ...force.start.resources, credits: 2000 } },
        })),
      };
    const { kernel, builders, input } = fixture(funded);
    const data = payload(builders, 15, 12, building.id, rotation);
    expect(step(kernel, [build(kernel, data)])[0]?.result).toBe("accepted");
    expect(sites(kernel)).toHaveLength(1);
    expect(kernel.economy?.balance(0)).toMatchObject({ credits: 1400, materials: 90 });
    expect(step(kernel, [build(kernel, data)])[0]?.result).toBe("placement_failed");
    expect(kernel.economy?.balance(0)?.credits).toBe(1400);
    const view = createProjection(input, 1, "controlled").snapshot(kernel);
    expect(
      view.entities.find((entity) => entity.definition === building.id)?.constructionSite,
    ).toBe(true);
    const id = sites(kernel)[0] as number;
    for (const builder of builders)
      expect(kernel.world.get(builder, BuilderConstruction, "target")).toBe(id);
    expect(
      step(kernel, [
        {
          tick: kernel.tick,
          sequence: 0,
          seat: 1,
          type: "economy.cancelConstruction",
          payload: { entity: id },
        },
      ])[0]?.result,
    ).toBe("accepted");
    expect(kernel.economy?.balance(0)).toMatchObject({ credits: 2000, materials: 100 });
    expect(
      step(kernel, [
        {
          tick: kernel.tick,
          sequence: 0,
          seat: 1,
          type: "economy.cancelConstruction",
          payload: { entity: id },
        },
      ])[0]?.result,
    ).toBe("bad_payload");
    expect(kernel.economy?.balance(0)?.credits).toBe(2000);
  }
});

test("every footprint cell needs completed same-Force radius, with defense boundary at three", () => {
  for (const [x, definition, result] of [
    [17, building.id, "accepted"],
    [18, building.id, "placement_failed"],
    [15, defense.id, "accepted"],
    [16, defense.id, "placement_failed"],
  ] as const) {
    const { kernel, builders } = fixture();
    expect(step(kernel, [build(kernel, payload(builders, x, 12, definition))])[0]?.result).toBe(
      result,
    );
  }
  const { kernel, builders } = fixture();
  expect(step(kernel, [build(kernel, payload(builders, 17, 12))])[0]?.result).toBe("accepted");
  kernel.economy?.gain(0, { credits: 1000 });
  expect(step(kernel, [build(kernel, payload(builders, 20, 12))])[0]?.result).toBe(
    "placement_failed",
  );
  const base = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 0) as number;
  kernel.world.set(base, OwnerForce, "force", 1);
  expect(step(kernel, [build(kernel, payload(builders, 15, 12))])[0]?.result).toBe("bad_payload");
});

test("remote node extractors are exempt, never extend radius, and still enforce terrain and occupancy", () => {
  const { kernel, builders } = fixture();
  expect(step(kernel, [build(kernel, payload(builders, 29, 29, extractor.id))])[0]?.result).toBe(
    "accepted",
  );
  const site = sites(kernel)[0] as number;
  kernel.world.remove(site, ConstructionSite); // Completed extractor fixture: still no base radius.
  kernel.economy?.gain(0, { credits: 1000 });
  expect(step(kernel, [build(kernel, payload(builders, 31, 29))])[0]?.result).toBe(
    "placement_failed",
  );
  expect(step(kernel, [build(kernel, payload(builders, 29, 29, extractor.id))])[0]?.result).toBe(
    "placement_failed",
  );
  expect(step(kernel, [build(kernel, payload(builders, 28, 29, extractor.id))])[0]?.result).toBe(
    "placement_failed",
  );
});

test("grants, selected builders, required structures, missing recipes and competing funds refuse without debit", () => {
  const { kernel, builders } = fixture();
  const before = kernel.economy?.balance(0);
  expect(step(kernel, [build(kernel, payload(builders), 0, 2)])[0]?.result).toBe("no_grant");
  expect(step(kernel, [build(kernel, payload([999]))])[0]?.result).toBe("bad_payload");
  expect(
    step(kernel, [build(kernel, payload([builders[0] as number, builders[0] as number]))])[0]
      ?.result,
  ).toBe("bad_payload");
  expect(step(kernel, [build(kernel, payload(builders, 15, 12, hq.id))])[0]?.result).toBe(
    "bad_payload",
  );
  expect(sites(kernel)).toHaveLength(0);
  expect(kernel.economy?.balance(0)).toEqual(before);
  expect(
    step(kernel, [
      build(kernel, payload(builders)),
      build(kernel, payload(builders, 15, 14), 1),
    ]).map((entry) => entry.result),
  ).toEqual(["accepted", "insufficient_funds"]);
  expect(sites(kernel)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(400);
});

test("friendly clearance uses normal paths, remains free while pending and commits only once clear", () => {
  const { kernel, builders } = fixture();
  const blocker = builders[1] as number;
  kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
  kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
  expect(step(kernel, [build(kernel, payload([builders[0] as number]))])[0]?.result).toBe(
    "accepted",
  );
  expect(kernel.world.query(ConstructionRequest)).toHaveLength(1);
  expect(sites(kernel)).toHaveLength(0);
  expect(kernel.economy?.balance(0)?.credits).toBe(1000);
  for (let tick = 0; tick < 10 && !sites(kernel).length; tick++) step(kernel, []);
  expect(sites(kernel)).toHaveLength(1);
  expect(kernel.world.query(ConstructionRequest)).toHaveLength(0);
  expect(kernel.economy?.balance(0)?.credits).toBe(400);
});

test("automatic friendly site clearance replaces an unselected builder's salvage job", () => {
  const base = setup();
  if (!base.normal) throw new Error("Expected normal fixture");
  const vehicle: Definition = {
    id: "unit:fixture/vehicle",
    health: 50,
    speed: 1024,
    turnRate: 65536,
    domain: "tracked",
    radiusSubcells: 128,
  };
  const { kernel, builders } = fixture({
    ...base,
    definitions: [...base.definitions, vehicle],
    normal: { ...base.normal, settings: { ...base.normal.settings, fog: "off" } },
  });
  const { world } = kernel,
    salvager = builders[0]!,
    selected = builders[1]!;
  world.set(salvager, Transform, "x", 15 * 1024 + 512);
  world.set(salvager, Transform, "y", 12 * 1024 + 512);
  kernel.remains!.create(5, 0, { x: 16 * 1024, y: 12 * 1024, facing: 0 }, false);
  const remains = world.query(Remains)[0]!;
  expect(
    step(kernel, [
      {
        tick: kernel.tick,
        sequence: 0,
        seat: 1,
        type: "economy.salvage",
        payload: { entity: remains, builders: [salvager] },
      },
    ])[0]?.result,
  ).toBe("accepted");
  expect(world.has(salvager, SalvageOrder)).toBe(true);
  const work = world.get(remains, Remains, "work");
  expect(step(kernel, [build(kernel, payload([selected]))])[0]?.result).toBe("accepted");
  expect(world.has(salvager, SalvageOrder)).toBe(false);
  for (let i = 0; i < CONSTRUCTION_CLEARANCE_TICKS; i++) step(kernel, []);
  expect(world.get(remains, Remains, "work")).toBe(work);
  expect(sites(kernel)).toHaveLength(1);
  expect(kernel.observe?.(1).constructionRequests).toHaveLength(0);
});

test("uncontrolled or enemy blockers refuse, and pending timeout/cancel preserve newer orders", () => {
  for (const owner of [0, 1]) {
    const input = setup();
    input.grants = [{ seat: 1, force: 0, scopes: ["economy.build"], grantedAtTick: 0 }];
    // Initialization needs an army controller, but the building seat need not be that controller.
    input.grants = [
      ...input.grants,
      { seat: 2, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
    ];
    const { kernel, builders } = fixture(input);
    const blocker = builders[1] as number;
    kernel.world.set(blocker, OwnerForce, "force", owner);
    kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
    kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
    expect(step(kernel, [build(kernel, payload([builders[0] as number]))])[0]?.result).toBe(
      "placement_failed",
    );
    expect(kernel.economy?.balance(0)?.credits).toBe(1000);
  }
  for (const cancel of [false, true]) {
    const slow = setup();
    slow.definitions = slow.definitions.map((definition) =>
      definition.id === builder.id ? { ...definition, speed: 1 } : definition,
    );
    const { kernel, builders, input } = fixture(slow);
    const blocker = builders[1] as number;
    kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
    kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
    step(kernel, [build(kernel, payload([builders[0] as number]))]);
    // A newer ordinary order returns the blocker to the still-pending footprint.
    const target = { x: 15 * 1024 + 512, y: 12 * 1024 + 512 };
    step(kernel, [
      {
        tick: kernel.tick,
        sequence: 0,
        seat: 1,
        type: "unit.move",
        payload: { entities: [blocker], ...target },
      },
    ]);
    if (cancel) {
      const request = kernel.world.query(ConstructionRequest)[0] as number;
      step(kernel, [
        {
          tick: kernel.tick,
          sequence: 0,
          seat: 1,
          type: "economy.cancelConstruction",
          payload: { entity: request },
        },
      ]);
    }
    for (let tick = kernel.tick; tick <= CONSTRUCTION_CLEARANCE_TICKS; tick++) step(kernel, []);
    expect(sites(kernel)).toHaveLength(0);
    expect(kernel.economy?.balance(0)?.credits).toBe(1000);
    expect(kernel.world.get(blocker, Transform, "x")).toBe(target.x);
    expect(kernel.world.get(blocker, Transform, "y")).toBe(target.y);
    expect(kernel.world.has(blocker, MoveIntent)).toBe(false);
    const snapshot = createProjection(input, 1, "controlled").snapshot(kernel);
    expect(snapshot.constructionRequests?.map((request) => request.status)).toEqual(
      cancel ? [] : ["refused"],
    );
    if (!cancel) expect(snapshot.constructionRequests?.[0]?.reason).toBe("clearance_timeout");
  }
});

test("construction definitions and pending ECS state are immutable, hashed and repeatable", () => {
  const a = fixture(),
    b = fixture();
  for (const f of [a, b]) {
    const blocker = f.builders[1] as number;
    f.kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
    f.kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
    step(f.kernel, [build(f.kernel, payload([f.builders[0] as number]))]);
  }
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  const request = b.kernel.world.query(ConstructionRequest)[0] as number;
  b.kernel.world.set(request, ConstructionRequest, "deadline", 100);
  expect(checkpointHash(a.kernel)).not.toBe(checkpointHash(b.kernel));
  const changed = setup();
  changed.definitions = changed.definitions.map((definition) =>
    definition.id === building.id
      ? { ...definition, construction: { cost: { credits: 601 }, buildTicks: 100 } }
      : definition,
  );
  expect(checkpointHash(fixture().kernel)).not.toBe(checkpointHash(fixture(changed).kernel));
});

test("clearance revalidates grants, builder life and competing funds without reserving or charging", () => {
  for (const invalidation of ["grant", "builder", "funds"] as const) {
    const input = setup();
    input.definitions = input.definitions.map((definition) =>
      definition.id === builder.id ? { ...definition, speed: 1 } : definition,
    );
    if (invalidation === "grant")
      input.grants = input.grants.map((grant) => ({ ...grant, expiresAtTick: 1 }));
    const { kernel, builders } = fixture(input);
    const selected = builders[0] as number,
      blocker = builders[1] as number;
    kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
    kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
    step(kernel, [build(kernel, payload([selected]))]);
    if (invalidation === "builder") kernel.world.destroy(selected);
    if (invalidation === "funds")
      expect(kernel.economy?.spend(1, 0, { credits: 500 }, "economy.build").ok).toBe(true);
    step(kernel, []);
    expect(sites(kernel)).toHaveLength(0);
    expect(kernel.economy?.balance(0)?.credits).toBe(invalidation === "funds" ? 500 : 1000);
    const request = kernel.world.query(ConstructionRequest)[0] as number;
    expect(kernel.world.get(request, ConstructionRequest, "status")).toBe(1);
  }
});

test("destroyed sites lose their investment and cannot be refunded by cancellation", () => {
  const { kernel, builders } = fixture();
  step(kernel, [build(kernel, payload(builders))]);
  const site = sites(kernel)[0] as number;
  kernel.world.destroy(site);
  expect(
    step(kernel, [
      {
        tick: kernel.tick,
        sequence: 0,
        seat: 1,
        type: "economy.cancelConstruction",
        payload: { entity: site },
      },
    ])[0]?.result,
  ).toBe("bad_payload");
  expect(kernel.economy?.balance(0)?.credits).toBe(400);
});

test("authored Industrial Reactor recipe survives setup copying and unfinished sites supply no power", () => {
  const input = setup();
  const recipe = { cost: { ...reactor.cost }, buildTicks: reactor.buildTime * 20 };
  const authored = { ...toDefinition(reactor), role: reactor.role, construction: recipe };
  input.definitions = [hq, authored, defense, extractor, { ...builder, builds: [authored.id] }];
  const { kernel, builders } = fixture(input);
  recipe.cost.credits = 1; // Caller mutation must not replace the authored 900-credit investment.
  expect(step(kernel, [build(kernel, payload(builders, 15, 12, authored.id))])[0]?.result).toBe(
    "accepted",
  );
  expect(kernel.economy?.balance(0)?.credits).toBe(100);
  expect(kernel.power?.balance(0)?.produced).toBe(0);
  const site = sites(kernel)[0] as number;
  for (const builder of builders)
    expect(kernel.world.get(builder, BuilderConstruction, "target")).toBe(site);
});

test("new builder build/move orders supersede pending requests without replacing the new assignment", () => {
  for (const next of ["build", "move"] as const) {
    const input = setup();
    input.definitions = input.definitions.map((definition) =>
      definition.id === builder.id ? { ...definition, speed: 1 } : definition,
    );
    const { kernel, builders } = fixture(input);
    const selected = builders[0] as number,
      blocker = builders[1] as number;
    kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
    kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
    step(kernel, [build(kernel, payload([selected]))]);
    if (next === "build") step(kernel, [build(kernel, payload([selected], 15, 15))]);
    else
      step(kernel, [
        {
          tick: kernel.tick,
          sequence: 0,
          seat: 1,
          type: "unit.move",
          payload: { entities: [selected], x: 7 * 1024 + 512, y: 7 * 1024 + 512 },
        },
      ]);
    const request = kernel.world.query(ConstructionRequest)[0] as number;
    expect(kernel.world.get(request, ConstructionRequest, "status")).toBe(1);
    if (next === "build")
      expect(kernel.world.get(selected, BuilderConstruction, "target")).toBe(
        sites(kernel)[0] as number,
      );
    else expect(kernel.world.has(selected, BuilderConstruction)).toBe(false);
  }
});

test("construction metadata refuses fractional, unknown-resource and invalid-time recipes at setup", () => {
  for (const construction of [
    { cost: { credits: 1.5 }, buildTicks: 10 },
    { cost: { power: 10 }, buildTicks: 10 },
    { cost: { credits: 1 }, buildTicks: -1 },
    { cost: { credits: -1 }, buildTicks: 10 },
  ]) {
    const input = setup();
    input.definitions = input.definitions.map((definition) =>
      definition.id === building.id ? { ...definition, construction } : definition,
    );
    expect(() => createMatch(input)).toThrow("Invalid match map");
  }
});

test("explicit zero-cost and zero-time recipes stay distinct from missing recipes", () => {
  const input = setup();
  input.definitions = input.definitions.map((definition) =>
    definition.id === building.id
      ? { ...definition, construction: { cost: {}, buildTicks: 0 } }
      : definition,
  );
  const { kernel, builders } = fixture(input);
  const before = kernel.economy?.balance(0);
  expect(step(kernel, [build(kernel, payload(builders))])[0]?.result).toBe("accepted");
  expect(sites(kernel)).toHaveLength(1);
  expect(kernel.economy?.balance(0)).toEqual(before);
});

test("normal identity covers unbuilt definition rules and ignores JSON object key order", () => {
  const original = checkpointHash(fixture().kernel);
  const changed = setup();
  changed.definitions = changed.definitions.map((definition) =>
    definition.id === building.id ? { ...definition, power: -10 } : definition,
  );
  expect(checkpointHash(fixture(changed).kernel)).not.toBe(original);
  const reordered = setup();
  reordered.definitions = reordered.definitions.map(
    (definition) =>
      Object.fromEntries(Object.entries(definition).reverse()) as unknown as Definition,
  );
  expect(checkpointHash(fixture(reordered).kernel)).toBe(original);
});

test("refusal feedback is private and retains only the latest terminal request per seat and Force", () => {
  const input = setup();
  input.definitions = input.definitions.map((definition) =>
    definition.id === builder.id ? { ...definition, speed: 1 } : definition,
  );
  const { kernel, builders } = fixture(input);
  const selected = builders[0] as number,
    blocker = builders[1] as number;
  kernel.world.set(blocker, Transform, "x", 15 * 1024 + 512);
  kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
  const observer = createProjection(input, 2, "controlled");
  const owner = createProjection(input, 1, "controlled");
  for (let attempt = 0; attempt < 2; attempt++) {
    step(kernel, [build(kernel, payload([selected]))]);
    const pending = owner
      .snapshot(kernel)
      .constructionRequests?.find((request) => request.status === "clearing");
    expect(pending).toBeDefined();
    expect(observer.snapshot(kernel).constructionRequests).toEqual([]);
    const current = kernel.tick;
    for (let tick = current; tick <= current + CONSTRUCTION_CLEARANCE_TICKS; tick++)
      step(kernel, []);
    expect(kernel.world.query(ConstructionRequest)).toHaveLength(1);
    expect(owner.snapshot(kernel).constructionRequests?.[0]?.reason).toBe("clearance_timeout");
  }
  expect(kernel.economy?.balance(0)?.credits).toBe(1000);
});

function capSetup(): MatchSetup {
  const input = setup();
  if (input.normal)
    input.normal = { ...input.normal, settings: { ...input.normal.settings, structureCap: 20 } };
  input.definitions = input.definitions.map((definition) =>
    definition.construction
      ? { ...definition, construction: { ...definition.construction, cost: { credits: 10 } } }
      : definition,
  );
  return input;
}
function addStructures(kernel: ReturnType<typeof createMatch>, count: number, force = 0) {
  for (let i = 0; i < count; i++)
    spawnEntity(kernel, 0, hq, {
      definition: hq.id,
      force,
      x: (24 + (i % 8) * 2) * 1024,
      y: (4 + Math.floor(i / 8) * 2) * 1024,
      facing: 16384,
    });
}

test("structure cap counts same-Force completed structures and paid sites before charging", () => {
  const { kernel, builders } = fixture(capSetup());
  addStructures(kernel, 18); // Starting headquarters plus 18 completed structures leaves one slot.
  addStructures(kernel, 20, 1); // Another Force's structures consume none of that slot.
  expect(step(kernel, [build(kernel, payload(builders))])[0]?.result).toBe("accepted");
  expect(kernel.economy?.balance(0)?.credits).toBe(990);
  expect(step(kernel, [build(kernel, payload(builders, 15, 14))])[0]?.result).toBe("structure_cap");
  expect(sites(kernel)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(990);
});

test("wall sites consume exact quarter slots and cannot borrow a full structure's space", () => {
  const input = capSetup();
  input.definitions = input.definitions.map((definition) =>
    definition.id === defense.id ? { ...definition, role: "wall" } : definition,
  );
  const { kernel, builders } = fixture(input);
  addStructures(kernel, 18);
  for (const [x, y] of [
    [15, 11],
    [15, 12],
    [14, 10],
  ])
    expect(step(kernel, [build(kernel, payload(builders, x, y, defense.id))])[0]?.result).toBe(
      "accepted",
    );
  expect(step(kernel, [build(kernel, payload(builders, 17, 12))])[0]?.result).toBe("structure_cap");
  expect(step(kernel, [build(kernel, payload(builders, 14, 13, defense.id))])[0]?.result).toBe(
    "accepted",
  );
  expect(step(kernel, [build(kernel, payload(builders, 14, 12, defense.id))])[0]?.result).toBe(
    "structure_cap",
  );
  expect(sites(kernel)).toHaveLength(4);
  expect(kernel.economy?.balance(0)?.credits).toBe(960);
});

test("competing pending placements recheck the last structure slot at canonical late commit", () => {
  const { kernel, builders, input } = fixture(capSetup());
  addStructures(kernel, 18);
  const blockers = [0, 1].map((i) =>
    spawnEntity(kernel, 4, builder, {
      definition: builder.id,
      force: 0,
      x: 15 * 1024 + 512,
      y: (12 + i * 2) * 1024 + 512,
      facing: 0,
    }),
  );
  expect(
    step(kernel, [
      build(kernel, payload([builders[0] as number])),
      build(kernel, payload([builders[1] as number], 15, 14), 1),
    ]).map((entry) => entry.result),
  ).toEqual(["accepted", "accepted"]);
  expect(sites(kernel)).toHaveLength(0);
  expect(kernel.economy?.balance(0)?.credits).toBe(1000);
  for (const [i, blocker] of blockers.entries())
    kernel.world.set(blocker, Transform, "x", (6 + i) * 1024 + 512);
  step(kernel, []);
  expect(sites(kernel)).toHaveLength(1);
  expect(kernel.economy?.balance(0)?.credits).toBe(990);
  expect(
    createProjection(input, 1, "controlled")
      .snapshot(kernel)
      .constructionRequests?.map((request) => [request.status, request.reason]),
  ).toEqual([["refused", "structure_cap"]]);
});

test("normal clearance waits for adjacent overlapping unit discs but permits exact tangency", () => {
  for (const overlap of [true, false]) {
    const { kernel, builders } = fixture();
    const blocker = builders[1] as number;
    kernel.world.set(blocker, Transform, "x", 15 * 1024 - (overlap ? 64 : 128));
    kernel.world.set(blocker, Transform, "y", 12 * 1024 + 512);
    expect(step(kernel, [build(kernel, payload([builders[0] as number]))])[0]?.result).toBe(
      "accepted",
    );
    expect(sites(kernel)).toHaveLength(overlap ? 0 : 1);
    expect(kernel.economy?.balance(0)?.credits).toBe(overlap ? 1000 : 400);
    if (overlap) {
      expect(kernel.world.query(ConstructionRequest)).toHaveLength(1);
      for (let tick = 0; tick < 10 && !sites(kernel).length; tick++) step(kernel, []);
      expect(sites(kernel)).toHaveLength(1);
      expect(kernel.economy?.balance(0)?.credits).toBe(400);
      expect(kernel.world.get(blocker, Transform, "x") + 128).toBeLessThanOrEqual(15 * 1024);
    }
  }
});
