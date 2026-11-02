import { describe, expect, test } from "bun:test";
import {
  createCommandLog,
  easternCollectiveTier1Definitions,
  flatMap,
  scriptedController,
} from "@open-neo-rts/sim/testing";
import { SYSTEM_SEAT, sortCommands, validateCommands } from "../commands";
import { Health, OwnerForce, Template, Transform } from "../features/entities";
import { MoveIntent } from "../features/movement";
import { registerController, step } from "../kernel";
import { createMatch } from "../match";

function match() {
  return createMatch({
    map: flatMap(),
    seed: 1,
    debug: true,
    forces: [{ index: 2, faction: "faction:eastern-collective" }],
    seats: [1],
    grants: [{ seat: 1, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 }],
    definitions: easternCollectiveTier1Definitions(),
  });
}

describe("Eastern Collective tier-1 definitions", () => {
  test("converts the original roster to integer sim units in stable ID order", () => {
    const definitions = easternCollectiveTier1Definitions();
    expect(definitions).toEqual([
      {
        id: "unit:eastern-collective/collective-soldier",
        tags: ["infantry"],
        pop: 1,
        role: "combat",
        health: 100,
        speed: 77,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 256,
        visionSubcells: 7168,
      },
      {
        id: "unit:eastern-collective/dragon-tank",
        tags: ["vehicle"],
        pop: 3,
        role: "combat",
        health: 900,
        speed: 92,
        turnRate: 65536,
        domain: "tracked",
        radiusSubcells: 870,
        visionSubcells: 8192,
      },
      {
        id: "unit:eastern-collective/drone-hunter",
        tags: ["infantry"],
        pop: 1,
        role: "combat",
        health: 100,
        speed: 72,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 256,
        visionSubcells: 8192,
      },
      {
        id: "unit:eastern-collective/field-technician",
        tags: ["infantry", "engineer"],
        pop: 1,
        role: "builder",
        health: 100,
        speed: 77,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 256,
        visionSubcells: 6144,
      },
      {
        id: "unit:eastern-collective/metamorphic-apc",
        tags: ["vehicle"],
        pop: 2,
        role: "transport",
        health: 600,
        speed: 133,
        turnRate: 65536,
        domain: "wheeled",
        radiusSubcells: 768,
        visionSubcells: 7168,
      },
      {
        id: "unit:eastern-collective/rocket-trooper",
        tags: ["infantry"],
        pop: 1,
        role: "combat",
        health: 100,
        speed: 67,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 256,
        visionSubcells: 7168,
      },
      {
        id: "unit:eastern-collective/supply-truck",
        tags: ["vehicle", "harvester"],
        harvestCapacity: 500,
        harvestAmountPerSecond: 5,
        pop: 0,
        role: "harvester",
        health: 900,
        speed: 82,
        turnRate: 65536,
        domain: "wheeled",
        radiusSubcells: 819,
        visionSubcells: 6144,
      },
    ]);
    const first = definitions[0];
    if (!first) throw new Error("Missing Collective Soldier definition");
    first.health = 1;
    expect(easternCollectiveTier1Definitions()[0]?.health).toBe(100);
  });
});

