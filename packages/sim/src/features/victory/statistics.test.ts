import { expect, test } from "bun:test";
import { strict as assert } from "node:assert";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing";
import { applyWarhead } from "../combat/damage";
import { ConstructionRequest } from "../construction";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import {
  ControllerStatistics,
  ForceStatistics,
  MAX_STAT_SAMPLES,
  STAT_COUNTERS,
  StatisticsSample,
  StatisticsSeries,
} from "./statistics";

function fixture(configure?: (setup: MatchSetup) => MatchSetup) {
  let setup: MatchSetup = {
    debug: false,
    seed: 1,
    map: {
      ...flatMap(48),
      spawns: [0, 1, 2].map((force) => ({
        id: `s${force}`,
        position: [(8 + force * 12) * 1024, 10 * 1024] as const,
        facing: 0,
      })),
    },
    definitions: [
      {
        id: "structure:stats/hq",
        role: "headquarters",
        footprint: [1, 1],
        health: 100,
        speed: 0,
        turnRate: 0,
      },
      {
        id: "unit:stats/builder",
        role: "builder",
        health: 20,
        speed: 100,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 128,
        pop: 1,
      },
    ],
    forces: [0, 1, 2].map((index) => ({ index, faction: "faction:stats" })),
    seats: [1, 2, 3, 9],
    grants: [0, 1, 2].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["economy.build", "unit.orders", "surrender"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 8 } },
      settings: { startingCredits: 100, popCap: 100, structureCap: 100, fog: "off" },
      forces: [0, 1, 2].map((index) => ({
        index,
        team: index % 2,
        spawn: `s${index}`,
        start: {
          structures: ["structure:stats/hq"],
          units: [{ unit: "unit:stats/builder", role: "builder", pop: 1, count: 1 }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  setup = configure?.(setup) ?? setup;
  const kernel = createMatch(setup);
  const statistics = kernel.statistics,
    bank = kernel.economy;
  assert(statistics && bank);
  const counters = (force: number) => {
    const entry = statistics.snapshot(force + 1)[0];
    assert(entry);
    return entry.counters;
  };
  return { kernel, setup, counters, statistics, bank };
}

test("earned, paid and refunded resources are separate canonical counters; refusals stay atomic", () => {
  const { kernel, counters, bank } = fixture();
  expect(Object.values(counters(0)).every((value) => value === 0)).toBe(true);
  bank.gain(0, { credits: 11, materials: 2 });
  bank.spend(1, 0, { credits: 9, materials: 1 }, "economy.build");
  bank.refund(0, { credits: 5 });
  expect(counters(0)).toMatchObject({
    creditsGathered: 11,
    creditsSpent: 9,
    creditsRefunded: 5,
    materialsGathered: 2,
    materialsSpent: 1,
    unitsBuilt: 0,
    structuresBuilt: 0,
  });
  const before = checkpointHash(kernel);
  expect(bank.spend(1, 0, { credits: 999 }, "economy.build").ok).toBe(false);
  expect(checkpointHash(kernel)).toBe(before);
  const empty = { credits: 0, materials: 0, "industrial-capacity": 0, "salvage-points": 0 };
  bank.gain(1, { credits: 0x7fffffff - 100 });
  const refundBefore = counters(0).creditsRefunded;
  expect(
    bank.refundBatch([
      { force: 0, resources: { ...empty, credits: 7 } },
      { force: 1, resources: { ...empty, credits: 1 } },
    ]).ok,
  ).toBe(false);
  expect(counters(0).creditsRefunded).toBe(refundBefore);
});

test("damage records actual clamped loss once and awards kills only against another team", () => {
  const { kernel, setup, counters } = fixture();
  const actors = kernel.world
    .query(Template, OwnerForce)
    .filter((id) => kernel.world.get(id, Template, "definition") === 1);
  const target = (force: number) =>
    actors.find((id) => kernel.world.get(id, OwnerForce, "force") === force) as number;
  const hit = (force: number, radiusSubcells = 0) => {
    const entity = target(force),
      x = kernel.world.get(entity, Transform, "x"),
      y = kernel.world.get(entity, Transform, "y");
    applyWarhead(
      kernel,
      setup.definitions,
      {
        id: "stats",
        targets: ["ground"],
        rangeSubcells: [0, 100000],
        reloadTicks: 1,
        projectile: { kind: "instant" },
        warheads: [],
      },
      { type: "damage", amount: 999, radiusSubcells, tags: [] },
      { force: 0, direct: entity, x, y, fromX: x, fromY: y, air: false, maxLevel: 255 },
      true,
    );
  };
  hit(1);
  hit(1);
  expect(counters(0)).toMatchObject({ damageDealt: 20, unitsDestroyed: 1 });
  expect(counters(1)).toMatchObject({ damageTaken: 20, unitsLost: 1 });
  // Friendly splash can cause losses but cannot earn an enemy destruction.
  hit(2, 1);
  expect(counters(0).unitsDestroyed).toBe(1);
  expect(counters(2).unitsLost).toBe(1);
  step(
    kernel,
    [0, 2].map((force) => ({
      tick: 0,
      seat: force + 1,
      sequence: force,
      type: "match.surrender",
      payload: { force },
    })),
  );
  const types = kernel.statistics!.snapshot(1);
  expect(
    types
      .find((row) => row.force === 0)
      ?.details?.types.find((type) => type.definition === "unit:stats/builder")?.destroyed,
  ).toBe(1);
  expect(
    types
      .find((row) => row.force === 1)
      ?.details?.types.find((type) => type.definition === "unit:stats/builder")?.lost,
  ).toBe(1);
});

test("live statistics are private copied data and terminal totals freeze", () => {
  const { kernel, setup, statistics } = fixture();
  const view = createProjection(setup, 1, "controlled");
  expect(view.snapshot(kernel).statistics?.map((entry) => entry.force)).toEqual([0]);
  expect(createProjection(setup, 9, "controlled").snapshot(kernel).statistics).toEqual([]);
  statistics.record(0, "unitsBuilt", 0xffffffff);
  statistics.record(0, "unitsBuilt");
  expect(view.snapshot(kernel).statistics?.[0]?.counters.unitsBuilt).toBe(0xffffffff);
  kernel.captureObservations?.();
  const copy = kernel.observe?.(1)?.statistics?.[0];
  assert(copy);
  expect(copy.counters.unitsBuilt).toBe(0xffffffff);
  copy.counters.unitsBuilt = 0;
  expect(view.snapshot(kernel).statistics?.[0]?.counters.unitsBuilt).toBe(0xffffffff);
  const outcomes = step(
    kernel,
    [0, 2].map((force) => ({
      tick: kernel.tick,
      seat: force + 1,
      sequence: force,
      type: "match.surrender",
      payload: { force },
    })),
  );
  expect(outcomes.map((entry) => entry.result)).toEqual(["accepted", "accepted"]);
  expect(kernel.victory?.ended).toBe(true);
  const final = view.snapshot(kernel).statistics;
  expect(final?.map((entry) => entry.force)).toEqual([0, 1, 2]);
  statistics.record(0, "unitsBuilt");
  expect(view.snapshot(kernel).statistics).toEqual(final);
  expect(Object.keys(ForceStatistics.fields).length).toBe(STAT_COUNTERS.length + 1);
  const observed = kernel.observe?.(1)?.statistics?.[0]?.details;
  assert(observed);
  observed.history[0]!.values.credits = 999;
  expect(view.snapshot(kernel).statistics?.[0]?.details?.history[0]?.values.credits).toBe(100);
});

test("accepted mixed attacks credit eligible acting Forces, excluding unarmed selected units and the target", () => {
  const armed: Definition = {
    id: "unit:stats/armed",
    armor: "infantry",
    health: 100,
    speed: 100,
    turnRate: 65536,
    domain: "foot",
    radiusSubcells: 128,
    weapons: [
      {
        id: "gun",
        targets: ["ground"],
        rangeSubcells: [0, 1024],
        reloadTicks: 20,
        projectile: { kind: "instant" },
        warheads: [{ type: "damage", amount: 1, tags: [] }],
      },
    ],
  };
  const { kernel, setup } = fixture((setup) => ({
    ...setup,
    definitions: [...setup.definitions, armed],
    grants: [...setup.grants, { seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 }],
  }));
  const world = kernel.world;
  const unit = (force: number) =>
    world
      .query(Template, OwnerForce)
      .find(
        (id) =>
          world.get(id, Template, "definition") === 1 &&
          world.get(id, OwnerForce, "force") === force,
      )!;
  const actor = spawnEntity(kernel, 2, setup.definitions[2]!, {
    definition: armed.id,
    force: 1,
    x: 25 * 1024 + 512,
    y: 15 * 1024 + 512,
    facing: 0,
  });
  expect(
    step(kernel, [
      {
        tick: 0,
        seat: 1,
        sequence: 0,
        type: "unit.attack",
        payload: { entities: [unit(0), actor], entity: unit(2) },
      },
    ])[0]?.result,
  ).toBe("accepted");
  const count = (force: number) =>
    world
      .query(ControllerStatistics)
      .filter(
        (id) =>
          world.get(id, ControllerStatistics, "force") === force &&
          world.get(id, ControllerStatistics, "seat") === 1,
      )
      .reduce((n, id) => n + world.get(id, ControllerStatistics, "orders"), 0);
  expect(count(0)).toBe(0);
  expect(count(1)).toBe(1);
  expect(count(2)).toBe(0);
});

test("cleanup accepted after headquarters defeat cannot inflate that Force's frozen order APM", () => {
  const { kernel } = fixture((setup) => ({
    ...setup,
    definitions: [
      setup.definitions[0]!,
      { ...setup.definitions[1]!, builds: ["structure:stats/reactor"] },
      {
        id: "structure:stats/reactor",
        role: "power",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        construction: { cost: { credits: 10 }, buildTicks: 100 },
      },
    ],
    normal: {
      ...setup.normal!,
      settings: { ...setup.normal!.settings, elimination: "headquarters" },
    },
  }));
  const world = kernel.world,
    own = (definition: number) =>
      world
        .query(Template, OwnerForce)
        .find(
          (id) =>
            world.get(id, Template, "definition") === definition &&
            world.get(id, OwnerForce, "force") === 0,
        )!;
  const hq = own(0),
    builder = own(1);
  let hit = false;
  kernel.systems.combat.push(() => {
    if (!hit) {
      world.set(hq, Health, "current", 0);
      hit = true;
    }
  });
  expect(
    step(kernel, [
      {
        tick: 0,
        seat: 1,
        sequence: 0,
        type: "economy.build",
        payload: {
          builders: [builder],
          definition: "structure:stats/reactor",
          force: 0,
          x: Math.floor(world.get(builder, Transform, "x") / 1024) * 1024,
          y: Math.floor(world.get(builder, Transform, "y") / 1024) * 1024,
          facing: 16384,
        },
      },
    ])[0]?.result,
  ).toBe("accepted");
  const request = world.query(ConstructionRequest)[0]!;
  const counter = world
    .query(ControllerStatistics)
    .find(
      (id) =>
        world.get(id, ControllerStatistics, "force") === 0 &&
        world.get(id, ControllerStatistics, "seat") === 1,
    )!;
  expect(kernel.victory?.ended).toBe(false);
  expect(world.isAlive(request)).toBe(true);
  const orders = world.get(counter, ControllerStatistics, "orders");
  expect(
    step(kernel, [
      {
        tick: kernel.tick,
        seat: 1,
        sequence: 1,
        type: "economy.cancelConstruction",
        payload: { entity: request },
      },
    ])[0]?.result,
  ).toBe("accepted");
  expect(world.get(counter, ControllerStatistics, "orders")).toBe(orders);
});

test("queued work counts at admission once and rejected inputs do not change order counts", () => {
  const { kernel } = fixture();
  const world = kernel.world,
    actor = world
      .query(Template, OwnerForce)
      .find(
        (id) =>
          world.get(id, Template, "definition") === 1 && world.get(id, OwnerForce, "force") === 0,
      )!;
  const row = world
    .query(ControllerStatistics)
    .find(
      (id) =>
        world.get(id, ControllerStatistics, "force") === 0 &&
        world.get(id, ControllerStatistics, "seat") === 1,
    )!;
  const command = (sequence: number, seat = 1) => ({
    tick: 0,
    seat,
    sequence,
    type: "unit.move",
    payload: { entities: [actor], x: 12 * 1024 + 512, y: 14 * 1024 + 512, append: 1 },
  });
  expect(step(kernel, [command(0), command(1, 2)])[0]?.result).toBe("accepted");
  expect(world.get(row, ControllerStatistics, "orders")).toBe(1);
  for (let i = 0; i < 100; i++) step(kernel, []);
  expect(world.get(row, ControllerStatistics, "orders")).toBe(1);
});

test("same-tick surrender counts once while subsequent accepted cleanup cannot add an order", () => {
  const { kernel } = fixture((setup) => ({
    ...setup,
    definitions: [
      setup.definitions[0]!,
      { ...setup.definitions[1]!, builds: ["structure:stats/reactor"] },
      {
        id: "structure:stats/reactor",
        role: "power",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        construction: { cost: { credits: 10 }, buildTicks: 100 },
      },
    ],
  }));
  const world = kernel.world,
    builder = world
      .query(Template, OwnerForce)
      .find(
        (id) =>
          world.get(id, Template, "definition") === 1 && world.get(id, OwnerForce, "force") === 0,
      )!;
  expect(
    step(kernel, [
      {
        tick: 0,
        seat: 1,
        sequence: 0,
        type: "economy.build",
        payload: {
          builders: [builder],
          definition: "structure:stats/reactor",
          force: 0,
          x: Math.floor(world.get(builder, Transform, "x") / 1024) * 1024,
          y: Math.floor(world.get(builder, Transform, "y") / 1024) * 1024,
          facing: 16384,
        },
      },
    ])[0]?.result,
  ).toBe("accepted");
  const request = world.query(ConstructionRequest)[0]!;
  const row = world
    .query(ControllerStatistics)
    .find(
      (id) =>
        world.get(id, ControllerStatistics, "force") === 0 &&
        world.get(id, ControllerStatistics, "seat") === 1,
    )!;
  const before = world.get(row, ControllerStatistics, "orders");
  expect(
    step(kernel, [
      { tick: kernel.tick, seat: 1, sequence: 1, type: "match.surrender", payload: { force: 0 } },
      {
        tick: kernel.tick,
        seat: 1,
        sequence: 2,
        type: "economy.cancelConstruction",
        payload: { entity: request },
      },
    ]).map((entry) => entry.result),
  ).toEqual(["accepted", "accepted"]);
  expect(world.get(row, ControllerStatistics, "orders")).toBe(before + 1);
});

test("bounded history coarsens while preserving initialization and the latest regular sample", () => {
  const { kernel, statistics } = fixture();
  for (let i = 1; i <= MAX_STAT_SAMPLES; i++) statistics.sample(i * 600);
  const world = kernel.world;
  const samples = world
    .query(StatisticsSample)
    .filter((id) => world.get(id, StatisticsSample, "force") === 0);
  expect(samples.length).toBeLessThanOrEqual(MAX_STAT_SAMPLES);
  expect(world.get(samples[0]!, StatisticsSample, "tick")).toBe(0);
  expect(world.get(samples.at(-1)!, StatisticsSample, "tick")).toBe(MAX_STAT_SAMPLES * 600);
  const clock = world
    .query(StatisticsSeries)
    .find((id) => world.get(id, StatisticsSeries, "force") === 0)!;
  expect(world.get(clock, StatisticsSeries, "interval")).toBe(1200);
});
