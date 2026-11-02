import { expect, test } from "bun:test";
import defense from "../../../../../content/core/factions/eastern-collective/structures/anti-air-complex/structure.json";
import headquarters from "../../../../../content/core/factions/eastern-collective/structures/command-center/structure.json";
import reactor from "../../../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json";
import factory from "../../../../../content/core/factions/eastern-collective/structures/war-factory/structure.json";
import builder from "../../../../../content/core/factions/eastern-collective/units/field-technician/unit.json";
import { type Grant, validateCommands } from "../../commands";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import type { MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing";
import { ConstructionSite } from "../construction";
import { entitiesFeature, OwnerForce, spawnEntity, toDefinition } from "../entities";
import { movementFeature } from "../movement";
import { initializeForcePower, StructurePower } from "./power";

const definitions = [headquarters, reactor, factory, defense, builder].map(toDefinition);
function fixture(spawn = true) {
  const grants: Grant[] = [
    { seat: 1, force: 1, scopes: ["economy.build", "unit.orders"], grantedAtTick: 0 },
    { seat: 2, force: 1, scopes: ["production.queue"], grantedAtTick: 0 },
    { seat: 3, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 },
    { seat: 4, force: 1, scopes: ["economy.build"], grantedAtTick: 1, expiresAtTick: 2 },
    { seat: 5, force: 1, scopes: ["economy.build"], grantedAtTick: 0, revokedAtTick: 1 },
  ];
  const setup: MatchSetup = {
    map: flatMap(),
    seed: 42,
    debug: false,
    forces: [2, 1].map((index) => ({ index, faction: "faction:eastern-collective" })),
    seats: [1, 2, 3, 4, 5],
    grants,
    definitions,
  };
  const kernel = createKernel(setup);
  register(kernel, entitiesFeature(definitions));
  register(kernel, movementFeature({ definitions, grants }));
  const power = initializeForcePower(kernel, setup.forces, grants);
  const entities = (spawn ? definitions : []).map((definition, index) =>
    spawnEntity(kernel, index, definition, {
      definition: definition.id,
      force: 1,
      x: index * 4096,
      y: 10240,
      facing: 0,
    }),
  );
  const [hq = 0, plant = 0, production = 0, antiAir = 0, worker = 0] = entities;
  return { setup, kernel, power, hq, plant, production, antiAir, worker };
}
const toggle = (tick: number, entity: number, enabled: number, seat = 1, sequence = 0) => ({
  tick,
  seat,
  sequence,
  type: "economy.power",
  payload: { entity, enabled },
});

test("authored structure power survives conversion; unrelated definitions and out-of-range quantities refuse", () => {
  expect(definitions[0]?.power).toBe(20);
  expect(definitions[1]?.power).toBe(140);
  expect(() => toDefinition({ ...builder, power: 1 })).toThrow("only structures declare power");
  for (const power of [0.5, 501, -501, Number.NaN])
    expect(() => toDefinition({ ...reactor, power })).toThrow("Invalid definition");
});

test("completed live structures contribute per-instance supply/draw, with exact-capacity and brownout boundaries", () => {
  const { kernel, power, hq, production, antiAir, worker } = fixture();
  expect(power.balance(1)).toEqual({ force: 1, used: 65, produced: 160, brownout: false });
  expect(power.balance(2)).toEqual({ force: 2, used: 0, produced: 0, brownout: false });
  expect(power.balance(99)).toBeUndefined();
  expect(power.productionPerMille(production)).toBe(1000);
  expect(power.researchPerMille(production)).toBe(1000);
  expect(power.powered(antiAir)).toBe(true);
  expect(power.powered(worker)).toBe(false);
  kernel.world.set(production, StructurePower, "amount", -135);
  expect(power.balance(1)?.brownout).toBe(false); // 135 + 25 = 160
  kernel.world.set(production, StructurePower, "amount", -136);
  expect(power.balance(1)?.brownout).toBe(true);
  expect(power.productionPerMille(production)).toBe(500);
  expect(power.researchPerMille(production)).toBe(500);
  expect(power.powered(antiAir)).toBe(false);
  expect(power.powered(hq)).toBe(true);
  kernel.world.set(antiAir, StructurePower, "amount", 0);
  expect(power.powered(antiAir)).toBe(true); // Unpowered defences are not disabled by supply loss.
});

test("completion, manual shutdown, destruction and ownership changes immediately recompute capacity", () => {
  const { kernel, power, plant, production, antiAir } = fixture();
  kernel.world.add(plant, ConstructionSite);
  expect(power.balance(1)).toEqual({ force: 1, used: 65, produced: 20, brownout: true });
  expect(power.powered(plant)).toBe(false);
  expect(power.productionPerMille(plant)).toBe(0);
  expect(step(kernel, [toggle(0, plant, 0)])[0]?.result).toBe("bad_payload");
  kernel.world.remove(plant, ConstructionSite);
  expect(power.balance(1)?.brownout).toBe(false);
  expect(step(kernel, [toggle(1, plant, 0)])[0]?.result).toBe("accepted");
  expect(power.balance(1)?.brownout).toBe(true);
  expect(power.powered(plant)).toBe(false);
  expect(power.productionPerMille(plant)).toBe(0);
  expect(
    step(kernel, [toggle(2, production, 0), toggle(2, antiAir, 0, 1, 1)]).map((e) => e.result),
  ).toEqual(["accepted", "accepted"]);
  expect(power.balance(1)).toEqual({ force: 1, used: 0, produced: 20, brownout: false });
  expect(power.productionPerMille(production)).toBe(0);
  expect(power.researchPerMille(production)).toBe(0);
  step(kernel, [toggle(3, plant, 1), toggle(3, production, 1, 1, 1)]);
  kernel.world.set(plant, OwnerForce, "force", 2);
  expect(power.balance(1)).toEqual({ force: 1, used: 40, produced: 20, brownout: true });
  expect(power.balance(2)).toEqual({ force: 2, used: 0, produced: 140, brownout: false });
  kernel.world.destroy(production);
  expect(power.balance(1)?.brownout).toBe(false);
  expect(power.powered(production)).toBe(false);
  kernel.world.destroy(plant);
  expect(power.balance(2)?.produced).toBe(0);
});

test("power toggles require build permission at this tick; refused and malformed commands never change ECS state", () => {
  const { kernel, plant, worker } = fixture();
  for (const [seat, tick, result] of [
    [2, 0, "no_grant"],
    [3, 0, "no_grant"],
    [4, 0, "no_grant"],
    [4, 2, "no_grant"],
    [5, 1, "no_grant"],
  ] as const) {
    kernel.tick = tick;
    const before = kernel.world.serialize();
    expect(step(kernel, [toggle(tick, plant, 0, seat)])[0]?.result).toBe(result);
    expect(kernel.world.serialize()).toEqual(before);
  }
  kernel.tick = 1;
  expect(step(kernel, [toggle(1, plant, 0, 4)])[0]?.result).toBe("accepted");
  expect(step(kernel, [toggle(2, plant, 1, 0)])[0]?.result).toBe("accepted");
  expect(step(kernel, [toggle(3, worker, 0)])[0]?.result).toBe("bad_payload");
  expect(step(kernel, [toggle(4, 99999, 0)])[0]?.result).toBe("bad_payload");
  for (const enabled of [-1, 2, 0.5, Number.NaN, true])
    expect(
      validateCommands(
        [{ ...toggle(0, plant, 0), payload: { entity: plant, enabled } }],
        kernel,
      )[0],
    ).toEqual({ accepted: false, code: "bad_payload" });
});

test("amounts and toggles are serialized/hashed; restored Worlds keep the same capacities without hidden mutable state", () => {
  const { kernel, power, plant } = fixture();
  const other = fixture();
  const before = checkpointHash(kernel);
  kernel.world.set(plant, StructurePower, "enabled", 0);
  expect(checkpointHash(kernel)).not.toBe(before);
  expect(other.power.balance(1)?.produced).toBe(160);
  const restored = fixture(false);
  restored.kernel.world.load(kernel.world.serialize());
  expect(restored.kernel.world.serialize()).toEqual(kernel.world.serialize());
  expect(restored.power.balance(1)).toEqual(power.balance(1));
  const disabled = checkpointHash(kernel);
  kernel.world.set(plant, StructurePower, "amount", 130);
  expect(checkpointHash(kernel)).not.toBe(disabled);
  expect(() => initializeForcePower(kernel, [], [])).toThrow("already initialized");
});

test("power projection copies economically permitted totals and gives economy-only seats private structure handles", () => {
  const { setup, kernel, power } = fixture();
  const economic = createProjection(setup, 2, "controlled");
  const army = createProjection(setup, 3, "controlled");
  const expired = createProjection(setup, 5, "controlled");
  const snapshot = economic.snapshot(kernel);
  expect(snapshot.power).toEqual([{ force: 1, used: 65, produced: 160, brownout: false }]);
  expect(snapshot.entities).toHaveLength(4);
  expect(snapshot.entities.every((entity) => entity.power?.enabled)).toBe(true);
  expect(economic.resolve(snapshot.entities[0]?.handle)).toBe(1);
  expect(army.snapshot(kernel).power).toEqual([]);
  expect(army.snapshot(kernel).entities).toEqual([]);
  Reflect.set(snapshot.power?.[0] as object, "produced", 0);
  Reflect.set(snapshot.entities[0]?.power as object, "enabled", false);
  expect(power.balance(1)?.produced).toBe(160);
  expect(economic.snapshot(kernel).entities[0]?.power?.enabled).toBe(true);
  kernel.tick = 1;
  expect(expired.snapshot(kernel).power).toEqual([]);
  expect(expired.snapshot(kernel).entities).toEqual([]);
  const copiedGrant = setup.grants.find((grant) => grant.seat === 3);
  if (!copiedGrant) throw new Error("Missing test grant");
  Reflect.set(copiedGrant, "force", 1);
  Reflect.set(copiedGrant, "scopes", ["economy.build"]);
  expect(power.canInspect(3, 1)).toBe(false);
  expect(army.snapshot(kernel).power).toEqual([]);
  expect(army.snapshot(kernel).entities).toEqual([]);
});
