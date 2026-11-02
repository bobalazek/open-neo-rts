import { expect, test } from "bun:test";
import { RESOURCES } from "@open-neo-rts/content";
import type { Grant } from "../../commands";
import { World } from "../../ecs";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import type { MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing";
import type { NormalMatchSetup } from "../control";
import { entitiesFeature } from "../entities";
import { type BankResult, ForceBank, initializeForceBanks, type SpendScope } from "./bank";

const initial: NormalMatchSetup["forces"] = [2, 1].map((index) => ({
  index,
  team: index,
  spawn: `spawn-${index}`,
  start: {
    structures: [],
    units: [],
    resources: { credits: 5000, materials: 10, "industrial-capacity": 3 },
  },
}));
const grants: Grant[] = [
  { seat: 1, force: 1, scopes: ["economy.build", "production.queue"], grantedAtTick: 0 },
  { seat: 2, force: 1, scopes: ["production.queue"], grantedAtTick: 0 },
  { seat: 3, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 },
  { seat: 4, force: 2, scopes: ["economy.transfer"], grantedAtTick: 1, expiresAtTick: 2 },
  { seat: 5, force: 2, scopes: ["research.spend"], grantedAtTick: 0, revokedAtTick: 1 },
];
function bankSetup() {
  const kernel = createKernel({ seed: 42, debug: false, map: flatMap() });
  const banks = initializeForceBanks(kernel, initial, grants);
  return { kernel, banks };
}

test("initial stock belongs to sorted Forces, is isolated per match, copied, serialized and hashed", () => {
  const { kernel, banks } = bankSetup();
  const other = bankSetup();
  expect(
    kernel.world.query(ForceBank).map((id) => kernel.world.get(id, ForceBank, "force")),
  ).toEqual([1, 2]);
  expect(banks.balance(1)).toEqual({
    credits: 5000,
    materials: 10,
    "industrial-capacity": 3,
    "salvage-points": 0,
  });
  expect(Object.keys(banks.balance(1) ?? {}).sort()).toEqual(
    RESOURCES.filter((resource) => resource.kind === "stock")
      .map((resource) => resource.id)
      .sort(),
  );
  const copy = banks.balance(1);
  if (!copy) throw new Error("Missing bank fixture");
  Reflect.set(copy, "credits", 0);
  expect(banks.balance(1)?.credits).toBe(5000);
  const before = checkpointHash(kernel);
  expect(banks.gain(1, { credits: 7 })).toEqual({ ok: true });
  expect(checkpointHash(kernel)).not.toBe(before);
  expect(other.banks.balance(1)?.credits).toBe(5000);
  const restored = new World();
  restored.register(ForceBank);
  restored.load(kernel.world.serialize());
  expect(restored.serialize()).toEqual(kernel.world.serialize());
  expect(restored.get(1, ForceBank, "credits")).toBe(5007);
});

test("co-controllers share one atomic bank and canonical same-tick command order determines affordability", () => {
  const { kernel, banks } = bankSetup();
  const results: { seat: number; result: BankResult }[] = [];
  // Test-only handler exercises the existing dispatcher; no spend-only command is added to the game.
  register(kernel, {
    handlers: {
      "unit.stop": (_kernel, command) => {
        results.push({
          seat: command.seat,
          result: banks.spend(command.seat, 1, { credits: 3000 }, "production.queue"),
        });
      },
    },
  });
  step(kernel, [
    { tick: 0, sequence: 2, seat: 1, type: "unit.stop", payload: { entities: [1] } },
    { tick: 0, sequence: 1, seat: 2, type: "unit.stop", payload: { entities: [1] } },
  ]);
  expect(results).toEqual([
    { seat: 2, result: { ok: true } },
    { seat: 1, result: { ok: false, reason: "insufficient_funds" } },
  ]);
  expect(banks.balance(1)?.credits).toBe(2000);
  expect(banks.balance(2)?.credits).toBe(5000);
});

test("insufficient funds, overflow, malformed values and unknown resources never partially change a bank", () => {
  const { kernel, banks } = bankSetup();
  const input = [
    null,
    [],
    "credits",
    { credits: -1 },
    { credits: 0.5 },
    { credits: Number.NaN },
    { credits: Number.POSITIVE_INFINITY },
    { credits: 0x80000000 },
    { power: 1 },
    { "quantum-processing": 0 },
    { unknown: 0 },
    JSON.parse('{"__proto__": 1}'),
    { constructor: 0 },
    Object.create({ credits: 1 }),
    { [Symbol("credits")]: 1 },
    {
      get credits() {
        throw new Error("Do not invoke accessors");
      },
    },
  ];
  for (const value of input) {
    const before = kernel.world.serialize();
    expect(banks.spend(1, 1, value, "economy.build")).toEqual({
      ok: false,
      reason: "invalid_amounts",
    });
    expect(banks.gain(1, value)).toEqual({ ok: false, reason: "invalid_amounts" });
    expect(kernel.world.serialize()).toEqual(before);
  }
  let before = kernel.world.serialize();
  expect(banks.spend(1, 1, { credits: 500, materials: 11 }, "economy.build")).toEqual({
    ok: false,
    reason: "insufficient_funds",
  });
  expect(kernel.world.serialize()).toEqual(before);
  expect(banks.gain(1, { credits: 0x7fffffff - 5000 })).toEqual({ ok: true });
  before = kernel.world.serialize();
  expect(banks.gain(1, { credits: 1, materials: 100 })).toEqual({ ok: false, reason: "overflow" });
  expect(kernel.world.serialize()).toEqual(before);
  expect(banks.balance(99)).toBeUndefined();
  expect(banks.gain(99, {})).toEqual({ ok: false, reason: "unknown_force" });
  expect(banks.spend(1, 99, {}, "economy.build")).toEqual({ ok: false, reason: "unknown_force" });
});

test("zero costs, full paid refunds, and int32 endpoints have explicit results", () => {
  const { kernel, banks } = bankSetup();
  const before = checkpointHash(kernel);
  expect(banks.spend(1, 1, {}, "economy.build")).toEqual({ ok: true });
  expect(banks.gain(1, { credits: 0 })).toEqual({ ok: true });
  expect(checkpointHash(kernel)).toBe(before);
  const paid = { credits: 5000, materials: 10 };
  expect(banks.spend(1, 1, paid, "economy.build")).toEqual({ ok: true });
  expect(banks.balance(1)?.credits).toBe(0);
  expect(banks.refund(1, paid)).toEqual({ ok: true });
  expect(checkpointHash(kernel)).toBe(before);
  expect(banks.gain(1, { credits: 0x7fffffff - 5000 })).toEqual({ ok: true });
  expect(banks.balance(1)?.credits).toBe(0x7fffffff);
});

test("grants are checked at the current tick and ordinary unit control never permits spending", () => {
  const { kernel, banks } = bankSetup();
  expect(banks.spend(3, 2, {}, "economy.build")).toEqual({ ok: false, reason: "no_grant" });
  expect(banks.spend(3, 2, {}, "unit.orders" as SpendScope)).toEqual({
    ok: false,
    reason: "no_grant",
  });
  expect(banks.spend(1, 2, {}, "production.queue")).toEqual({ ok: false, reason: "no_grant" });
  expect(banks.spend(4, 2, {}, "economy.transfer")).toEqual({ ok: false, reason: "no_grant" });
  expect(banks.spend(5, 2, {}, "research.spend")).toEqual({ ok: true });
  kernel.tick = 1;
  expect(banks.spend(4, 2, {}, "economy.transfer")).toEqual({ ok: true });
  expect(banks.spend(5, 2, {}, "research.spend")).toEqual({ ok: false, reason: "no_grant" });
  kernel.tick = 2;
  expect(banks.spend(4, 2, {}, "economy.transfer")).toEqual({ ok: false, reason: "no_grant" });
});

test("controlled projection exposes copied economic banks, excluding enemy/army-only/expired grants", () => {
  const { kernel, banks } = bankSetup();
  register(kernel, entitiesFeature([]));
  const setup: MatchSetup = {
    map: flatMap(),
    seed: 42,
    debug: false,
    forces: [
      { index: 1, faction: "faction:eastern-collective" },
      { index: 2, faction: "faction:eastern-collective" },
    ],
    seats: [1, 2, 3, 4, 5],
    grants,
    definitions: [],
  };
  const views = [1, 2, 3, 4, 5].map((seat) => createProjection(setup, seat, "controlled"));
  expect(views.map((view) => view.snapshot(kernel).banks?.map((bank) => bank.force))).toEqual([
    [1],
    [1],
    [],
    [],
    [2],
  ]);
  const snapshot = views[0]?.snapshot(kernel);
  Reflect.set(snapshot?.banks?.[0]?.resources as object, "credits", 0);
  expect(banks.balance(1)?.credits).toBe(5000);
  kernel.tick = 1;
  expect(views.map((view) => view.snapshot(kernel).banks?.map((bank) => bank.force))).toEqual([
    [1],
    [1],
    [],
    [2],
    [],
  ]);
  kernel.tick = 2;
  expect(views[3]?.snapshot(kernel).banks).toEqual([]);
});

test("invalid initial resources refuse before mutating the World, and initialization cannot repeat", () => {
  const kernel = createKernel({ seed: 1, debug: false });
  const before = kernel.world.serialize();
  const invalid = initial.map((force) => ({
    ...force,
    start: { ...force.start, resources: { power: 20 } },
  }));
  expect(() => initializeForceBanks(kernel, invalid, grants)).toThrow("bounded stock resources");
  expect(kernel.world.serialize()).toEqual(before);
  initializeForceBanks(kernel, initial, grants);
  const initialized = kernel.world.serialize();
  expect(() => initializeForceBanks(kernel, initial, grants)).toThrow("already initialized");
  expect(kernel.world.serialize()).toEqual(initialized);
});
