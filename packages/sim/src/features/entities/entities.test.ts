import { describe, expect, test } from "bun:test";
import type { Command } from "../../commands";
import { createKernel, register, step } from "../../kernel";
import { entitiesFeature, Health, OwnerForce, Template, Transform, toDefinition } from ".";

const TANK = toDefinition({
  id: "unit:eastern-collective/dragon-tank",
  health: 900,
  movement: { speed: 1.8, turnRate: 80 },
});
const FACTORY = toDefinition({ id: "structure:eastern-collective/war-factory", health: 2400 });

const command = (sequence: number, type: string, payload: object, tick = 0) =>
  ({ tick, seat: 1, sequence, type, payload }) as Command;

const spawn = (sequence: number, definition: string, force = 2) =>
  command(sequence, "debug.spawn", { definition, force, x: 5120, y: 3072, facing: 0x4000 });

function setup() {
  const kernel = createKernel({ seed: 1, debug: true });
  register(kernel, entitiesFeature([FACTORY, TANK]));
  return kernel;
}

describe("toDefinition", () => {
  test("converts cells and degrees per second to subcells and angle units per tick, rounded once", () => {
    expect(TANK).toEqual({ ...TANK, speed: 92, turnRate: 728 }); // 1.8 × 1,024 / 20; 80 × 65,536 / 7,200
    expect(FACTORY).toEqual({ ...FACTORY, health: 2400, speed: 0 });
    const infantry = toDefinition({ id: "unit:x/y", health: 1, movement: { speed: 1 } });
    expect(infantry.turnRate).toBe(0x10000); // no turn rate: any turn within one tick
  });
});

describe("debug commands", () => {
  test("spawn any definition for any Force, with its health, and refuse unknown definitions", () => {
    const kernel = setup();
    const entries = step(kernel, [
      spawn(0, TANK.id, 7),
      spawn(1, FACTORY.id, 3),
      spawn(2, "unit:eastern-collective/nope"),
    ]);
    expect(entries.map((e) => e.result)).toEqual(["accepted", "accepted", "bad_payload"]);
    const { world } = kernel;
    expect(world.query(Template)).toEqual([1, 2]);
    expect([1, 2].map((id) => world.get(id, Template, "definition"))).toEqual([1, 0]);
    expect([1, 2].map((id) => world.get(id, OwnerForce, "force"))).toEqual([7, 3]);
    expect([1, 2].map((id) => world.get(id, Health, "current"))).toEqual([900, 2400]);
    expect(world.get(1, Transform, "x")).toBe(5120);
    expect(world.get(1, Transform, "y")).toBe(3072);
    expect(world.get(1, Transform, "facing")).toBe(0x4000);
  });

  test("set health, kill at 0 and remove, refusing entities that are gone", () => {
    const kernel = setup();
    step(kernel, [spawn(0, TANK.id), spawn(1, TANK.id), spawn(2, FACTORY.id)]);
    const entries = step(kernel, [
      command(0, "debug.setHealth", { entity: 1, health: 5 }, 1),
      command(1, "debug.setHealth", { entity: 2, health: 0 }, 1),
      command(2, "debug.remove", { entity: 3 }, 1),
      command(3, "debug.remove", { entity: 3 }, 1),
      command(4, "debug.setHealth", { entity: 2, health: 1 }, 1),
    ]);
    expect(entries.map((e) => e.result)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "bad_payload",
      "bad_payload",
    ]);
    expect(kernel.world.query()).toEqual([1]);
    expect(kernel.world.get(1, Health, "current")).toBe(5);
  });
});
