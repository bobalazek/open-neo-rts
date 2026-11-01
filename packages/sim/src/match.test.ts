import { expect, test } from "bun:test";
import { OwnerForce, Template, Transform } from "./features/entities";
import { MoveIntent } from "./features/movement";
import { step } from "./kernel";
import { createMatch, type MatchSetup } from "./match";

const setup: MatchSetup = {
  seed: 1,
  debug: true,
  forces: [{ index: 2, faction: "faction:eastern-collective" }],
  seats: [1],
  grants: [{ seat: 1, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 }],
  definitions: [
    { id: "unit:eastern-collective/dragon-tank", health: 900, speed: 92, turnRate: 728 },
  ],
};

test("registers entities before movement and gives movement the setup grants and definitions", () => {
  const kernel = createMatch(setup);
  expect([...kernel.handlers.keys()]).toEqual([
    "debug.spawn",
    "debug.setHealth",
    "debug.remove",
    "unit.move",
    "unit.stop",
  ]);
  expect(kernel.world.query(Template)).toEqual([]);
  step(kernel, [
    {
      tick: 0,
      sequence: 0,
      seat: 0,
      type: "debug.spawn",
      payload: { definition: setup.definitions[0]?.id, force: 2, x: 0, y: 0, facing: 0 },
    },
    { tick: 0, sequence: 1, seat: 1, type: "unit.move", payload: { entities: [1], x: 1024, y: 0 } },
  ]);
  expect(kernel.world.get(1, OwnerForce, "force")).toBe(2);
  expect(kernel.world.get(1, Transform, "x")).toBe(92);
  expect(kernel.world.has(1, MoveIntent)).toBe(true);
  expect(createMatch(setup).world.query(Template)).toEqual([]);
});
