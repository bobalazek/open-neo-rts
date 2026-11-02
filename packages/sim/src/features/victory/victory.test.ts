import { expect, test } from "bun:test";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing/maps";
import { Health, OwnerForce, spawnEntity, Template } from "../entities";
import type { EliminationRule } from ".";

function fixture(rule: EliminationRule = "annihilation", teams = [0, 1], shared = false) {
  const setup: MatchSetup = {
    seed: 3,
    debug: false,
    map: {
      ...flatMap(40),
      spawns: teams.map((_, index) => ({
        id: `spawn-${index}`,
        position: [(6 + index * 10) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    definitions: [
      {
        id: "structure:victory/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:victory/builder",
        role: "builder",
        health: 10,
        speed: 100,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
      {
        id: "structure:victory/wall",
        role: "wall",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
      },
    ],
    forces: teams.map((_, index) => ({ index, faction: "faction:victory" })),
    seats: [...teams.map((_, index) => index + 1), ...(shared ? [9] : [])],
    grants: [
      ...teams.map((_, force) => ({
        seat: force + 1,
        force,
        scopes: ["unit.orders", "surrender"] as const,
        grantedAtTick: 0,
      })),
      ...(shared ? [{ seat: 9, force: 0, scopes: ["surrender"] as const, grantedAtTick: 0 }] : []),
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 8 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150, elimination: rule },
      forces: teams.map((team, index) => ({
        index,
        team,
        spawn: `spawn-${index}`,
        start: {
          structures: ["structure:victory/headquarters"],
          units: [{ unit: "unit:victory/builder", count: 1, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const actors = (force: number) =>
    kernel.world
      .query(Template, OwnerForce)
      .filter((id) => kernel.world.get(id, OwnerForce, "force") === force);
  const kill = (force: number, definition?: number) => {
    for (const id of actors(force))
      if (definition === undefined || kernel.world.get(id, Template, "definition") === definition)
        kernel.world.set(id, Health, "current", 0);
  };
  const surrender = (seat: number, force = 0) =>
    step(kernel, [
      { tick: kernel.tick, seat, sequence: 0, type: "match.surrender", payload: { force } },
    ])[0]?.result;
  return { setup, kernel, actors, kill, surrender };
}

test("annihilation retains builders after HQ loss, excludes walls, and records one terminal team result", () => {
  const f = fixture();
  f.kill(0, 0);
  step(f.kernel, []);
  expect(f.kernel.victory?.snapshot().result).toBeNull();
  const wall = f.setup.definitions[2];
  if (!wall) throw new Error("Missing wall");
  spawnEntity(f.kernel, 2, wall, {
    definition: wall.id,
    force: 0,
    x: 12 * 1024,
    y: 12 * 1024,
    facing: 16384,
  });
  f.kill(0, 1);
  step(f.kernel, []);
  expect(f.kernel.victory?.snapshot()).toMatchObject({
    forces: [
      { force: 0, reason: "eliminated", tick: 2 },
      { force: 1, reason: "active", tick: null },
    ],
    result: { winner: 1, reason: "lastManStanding", tick: 2 },
  });
  expect(f.actors(0)).toEqual([]);
  expect(f.kernel.checkpoints).toHaveLength(1);
  const hash = checkpointHash(f.kernel);
  expect(f.surrender(2, 1)).toBe("match_ended");
  expect(f.kernel.tick).toBe(2);
  expect(checkpointHash(f.kernel)).toBe(hash);
});

test("base and headquarters predicates remove defeated leftovers without waiting for their units", () => {
  for (const rule of ["baseDestruction", "headquarters"] as const) {
    const f = fixture(rule);
    f.kill(0, 0);
    step(f.kernel, []);
    expect(f.kernel.victory?.snapshot().result?.winner).toBe(1);
    expect(f.actors(0)).toEqual([]);
  }
});

test("same-tick mutual elimination is a draw; an ally keeps its team alive", () => {
  const f = fixture();
  f.kill(0);
  f.kill(1);
  step(f.kernel, []);
  expect(f.kernel.victory?.snapshot().result).toEqual({ winner: null, reason: "draw", tick: 1 });
  const g = fixture("annihilation", [0, 0, 1]);
  g.kill(0);
  step(g.kernel, []);
  expect(g.kernel.victory?.snapshot().result).toBeNull();
  g.kill(2);
  step(g.kernel, []);
  expect(g.kernel.victory?.snapshot().result?.winner).toBe(0);
});

test("surrender needs its current scope and all eligible co-controller votes; copied outcomes remain canonical", () => {
  const f = fixture("annihilation", [0, 1], true);
  expect(f.surrender(2)).toBe("no_grant");
  expect(f.surrender(1)).toBe("accepted");
  expect(f.kernel.victory?.snapshot().result).toBeNull();
  const twin = fixture("annihilation", [0, 1], true);
  twin.surrender(2);
  twin.surrender(1);
  expect(twin.surrender(9)).toBe("accepted");
  expect(f.surrender(9)).toBe("accepted");
  expect(checkpointHash(twin.kernel)).toBe(checkpointHash(f.kernel));
  const snapshot = createProjection(f.setup, 1, "controlled").snapshot(f.kernel);
  const copied = f.kernel.observe?.(1).victory;
  if (!copied) throw new Error("Missing victory observation");
  if (copied.forces[0]) copied.forces[0].reason = "active";
  expect(f.kernel.observe?.(1).victory).toEqual(snapshot.victory);
});
