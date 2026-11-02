import { expect, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { MoveIntent } from "../movement";
import {
  BuilderConstruction,
  ConstructionApproach,
  ConstructionPayment,
  ConstructionProgress,
  ConstructionSite,
} from ".";

const headquarters: Definition = {
  id: "structure:work/headquarters",
  role: "headquarters",
  health: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 2],
  power: 20,
};
const structure: Definition = {
  id: "structure:work/reactor",
  role: "power",
  health: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 1],
  power: 140,
  construction: { cost: { credits: 100 }, buildTicks: 20 },
};
const builder: Definition = {
  id: "unit:work/builder",
  role: "builder",
  health: 100,
  speed: 1024,
  turnRate: 65536,
  radiusSubcells: 128,
  domain: "foot",
  builds: [structure.id],
};
const obstruction: Definition = {
  id: "prop:work/block",
  health: 0,
  speed: 0,
  turnRate: 0,
  footprint: [1, 1],
  blocks: "movement",
};
function fixture(duration = 20, radius = 128) {
  const t = parseTerrain(32, 32, {});
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    map: {
      id: "map:work",
      terrain: {
        ...t,
        level: [...t.level],
        ramp: [...t.ramp],
        surface: [...t.surface],
        water: [...t.water],
        biome: [...t.biome],
      },
      spawns: [{ id: "start", position: [12 * 1024, 12 * 1024], facing: 16384 }],
      objects: [],
    },
    definitions: [
      headquarters,
      { ...builder, radiusSubcells: radius },
      { ...structure, construction: { cost: { credits: 100 }, buildTicks: duration } },
      obstruction,
    ],
    forces: [{ index: 0, faction: "faction:work" }],
    seats: [1, 2],
    grants: [{ seat: 1, force: 0, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 }],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 1 } },
      settings: { startingCredits: 5000, popCap: 500, structureCap: 400 },
      forces: [
        {
          index: 0,
          team: 0,
          spawn: "start",
          start: {
            structures: [headquarters.id],
            units: [{ unit: builder.id, count: 1, role: "builder", pop: 1 }],
            resources: { credits: 5000 },
          },
        },
      ],
    },
  };
  const kernel = createMatch(setup);
  const unit = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1) as number;
  kernel.world.set(unit, Transform, "x", 8 * 1024 + 512);
  kernel.world.set(unit, Transform, "y", 8 * 1024 + 512);
  return { kernel, unit, setup };
}
function build(kernel: ReturnType<typeof createMatch>, builders: number[]) {
  expect(
    step(kernel, [
      {
        tick: kernel.tick,
        sequence: 0,
        seat: 1,
        type: "economy.build",
        payload: {
          force: 0,
          definition: structure.id,
          builders,
          x: 15 * 1024,
          y: 12 * 1024,
          facing: 16384,
        },
      },
    ])[0]?.result,
  ).toBe("accepted");
  return kernel.world.query(ConstructionSite)[0] as number;
}
function until(kernel: ReturnType<typeof createMatch>, predicate: () => boolean, limit = 200) {
  for (let tick = 0; tick < limit && !predicate(); tick++) step(kernel, []);
  expect(predicate()).toBe(true);
}
function assist(
  kernel: ReturnType<typeof createMatch>,
  site: number,
  builders: number[],
  seat = 1,
) {
  return step(kernel, [
    {
      tick: kernel.tick,
      sequence: 0,
      seat,
      type: "economy.assistConstruction",
      payload: { entity: site, builders },
    },
  ])[0]?.result;
}

