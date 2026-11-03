// Fixture-only layout: original catalog/stats and Training Grounds; extra actors isolate two real deaths.
import assert from "node:assert/strict";
import {
  createMatch,
  createProjection,
  Health,
  OwnerForce,
  spawnEntity,
  step,
  Template,
  Transform,
} from "../../../packages/sim/src";
import { aiMatchScenario } from "../../cli/src/commands/ai-vs-ai";

const scenario = await aiMatchScenario(12);
assert(scenario.setup.normal);
const { bots: _bots, ...normal } = scenario.setup.normal;
const setup = { ...scenario.setup, normal },
  kernel = createMatch(setup);
const spawn = (id: string, force: number, x: number, y: number) => {
  const index = setup.definitions.findIndex((definition) => definition.id === id);
  assert(index >= 0);
  return spawnEntity(kernel, index, setup.definitions[index]!, {
    definition: id,
    force,
    x: x * 1024,
    y: y * 1024,
    facing: 0,
  });
};
const tank = spawn("core.unit:eastern-collective/dragon-tank", 0, 25.5, 18.5);
const reactor = spawn("core.structure:eastern-collective/industrial-reactor", 1, 30, 18);
const truck = spawn("core.unit:eastern-collective/supply-truck", 1, 27.5, 21.5);
kernel.vision?.update();
kernel.visibility?.update();
kernel.captureObservations?.();
const projection = createProjection(setup, 1, "controlled");
let sequence = 0;
const kill = (target: number) => {
  const result = step(kernel, [
    {
      tick: kernel.tick,
      seat: 1,
      sequence: sequence++,
      type: "unit.attack",
      payload: { entities: [tank], entity: target },
    },
  ]);
  assert.equal(result[0]?.result, "accepted");
  for (let count = 0; count < 12000 && kernel.world.isAlive(target); count++) step(kernel, []);
  assert(
    !kernel.world.isAlive(target),
    `Original weapon must actually kill target ${target}; tankAlive=${kernel.world.isAlive(tank)}, targetHealth=${kernel.world.isAlive(target) ? kernel.world.get(target, Health, "current") : 0}, tankPosition=${kernel.world.isAlive(tank) ? [kernel.world.get(tank, Transform, "x"), kernel.world.get(tank, Transform, "y")] : "dead"}`,
  );
  return projection.snapshot(kernel);
};
const rubble = kill(reactor),
  both = kill(truck);
assert(rubble.remains?.some((row) => row.kind === "rubble"));
assert.equal(both.remains?.length, 2);
const result = step(kernel, [
  {
    tick: kernel.tick,
    seat: 1,
    sequence: sequence++,
    type: "unit.move",
    payload: {
      entities: kernel.world
        .query(Template, OwnerForce)
        .filter(
          (id) =>
            kernel.world.get(id, OwnerForce, "force") === 0 &&
            setup.definitions[kernel.world.get(id, Template, "definition")]!.speed > 0,
        ),
      x: 12.5 * 1024,
      y: 25.5 * 1024,
    },
  },
]);
assert.equal(result[0]?.result, "accepted");
let hidden = projection.snapshot(kernel);
for (let count = 0; count < 2000 && hidden.remains?.length; count++) {
  step(kernel, []);
  hidden = projection.snapshot(kernel);
}
assert.equal(
  hidden.remains?.length,
  0,
  "Normal movement must actually remove current sight of the remains",
);
assert(kernel.world.isAlive(tank));
console.log(
  JSON.stringify(
    {
      terrain: setup.map.terrain,
      snapshots: [rubble, both, hidden],
      tank: {
        x: kernel.world.get(tank, Transform, "x"),
        y: kernel.world.get(tank, Transform, "y"),
      },
    },
    (_key, value) => (value instanceof Uint8Array ? [...value] : value),
  ),
);
