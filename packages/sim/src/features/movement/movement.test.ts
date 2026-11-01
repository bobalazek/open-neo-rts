import { describe, expect, test } from "bun:test";
import { type Command, type Grant, SYSTEM_SEAT } from "../../commands";
import { checkpointHash, createKernel, type Kernel, register, step } from "../../kernel";
import { createCommandLog } from "../../testing";
import { entitiesFeature, Transform, toDefinition } from "../entities";
import { MoveIntent, movementFeature } from ".";

const TANK = toDefinition({
  id: "unit:eastern-collective/dragon-tank",
  health: 900,
  movement: { speed: 1.8, turnRate: 80 }, // 92 subcells and 728 angle units per tick
});
const SOLDIER = toDefinition({
  id: "unit:eastern-collective/collective-soldier",
  health: 100,
  movement: { speed: 1.2 }, // 61 subcells per tick, turns at once
});
const FACTORY = toDefinition({ id: "structure:eastern-collective/war-factory", health: 2400 });
const DEFINITIONS = [TANK, SOLDIER, FACTORY];

const GRANTS: Grant[] = [
  { seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
  { seat: 2, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 },
];

const CELL = 1024;

const command = (tick: number, seat: number, sequence: number, type: string, payload: object) =>
  ({ tick, seat, sequence, type, payload }) as Command;

function setup(seed = 1): Kernel {
  const kernel = createKernel({ seed, debug: true });
  register(kernel, entitiesFeature(DEFINITIONS));
  register(kernel, movementFeature({ definitions: DEFINITIONS, grants: GRANTS }));
  return kernel;
}

function run(kernel: Kernel, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(kernel, []);
}

const position = ({ world }: Kernel, id: number) => [
  world.get(id, Transform, "x"),
  world.get(id, Transform, "y"),
  world.get(id, Transform, "facing"),
];

describe("unit.move", () => {
  test("reaches its target in distance / speed ticks, rounded up, and stops exactly there", () => {
    const kernel = setup();
    const { spawn, move } = createCommandLog();
    step(kernel, [
      spawn(0, SYSTEM_SEAT, TANK.id, 1, 10 * CELL, 10 * CELL),
      move(0, 1, [1], 20 * CELL, 10 * CELL),
    ]);
    run(kernel, 110); // 10 cells at 92 subcells per tick: 112 ticks
    expect(position(kernel, 1)).toEqual([10 * CELL + 111 * 92, 10 * CELL, 0]);
    expect(kernel.world.has(1, MoveIntent)).toBe(true);
    run(kernel, 1);
    expect(position(kernel, 1)).toEqual([20 * CELL, 10 * CELL, 0]);
    expect(kernel.world.has(1, MoveIntent)).toBe(false);
    run(kernel, 10);
    expect(position(kernel, 1)).toEqual([20 * CELL, 10 * CELL, 0]);
  });

  test("turns in place the shorter way at its turn rate, then advances", () => {
    const kernel = setup();
    const { spawn, move } = createCommandLog();
    const at = 10 * CELL;
    step(kernel, [
      spawn(0, SYSTEM_SEAT, TANK.id, 1, at, at),
      spawn(0, SYSTEM_SEAT, TANK.id, 1, at, at),
      spawn(0, SYSTEM_SEAT, TANK.id, 1, at, at),
      spawn(0, SYSTEM_SEAT, SOLDIER.id, 1, at, at),
      move(0, 1, [1], at, 0), // a quarter turn clockwise
      move(0, 1, [2], at, 2 * at), // a quarter turn counter-clockwise
      move(0, 1, [3], 0, at), // exactly opposite: clockwise
      move(0, 1, [4], at, 0),
    ]);
    expect(position(kernel, 1)).toEqual([at, at, 0x10000 - 728]);
    expect(position(kernel, 2)).toEqual([at, at, 728]);
    expect(position(kernel, 3)).toEqual([at, at, 0x10000 - 728]);
    expect(position(kernel, 4)).toEqual([at, at - 61, 0xc000]); // no turn rate: turns and moves at once
    run(kernel, 21);
    expect(position(kernel, 1)).toEqual([at, at, 0x10000 - 22 * 728]);
    run(kernel, 1); // 0x4000 / 728 rounds up to 23 ticks of turning; the last one also advances
    expect(position(kernel, 1)).toEqual([at, at - 92, 0xc000]);
  });

  test("goes straight to a diagonal target and arrives exactly", () => {
    const kernel = setup();
    const { spawn, move } = createCommandLog();
    step(kernel, [
      spawn(0, SYSTEM_SEAT, SOLDIER.id, 1, 3 * CELL, 50 * CELL),
      move(0, 1, [1], 40 * CELL + 7, 21 * CELL + 3),
    ]);
    run(kernel, 1000);
    expect(position(kernel, 1).slice(0, 2)).toEqual([40 * CELL + 7, 21 * CELL + 3]);
    expect(kernel.world.has(1, MoveIntent)).toBe(false);
  });

  test("replaces the current order; unit.stop drops it", () => {
    const kernel = setup();
    const { spawn, move, stop } = createCommandLog();
    step(kernel, [
      spawn(0, SYSTEM_SEAT, SOLDIER.id, 1, 10 * CELL, 10 * CELL),
      move(0, 1, [1], 20 * CELL, 10 * CELL),
    ]);
    step(kernel, [move(1, 1, [1], 10 * CELL, 20 * CELL)]);
    expect(position(kernel, 1).slice(0, 2)).toEqual([10 * CELL + 61, 10 * CELL + 61]);
    step(kernel, [stop(2, 1, [1])]);
    run(kernel, 5);
    expect(position(kernel, 1).slice(0, 2)).toEqual([10 * CELL + 61, 10 * CELL + 61]);
    expect(kernel.world.has(1, MoveIntent)).toBe(false);
  });

  test("rejects the whole order unless the seat holds unit.orders on every unit's Force", () => {
    const kernel = setup();
    const { spawn, move, stop } = createCommandLog();
    step(kernel, [
      spawn(0, SYSTEM_SEAT, TANK.id, 1, 10 * CELL, 10 * CELL),
      spawn(0, SYSTEM_SEAT, TANK.id, 2, 30 * CELL, 10 * CELL),
      spawn(0, SYSTEM_SEAT, FACTORY.id, 1, 20 * CELL, 20 * CELL),
    ]);
    const target = 5 * CELL;
    const entries = step(kernel, [
      move(1, 3, [1], target, target), // no grant at all
      move(1, 2, [1], target, target), // another Force's unit
      move(1, 1, [1, 2], target, target), // one of them is another Force's
      stop(1, 3, [2]),
      move(1, 1, [1, 3, 99], target, target), // structures ignore it, gone units are skipped
      move(1, SYSTEM_SEAT, [2], target, target),
    ]);
    expect(entries.map((e) => e.result)).toEqual([
      "no_grant",
      "no_grant",
      "no_grant",
      "no_grant",
      "accepted",
      "accepted",
    ]);
    expect(kernel.world.query(MoveIntent)).toEqual([1, 2]);
    expect(kernel.world.get(1, MoveIntent, "x")).toBe(target);
  });
});

/** Two Forces skirmish-walk across the map with stops, re-orders, a rejected order and debug commands. */
function script(tick: number): Command[] {
  const { spawn, move, stop } = createCommandLog();
  switch (tick) {
    case 0:
      return [
        spawn(0, SYSTEM_SEAT, TANK.id, 1, 10 * CELL, 10 * CELL),
        spawn(0, SYSTEM_SEAT, SOLDIER.id, 1, 12 * CELL, 10 * CELL),
        spawn(0, SYSTEM_SEAT, TANK.id, 2, 80 * CELL, 80 * CELL, 0x8000),
        spawn(0, SYSTEM_SEAT, SOLDIER.id, 2, 78 * CELL, 80 * CELL, 0x8000),
        spawn(0, SYSTEM_SEAT, FACTORY.id, 2, 84 * CELL, 84 * CELL),
      ];
    case 1:
      return [
        move(1, 1, [1, 2], 40 * CELL, 50 * CELL + 333),
        move(1, 2, [3, 4], 40 * CELL, 40 * CELL),
        move(1, 2, [1], 0, 0),
      ];
    case 60:
      return [stop(60, 2, [4])];
    case 120:
      return [move(120, 1, [2], 20 * CELL + 5, 81 * CELL - 9)];
    case 150:
      return [
        command(150, 1, 0, "debug.setHealth", { entity: 3, health: 450 }),
        command(150, 1, 1, "debug.remove", { entity: 5 }),
      ];
    case 200:
      return [move(200, 2, [4, 3], 10 * CELL, 10 * CELL)];
    default:
      return [];
  }
}

function play(seed: number): Kernel {
  const kernel = setup(seed);
  for (let t = 0; t < 300; t++) step(kernel, script(t));
  return kernel;
}

describe("determinism", () => {
  test("two kernels with the same inputs reach the same checkpoints", () => {
    const [a, b] = [play(1), play(1)];
    expect(a.checkpoints.map((c) => c.tick)).toEqual([100, 200, 300]);
    expect(b.checkpoints).toEqual(a.checkpoints);
    expect(b.world.serialize()).toEqual(a.world.serialize());
  });

  test("golden hashes for a 300-tick scripted two-Force run", () => {
    const kernel = play(1);
    expect(kernel.checkpoints).toEqual([
      { tick: 100, hash: "8cff891f90db636d" },
      { tick: 200, hash: "cab7bea3cbcacb3b" },
      { tick: 300, hash: "b67353abffe4854c" },
    ]);
    expect(checkpointHash(kernel)).toBe(kernel.checkpoints[2]?.hash ?? "");
    expect(kernel.log.map((e) => e.result).filter((r) => r !== "accepted")).toEqual(["no_grant"]);
  });
});
