import { expect, test } from "bun:test";
import { step } from "../kernel";
import { createMatch } from "../match";
import { createProjection } from ".";

const setup = {
  seed: 1,
  debug: true,
  forces: [
    { index: 0, faction: "faction:eastern-collective" },
    { index: 1, faction: "faction:eastern-collective" },
  ],
  seats: [1, 2],
  grants: [
    { seat: 1, force: 0, scopes: ["unit.orders" as const], grantedAtTick: 0, expiresAtTick: 3 },
    { seat: 2, force: 1, scopes: ["unit.orders" as const], grantedAtTick: 0 },
  ],
  definitions: [
    { id: "unit:eastern-collective/dragon-tank", health: 900, speed: 92, turnRate: 65536 },
  ],
};

test("seat projection copies controlled entities and handles never expose enemy IDs", () => {
  const kernel = createMatch(setup);
  const a = createProjection(setup, 1, "controlled");
  const b = createProjection(setup, 2, "controlled");
  step(
    kernel,
    [0, 1].map((force) => ({
      tick: 0,
      seat: 1,
      sequence: force,
      type: "debug.spawn",
      payload: { definition: setup.definitions[0]?.id, force, x: 10, y: 20, facing: 0 },
    })),
  );
  const snapshot = a.snapshot(kernel);
  expect(snapshot.entities).toHaveLength(1);
  expect(snapshot.entities[0]?.handle).toBe("e1");
  expect(snapshot.entities[0]?.force).toBe(0);
  expect(b.snapshot(kernel).entities[0]?.handle).toBe("e1");
  expect(b.snapshot(kernel).entities[0]?.force).toBe(1);
  const first = snapshot.entities[0];
  if (!first) throw new Error("Missing owned entity");
  first.health = 1;
  expect(a.snapshot(kernel).entities[0]?.health).toBe(900);
  step(kernel, []);
  step(kernel, []);
  expect(a.snapshot(kernel).entities).toEqual([]);
  expect(a.resolve("e1")).toBeUndefined();
  expect(createProjection(setup, 1, "debug-no-fog").snapshot(kernel).entities).toHaveLength(2);
  expect(() => createProjection(setup, 0, "controlled")).toThrow();
  expect(() => createProjection({ ...setup, debug: false }, 1, "debug-no-fog")).toThrow();
});