test("builders walk, work, leave, resume and finish once, activating power and retaining the proven investment", () => {
  const { kernel, unit, setup } = fixture();
  const site = build(kernel, [unit]);
  expect(kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(0);
  expect(kernel.power?.balance(0)?.produced).toBe(20);
  expect(kernel.world.has(unit, MoveIntent)).toBe(true);
  until(kernel, () => kernel.world.get(site, ConstructionProgress, "completedTicks") > 0);
  const view = createProjection(setup, 1, "controlled").snapshot(kernel);
  expect(
    view.entities.find((entity) => entity.definition === structure.id)?.construction,
  ).toMatchObject({ totalTicks: 20, buildersWorking: 1 });
  expect(
    view.entities.find((entity) => entity.definition === builder.id)?.constructionOrder?.state,
  ).toBe("working");
  step(kernel, [
    { tick: kernel.tick, sequence: 0, seat: 1, type: "unit.stop", payload: { entities: [unit] } },
  ]);
  const progress = kernel.world.get(site, ConstructionProgress, "completedTicks"),
    quarter = kernel.world.get(site, ConstructionProgress, "quarter");
  for (let tick = 0; tick < 10; tick++) step(kernel, []);
  expect(kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(progress);
  expect(kernel.world.get(site, ConstructionProgress, "quarter")).toBe(quarter);
  expect(kernel.world.get(site, ConstructionProgress, "buildersWorking")).toBe(0);
  expect(assist(kernel, site, [unit], 2)).toBe("no_grant");
  expect(assist(kernel, site, [unit])).toBe("accepted");
  until(kernel, () => !kernel.world.has(site, ConstructionSite));
  expect(kernel.statistics?.snapshot(1)[0]?.counters.structuresBuilt).toBe(1);
  expect(kernel.power?.balance(0)?.produced).toBe(160);
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  expect(kernel.world.has(site, ConstructionPayment)).toBe(true);
  expect(kernel.world.has(unit, BuilderConstruction)).toBe(false);
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
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
});

test("only actual workers contribute the accepted 100/75/50/25-floor integer rates", () => {
  for (const [count, completed, quarter] of [
    [1, 1, 0],
    [2, 1, 3],
    [3, 2, 1],
    [4, 2, 2],
    [5, 2, 3],
  ]) {
    const { kernel, unit } = fixture(100);
    const builders = [unit];
    for (let i = 1; i < (count as number); i++)
      builders.push(
        spawnEntity(kernel, 1, builder, {
          definition: builder.id,
          force: 0,
          x: 14 * 1024 + 512,
          y: 12 * 1024 + 512,
          facing: 0,
        }),
      );
    kernel.world.set(unit, Transform, "x", 14 * 1024 + 512);
    kernel.world.set(unit, Transform, "y", 12 * 1024 + 512);
    const site = build(kernel, builders);
    expect(kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(
      completed as number,
    );
    expect(kernel.world.get(site, ConstructionProgress, "quarter")).toBe(quarter as number);
    expect(kernel.world.get(site, ConstructionProgress, "buildersWorking")).toBe(count as number);
  }
});

test("builder death removes its contribution; site death loses investment and drops surviving assignments", () => {
  const { kernel, unit } = fixture(100);
  const second = spawnEntity(kernel, 1, builder, {
    definition: builder.id,
    force: 0,
    x: 14 * 1024 + 512,
    y: 12 * 1024 + 512,
    facing: 0,
  });
  kernel.world.set(unit, Transform, "x", 14 * 1024 + 512);
  kernel.world.set(unit, Transform, "y", 12 * 1024 + 512);
  const site = build(kernel, [unit, second]);
  kernel.world.destroy(second);
  step(kernel, []);
  expect(kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(2);
  expect(kernel.world.get(site, ConstructionProgress, "quarter")).toBe(3);
  expect(kernel.world.get(site, ConstructionProgress, "buildersWorking")).toBe(1);
  kernel.world.destroy(site);
  step(kernel, []);
  expect(kernel.world.has(unit, BuilderConstruction)).toBe(false);
  expect(kernel.world.has(unit, MoveIntent)).toBe(false);
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
});

test("blocked approaches expose their state, do no work and retry on an explicit assist order", () => {
  const { kernel, unit, setup } = fixture();
  const obstacles = [
    [14, 12],
    [17, 12],
    [15, 11],
    [16, 11],
    [15, 13],
    [16, 13],
  ].map(([x, y]) =>
    spawnEntity(kernel, 3, obstruction, {
      definition: obstruction.id,
      force: 0,
      x: (x as number) * 1024,
      y: (y as number) * 1024,
      facing: 16384,
    }),
  );
  const site = build(kernel, [unit]);
  expect(kernel.world.get(unit, ConstructionApproach, "state")).toBe(2);
  expect(
    createProjection(setup, 1, "controlled")
      .snapshot(kernel)
      .entities.find((entity) => entity.definition === builder.id)?.constructionOrder?.state,
  ).toBe("blocked");
  for (let tick = 0; tick < 5; tick++) step(kernel, []);
  expect(kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(0);
  kernel.world.destroy(obstacles[0] as number);
  expect(assist(kernel, site, [unit])).toBe("accepted");
  until(kernel, () => !kernel.world.has(site, ConstructionSite));
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
});

test("zero-time recipes still require arrival and INT32_MAX durations keep progress within ECS bounds", () => {
  const zero = fixture(0);
  const instant = build(zero.kernel, [zero.unit]);
  expect(zero.kernel.world.has(instant, ConstructionSite)).toBe(true);
  until(zero.kernel, () => !zero.kernel.world.has(instant, ConstructionSite));
  const max = fixture(0x7fffffff);
  max.kernel.world.set(max.unit, Transform, "x", 14 * 1024 + 512);
  max.kernel.world.set(max.unit, Transform, "y", 12 * 1024 + 512);
  const site = build(max.kernel, [max.unit]);
  expect(max.kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(1);
  max.kernel.world.set(site, ConstructionProgress, "completedTicks", 0x7ffffffe);
  max.kernel.world.set(site, ConstructionProgress, "quarter", 3);
  step(max.kernel, []);
  expect(max.kernel.world.has(site, ConstructionSite)).toBe(false);
  expect(max.kernel.world.has(site, ConstructionPayment)).toBe(true);
});

test("large circular builders use legal exterior positions and newer orders survive cancellation", () => {
  const { kernel, unit } = fixture(20, 870);
  const site = build(kernel, [unit]);
  until(kernel, () => kernel.world.get(site, ConstructionProgress, "completedTicks") > 0);
  const x = kernel.world.get(unit, Transform, "x"),
    y = kernel.world.get(unit, Transform, "y");
  const dx = x - Math.max(15 * 1024, Math.min(x, 17 * 1024));
  const dy = y - Math.max(12 * 1024, Math.min(y, 13 * 1024));
  expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(870 * 870);
  step(kernel, [
    {
      tick: kernel.tick,
      sequence: 0,
      seat: 1,
      type: "unit.move",
      payload: { entities: [unit], x: 8 * 1024 + 512, y: 8 * 1024 + 512 },
    },
  ]);
  step(kernel, [
    {
      tick: kernel.tick,
      sequence: 0,
      seat: 1,
      type: "economy.cancelConstruction",
      payload: { entity: site },
    },
  ]);
  expect(kernel.world.has(unit, MoveIntent)).toBe(true);
  expect(kernel.economy?.balance(0)?.credits).toBe(5000);
});

test("assist rejects foreign builders atomically and canonical progress survives identical replay steps", () => {
  const a = fixture(100),
    b = fixture(100);
  const siteA = build(a.kernel, [a.unit]),
    siteB = build(b.kernel, [b.unit]);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  a.kernel.world.set(a.unit, OwnerForce, "force", 1);
  expect(assist(a.kernel, siteA, [a.unit])).toBe("bad_payload");
  expect(a.kernel.economy?.balance(0)?.credits).toBe(4900);
  a.kernel.world.set(a.unit, OwnerForce, "force", 0);
  expect(assist(a.kernel, siteA, [a.unit])).toBe("accepted");
  expect(assist(b.kernel, siteB, [b.unit])).toBe("accepted");
  for (let tick = 0; tick < 15; tick++) {
    step(a.kernel, []);
    step(b.kernel, []);
  }
  // The refused foreign-owner command advances one extra tick, so compare stored progress separately.
  expect(a.kernel.world.get(siteA, ConstructionProgress, "completedTicks")).toBe(
    b.kernel.world.get(siteB, ConstructionProgress, "completedTicks"),
  );
});

test("unreachable approach fallbacks cannot build remotely and stop after finite candidates", () => {
  const { kernel, unit } = fixture(100);
  const wall = Array.from({ length: 32 }, (_, y) =>
    spawnEntity(kernel, 3, obstruction, {
      definition: obstruction.id,
      force: 0,
      x: 14 * 1024,
      y: y * 1024,
      facing: 16384,
    }),
  );
  const site = build(kernel, [unit]);
  until(kernel, () => kernel.world.get(unit, ConstructionApproach, "state") === 2);
  expect(kernel.world.get(site, ConstructionProgress, "completedTicks")).toBe(0);
  expect(kernel.world.has(unit, MoveIntent)).toBe(false);
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  kernel.world.destroy(wall[12] as number);
  expect(assist(kernel, site, [unit])).toBe("accepted");
  until(kernel, () => kernel.world.get(site, ConstructionProgress, "completedTicks") > 0);
});

test("zero-health builders cannot start or resume paid construction", () => {
  const { kernel, unit } = fixture();
  const site = build(kernel, [unit]);
  kernel.world.set(unit, Health, "current", 0);
  expect(assist(kernel, site, [unit])).toBe("bad_payload");
  expect(
    step(kernel, [
      {
        tick: kernel.tick,
        sequence: 0,
        seat: 1,
        type: "economy.build",
        payload: {
          force: 0,
          definition: structure.id,
          builders: [unit],
          x: 15 * 1024,
          y: 15 * 1024,
          facing: 16384,
        },
      },
    ])[0]?.result,
  ).toBe("bad_payload");
  expect(kernel.economy?.balance(0)?.credits).toBe(4900);
  expect(kernel.world.query(ConstructionSite)).toEqual([site]);
});