describe("command-log builders", () => {
  test("shares sequences across types and seats per tick, including revisiting a tick", () => {
    const { move, stop, spawn } = createCommandLog();
    const commands = [
      move(4, 1, [3, 1], 1024, 2048),
      stop(4, 2, [3]),
      spawn(0, SYSTEM_SEAT, "unit:eastern-collective/dragon-tank", 2, 0, 0),
      stop(4, 1, [1]),
    ];
    expect(commands).toEqual([
      {
        tick: 4,
        seat: 1,
        sequence: 0,
        type: "unit.move",
        payload: { entities: [3, 1], x: 1024, y: 2048 },
      },
      { tick: 4, seat: 2, sequence: 1, type: "unit.stop", payload: { entities: [3] } },
      {
        tick: 0,
        seat: 0,
        sequence: 0,
        type: "debug.spawn",
        payload: {
          definition: "unit:eastern-collective/dragon-tank",
          force: 2,
          x: 0,
          y: 0,
          facing: 0,
        },
      },
      { tick: 4, seat: 1, sequence: 2, type: "unit.stop", payload: { entities: [1] } },
    ]);
    expect(validateCommands(commands, { debug: true }).every((r) => r.accepted)).toBe(true);
    expect(sortCommands(commands).map((c) => [c.tick, c.sequence])).toEqual([
      [0, 0],
      [4, 0],
      [4, 1],
      [4, 2],
    ]);
    expect(createCommandLog().stop(4, 1, [1]).sequence).toBe(0);
  });

  test("copies entity lists so later script edits do not alter earlier commands", () => {
    const log = createCommandLog();
    const entities = [1, 2];
    const move = log.move(0, 1, entities, 0, 0);
    const stop = log.stop(1, 1, entities);
    entities.push(3);
    expect(move.payload).toEqual({ entities: [1, 2], x: 0, y: 0 });
    expect(stop.payload).toEqual({ entities: [1, 2] });
  });

  test("spawns N actual units through commands without advancing or mutating the world", () => {
    const kernel = match();
    const log = createCommandLog();
    const definition = easternCollectiveTier1Definitions()[1];
    if (!definition) throw new Error("Missing Dragon Tank definition");
    log.stop(0, 1, [99]);
    const army = log.spawnArmy(0, SYSTEM_SEAT, 3, definition.id, 2, 1024, 2048, 0x4000);
    expect(kernel.tick).toBe(0);
    expect(kernel.world.query()).toEqual([]);
    expect(army.map((c) => c.sequence)).toEqual([1, 2, 3]);
    expect(step(kernel, army).map((e) => e.result)).toEqual(["accepted", "accepted", "accepted"]);
    expect(kernel.world.query(Template)).toEqual([1, 2, 3]);
    for (const id of [1, 2, 3]) {
      expect(kernel.world.get(id, OwnerForce, "force")).toBe(2);
      expect(kernel.world.get(id, Health, "current")).toBe(definition.health);
      expect(kernel.world.get(id, Transform, "x")).toBe(1024);
      expect(kernel.world.get(id, Transform, "y")).toBe(2048);
      expect(kernel.world.get(id, Transform, "facing")).toBe(0x4000);
    }
    expect(match().world.query()).toEqual([]);
  });

  test("allows empty armies and refuses invalid counts before consuming sequences", () => {
    const log = createCommandLog();
    const id = "unit:eastern-collective/collective-soldier";
    expect(log.spawnArmy(0, 0, 0, id, 2, 0, 0)).toEqual([]);
    for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => log.spawnArmy(0, 0, count, id, 2, 0, 0)).toThrow(RangeError);
    expect(log.spawn(0, 0, id, 2, 0, 0).sequence).toBe(0);
  });
});

test("scripted controllers issue fixed commands at fixed ticks for next-tick execution", () => {
  const kernel = match();
  const log = createCommandLog();
  const move = log.move(0, 1, [1], 4096, 1024);
  const stop = log.stop(2, 1, [1]);
  const controller = scriptedController({ 0: [move], 2: [stop] });
  registerController(kernel, 1, controller);
  step(
    kernel,
    log.spawnArmy(0, SYSTEM_SEAT, 1, "unit:eastern-collective/collective-soldier", 2, 1024, 1024),
  );
  expect(kernel.world.get(1, Transform, "x")).toBe(1024);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  expect(step(kernel, []).map((e) => [e.source, e.result])).toEqual([["controller", "accepted"]]);
  expect(kernel.world.get(1, Transform, "x")).toBe(1101);
  step(kernel, []);
  expect(kernel.world.get(1, Transform, "x")).toBe(1178);
  step(kernel, []);
  expect(kernel.world.get(1, Transform, "x")).toBe(1178);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  expect(kernel.log.filter((e) => e.source === "controller").map((e) => e.tick)).toEqual([1, 3]);
  const view = { tick: 0, observation: { tick: 0, mode: "controlled" as const, entities: [] } };
  expect(controller(view)).toEqual([move]);
  expect(controller({ ...view, tick: 1 })).toEqual([]);
  expect(controller(view)).toEqual([move]);
});
