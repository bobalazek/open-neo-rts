import { expect, test } from "bun:test";
import type { Command } from "../commands";
import { OwnerForce, Template } from "../features/entities";
import { emitCombatEvent } from "../features/events/combat";
import { checkpointHash, step } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { createProjection, createReplayProjection } from "../projection";
import { flatMap } from "../testing/maps";
import { createMatchRecord } from "./match-record";
import { createMatchPlayback, REPLAY_KEYFRAME_INTERVAL } from "./playback";

function fixture(end = 2505) {
  const setup: MatchSetup = {
    seed: 7,
    debug: false,
    map: {
      ...flatMap(32),
      spawns: [0, 1].map((i) => ({
        id: `s${i}`,
        position: [(6 + 12 * i) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    definitions: [
      {
        id: "structure:playback/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:playback/builder",
        role: "builder",
        health: 10,
        speed: 100,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
    ],
    forces: [0, 1].map((index) => ({ index, faction: "faction:playback" })),
    seats: [1, 2],
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["unit.orders", "surrender"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150 },
      bots: [{ seat: 2, kind: "idle" }],
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `s${index}`,
        start: {
          structures: ["structure:playback/headquarters"],
          units: [{ unit: "unit:playback/builder", count: 1, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const actor = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, Template, "definition") === 1 &&
        kernel.world.get(id, OwnerForce, "force") === 0,
    )!;
  const commands: Command[] = [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [actor], x: 14 * 1024 + 512, y: 14 * 1024 + 512 },
    },
    {
      tick: 1200,
      seat: 1,
      sequence: 1,
      type: "unit.move",
      payload: { entities: [actor], x: 15 * 1024 + 512, y: 15 * 1024 + 512 },
    },
    { tick: end - 1, seat: 1, sequence: 2, type: "match.surrender", payload: { force: 0 } },
  ];
  const hashes = new Map([[0, checkpointHash(kernel)]]);
  while (kernel.tick < end) {
    step(
      kernel,
      commands.filter((command) => command.tick === kernel.tick),
    );
    hashes.set(kernel.tick, checkpointHash(kernel));
  }
  return { setup, kernel, hashes, record: createMatchRecord(kernel, setup) };
}

test("bounded preparation and repeated keyframe seeking equal the uninterrupted host at every boundary", () => {
  const { setup, record, hashes } = fixture();
  const replay = createMatchPlayback(record, setup);
  expect(replay.verified).toBe(false);
  expect(replay.tick).toBe(0);
  expect(() => replay.kernel).toThrow("unfinished");
  expect(() => replay.seek(0)).toThrow("Verify");
  while (!replay.verified) {
    const before = replay.tick;
    replay.prepare(73);
    expect(replay.tick - before).toBeLessThanOrEqual(73);
  }
  expect(replay.prepare()).toBe(true);
  expect(replay.keyframeTicks).toEqual([0, 1200, 2400]);
  const ticks = replay.keyframeTicks;
  ticks.length = 0;
  expect(replay.keyframeTicks).toHaveLength(3);
  const atEnd = replay.kernel;
  for (const target of [0, 1, 1199, 1200, 1201, 2399, 2400, 2504, 2505, 1200, 0, 2505]) {
    let ready = replay.seek(target, 13);
    while (!ready) {
      expect(() => replay.kernel).toThrow("unfinished");
      const before = replay.tick;
      ready = replay.seek(target, 13);
      expect(replay.tick - before).toBeLessThanOrEqual(13);
    }
    expect(checkpointHash(replay.kernel)).toBe(hashes.get(target)!);
    expect(replay.kernel.controllers.size).toBe(1);
  }
  expect(replay.kernel).not.toBe(atEnd);
  expect(checkpointHash(atEnd)).toBe(record.hash);
  expect(createMatchRecord(replay.kernel, setup)).toEqual(record);
  expect(REPLAY_KEYFRAME_INTERVAL).toBe(1200);
  while (!replay.seek(1199, 1000)) {}
  const continuous = replay.kernel;
  expect(replay.seek(1200, 1)).toBe(true);
  expect(replay.kernel).toBe(continuous);
  expect(checkpointHash(replay.kernel)).toBe(hashes.get(1200)!);
});

test("the host owns the record/setup and a superseding seek ignores an unfinished destination", () => {
  const { setup, record, hashes } = fixture();
  (record.scenario.commands as Command[]).reverse();
  const replay = createMatchPlayback(record, setup);
  setup.seed = 99;
  record.scenario.setup.seed = 123;
  (record.scenario.commands as Command[]).length = 0;
  while (!replay.prepare(1000)) {}
  expect(checkpointHash(replay.kernel)).toBe(hashes.get(2505)!);
  expect(replay.seek(1199, 1)).toBe(false);
  expect(replay.tick).toBe(1);
  expect(replay.seek(2400, 1)).toBe(true);
  expect(replay.tick).toBe(2400);
  expect(checkpointHash(replay.kernel)).toBe(hashes.get(2400)!);
  expect(replay.seek(1199, 20)).toBe(false);
  expect(replay.seek(0, 20)).toBe(true);
  expect(checkpointHash(replay.kernel)).toBe(hashes.get(0)!);
});

test("invalid requests are atomic; corrupt input and false terminal claims cannot publish a host", () => {
  const { setup, record } = fixture(2);
  expect(() => createMatchPlayback(record, { ...setup, seed: 8 })).toThrow("installed");
  expect(() => createMatchPlayback({ ...record, tick: 144001 }, setup)).toThrow("limit");
  expect(() =>
    createMatchPlayback({ ...record, scenario: { ...record.scenario, simVersion: 999 } }, setup),
  ).toThrow("Invalid scenario");
  const replay = createMatchPlayback(record, setup);
  for (const budget of [0, -1, 1001, NaN, Infinity, 1.5]) {
    expect(() => replay.prepare(budget)).toThrow("batch");
    expect(replay.tick).toBe(0);
  }
  expect(replay.prepare(2)).toBe(true);
  const terminal = replay.kernel;
  for (const target of [-1, 3, NaN, Infinity, 1.5]) {
    expect(() => replay.seek(target)).toThrow("target");
    expect(replay.kernel).toBe(terminal);
  }
  for (const bad of [
    { ...record, tick: 3 },
    { ...record, hash: "0000000000000000" },
    {
      ...record,
      scenario: {
        ...record.scenario,
        commands: [
          { tick: 0, seat: 1, sequence: 3, type: "match.surrender", payload: { force: 1 } },
          ...record.scenario.commands,
        ],
      },
    },
  ]) {
    const invalid = createMatchPlayback(bad, setup);
    expect(() => invalid.prepare(10)).toThrow();
    expect(invalid.verified).toBe(false);
    expect(() => invalid.kernel).toThrow();
    expect(() => invalid.prepare(10)).toThrow();
    expect(() => invalid.seek(0)).toThrow();
  }
  const unfinished = createMatch(setup);
  const commands = record.scenario.commands.filter((command) => command.tick === 0);
  step(unfinished, commands);
  const notTerminal = createMatchPlayback(
    {
      ...record,
      tick: 1,
      hash: checkpointHash(unfinished),
      scenario: { ...record.scenario, commands },
    },
    setup,
  );
  expect(() => notTerminal.prepare()).toThrow("terminal tick and hash");
  expect(() => notTerminal.kernel).toThrow();
});

test("verified replay views are copied, read-only projections; ordinary seats retain fog and economy permissions", () => {
  const { setup, record } = fixture(2);
  const replay = createMatchPlayback(record, setup);
  expect(() => replay.snapshot("all")).toThrow("unfinished");
  replay.prepare();
  replay.seek(0);
  const kernel = replay.kernel,
    hash = checkpointHash(kernel);
  const ordinary = createProjection(setup, 1, "controlled").snapshot(kernel);
  const observer = replay.snapshot("all");
  expect(ordinary.entities.every((entity) => entity.force === 0)).toBe(true);
  expect(ordinary.banks).toEqual([]);
  expect(observer.entities.some((entity) => entity.force === 1)).toBe(true);
  expect(observer.banks?.map((bank) => bank.force)).toEqual([0, 1]);
  expect(observer.power?.map((bank) => bank.force)).toEqual([0, 1]);
  expect(observer.statistics?.map((bank) => bank.force)).toEqual([0, 1]);
  expect(observer.fog?.[0]?.cells.every((cell) => cell === 2)).toBe(true);
  expect(replay.snapshot(1)).toEqual(ordinary);
  expect(Object.keys(createReplayProjection(setup, "all"))).toEqual(["snapshot"]);
  expect(() => replay.snapshot(99)).toThrow("Unknown player");
  emitCombatEvent(kernel, { type: "damage", x: 18 * 1024, y: 8 * 1024, force: 1, amount: 5 });
  expect(replay.snapshot(1).combatEvents).toEqual([]);
  expect(replay.snapshot("all").combatEvents).toHaveLength(1);
  const own = observer.entities[0]!;
  const x = own.x;
  own.x = -1;
  (observer.banks![0]!.resources as Record<string, number>).credits = -1;
  observer.fog![0]!.cells.fill(0);
  const fresh = replay.snapshot("all");
  expect(fresh.entities[0]?.x).toBe(x);
  expect(fresh.banks?.[0]?.resources.credits).toBe(100);
  expect(fresh.fog?.[0]?.cells.every((cell) => cell === 2)).toBe(true);
  expect(checkpointHash(kernel)).toBe(hash);
  replay.seek(1);
  expect(replay.snapshot(1).tick).toBe(1);
  replay.seek(0);
  expect(replay.snapshot(1).entities).toEqual(ordinary.entities);
});
