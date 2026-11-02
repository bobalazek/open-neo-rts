import { expect, test } from "bun:test";
import { strict as assert } from "node:assert";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing";
import { applyWarhead } from "../combat/damage";
import { OwnerForce, Template, Transform } from "../entities";
import { ForceStatistics, STAT_COUNTERS } from "./statistics";

function fixture() {
  const setup: MatchSetup = {
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
});
