import { expect, test } from "bun:test";
import type { Command, Payloads } from "../../commands";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing/maps";
import { HoldPosition } from "../combat";
import { ConstructionSite } from "../construction";
import { Harvester } from "../economy";
import { type Definition, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { MoveIntent } from "../movement";
import { MAX_QUEUED_ORDERS, ORDER_REFUSALS, OrderFailure, QueuedOrder } from "./orders";

const building: Definition = {
  id: "structure:orders/reactor",
  role: "power",
  health: 1000,
  speed: 0,
  turnRate: 0,
  footprint: [2, 2],
  construction: { cost: { credits: 100 }, buildTicks: 20 },
  power: 20,
};
const unit: Definition = {
  id: "unit:orders/soldier",
  role: "combat",
  health: 1000,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  visionSubcells: 8 * 1024,
  armor: "infantry",
  weapons: [
    {
      id: "gun",
      targets: ["ground"],
      rangeSubcells: [0, 2 * 1024],
      reloadTicks: 20,
      projectile: { kind: "instant" },
      warheads: [{ type: "damage", amount: 1, tags: [] }],
    },
  ],
};
const builder: Definition = {
  ...unit,
  id: "unit:orders/builder",
  role: "builder",
  weapons: [],
  builds: [building.id],
  repair: {
    targets: { structures: true, families: [], roles: [], tags: [] },
    rateMilliHealthPerSecond: 10000,
    costPerMille: 250,
    rangeSubcells: 0,
  },
};
const headquarters: Definition = {
  ...building,
  id: "structure:orders/hq",
  role: "headquarters",
  visionSubcells: 8 * 1024,
};
const truck: Definition = {
  ...unit,
  id: "unit:orders/truck",
  role: "harvester",
  domain: "wheeled",
  weapons: [],
  harvestCapacity: 10,
  harvestAmountPerSecond: 10,
};
const depot: Definition = {
  ...building,
  id: "structure:orders/depot",
  role: "dropoff",
  dock: true,
  exits: [{ side: "south", cell: [0, 1] }],
};

function fixture(expires?: number) {
  const definitions = [headquarters, builder, unit, building, truck, depot];
  const setup: MatchSetup = {
    seed: 3,
    debug: false,
    definitions,
    forces: [0, 1].map((index) => ({ index, faction: "faction:fixture" })),
    seats: [1, 2, 3],
    map: {
      ...flatMap(40),
      spawns: [
        { id: "west", position: [8 * 1024, 8 * 1024], facing: 16384 },
        { id: "east", position: [32 * 1024, 32 * 1024], facing: 16384 },
      ],
      resources: [{ kind: "ore", position: [12 * 1024, 17 * 1024], radius: 0, amount: 100 }],
    },
    grants: [
      ...[0, 1].map((force) => ({
        seat: force + 1,
        force,
        scopes: ["unit.orders", "economy.build", "unit.abilities", "surrender"] as const,
        grantedAtTick: 0,
        ...(expires === undefined || force === 1 ? {} : { expiresAtTick: expires }),
      })),
      { seat: 3, force: 0, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 1000, fog: "off", popCap: 500, structureCap: 400 },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: index ? "east" : "west",
        start: {
          structures: [headquarters.id],
          units: [
            { unit: builder.id, count: 2, pop: 1, role: "builder" },
            { unit: unit.id, count: 1, pop: 1, role: "combat" },
          ],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup),
    world = kernel.world;
  const actors = world
    .query(Template, OwnerForce)
    .filter((id) => world.get(id, OwnerForce, "force") === 0);
  const soldier = actors.find((id) => world.get(id, Template, "definition") === 2)!;
  const builders = actors.filter((id) => world.get(id, Template, "definition") === 1);
  let sequence = 0;
  const command = <T extends keyof Payloads>(type: T, payload: Payloads[T], seat = 1) =>
    step(kernel, [{ tick: kernel.tick, seat, sequence: sequence++, type, payload } as Command])[0]
      ?.result;
  const ticks = (count: number) => {
    for (let i = 0; i < count; i++) step(kernel, []);
  };
  const spawn = (index: number, force: number, x: number, y: number) =>
    spawnEntity(kernel, index, definitions[index]!, {
      definition: definitions[index]!.id,
      force,
      x: x * 1024 + (index === 3 || index === 5 ? 0 : 512),
      y: y * 1024 + (index === 3 || index === 5 ? 0 : 512),
      facing: 16384,
    });
  return { kernel, world, setup, soldier, builders, command, ticks, spawn };
}
const point = (x: number, y: number) => ({ x: x * 1024 + 512, y: y * 1024 + 512 });

test("Shift waypoints follow the current move independently, then Hold blocks later queued work", () => {
  const f = fixture();
  expect(f.command("unit.move", { entities: [f.soldier], ...point(16, 10) })).toBe("accepted");
  expect(f.command("unit.move", { entities: [f.soldier], ...point(20, 12), append: 1 })).toBe(
    "accepted",
  );
  expect(f.command("unit.hold", { entities: [f.soldier], append: 1 })).toBe("accepted");
  expect(f.kernel.orders?.rows(f.soldier)).toHaveLength(2);
  f.ticks(40);
  expect(f.world.get(f.soldier, Transform, "x")).toBe(point(20, 12).x);
  expect(f.world.has(f.soldier, HoldPosition)).toBe(true);
  f.command("unit.move", { entities: [f.soldier], ...point(23, 12), append: 1 });
  f.ticks(20);
  expect(f.kernel.orders?.rows(f.soldier)).toHaveLength(1);
  f.command("unit.stop", { entities: [f.soldier] });
  expect(f.kernel.orders?.rows(f.soldier)).toHaveLength(0);
  expect(f.world.has(f.soldier, HoldPosition)).toBe(false);
});

test("32 pending entries are bounded atomically across a mixed selection; refusals preserve current work", () => {
  const f = fixture();
  f.command("unit.hold", { entities: [f.soldier] });
  for (let i = 0; i < MAX_QUEUED_ORDERS; i++)
    expect(f.command("unit.move", { entities: [f.soldier], ...point(15, 12), append: 1 })).toBe(
      "accepted",
    );
  expect(
    f.command("unit.move", { entities: [f.soldier, f.builders[0]!], ...point(15, 12), append: 1 }),
  ).toBe("order_queue_full");
  expect(f.kernel.orders?.rows(f.builders[0]!)).toHaveLength(0);
  expect(f.kernel.orders?.rows(f.soldier)).toHaveLength(32);
  expect(f.command("unit.attack", { entities: [f.soldier], entity: f.soldier })).toBe(
    "bad_payload",
  );
  expect(f.kernel.orders?.rows(f.soldier)).toHaveLength(32);
  expect(f.command("unit.move", { entities: [f.soldier], ...point(15, 12), append: 2 })).toBe(
    "bad_payload",
  );
  f.command("unit.move", { entities: [f.soldier], ...point(15, 12) });
  expect(f.kernel.orders?.rows(f.soldier)).toHaveLength(0);
});

test("co-controllers obey canonical append/replace ordering and edit/cancel only current permitted entries", () => {
  const f = fixture();
  f.command("unit.hold", { entities: [f.soldier] });
  f.command("unit.move", { entities: [f.soldier], ...point(18, 12), append: 1 });
  const projection = createProjection(f.setup, 3, "controlled"),
    view = projection.snapshot(f.kernel);
  const handle = view.entities.find((row) => row.queuedOrders)?.queuedOrders?.[0]?.handle;
  const row = projection.resolve(handle)!;
  expect(projection.resolve(handle, "unit.orders")).toBeUndefined();
  expect(f.command("unit.editQueued", { item: row, ...point(19, 13) }, 2)).toBe("no_grant");
  expect(f.command("unit.editQueued", { item: row, ...point(19, 13) }, 3)).toBe("accepted");
  expect(f.world.get(row, QueuedOrder, "x")).toBe(point(19, 13).x);
  expect(f.command("unit.cancelQueued", { item: row }, 3)).toBe("accepted");
  expect(projection.snapshot(f.kernel).entities.some((row) => row.queuedOrders)).toBe(false);
  expect(projection.resolve(handle)).toBeUndefined();
});

test("same-tick co-controller inputs follow server sequence for append and replacement", () => {
  const f = fixture();
  step(f.kernel, [
    {
      tick: f.kernel.tick,
      seat: 1,
      sequence: 10,
      type: "unit.move",
      payload: { entities: [f.soldier], ...point(20, 12), append: 1 },
    },
    {
      tick: f.kernel.tick,
      seat: 3,
      sequence: 9,
      type: "unit.move",
      payload: { entities: [f.soldier], ...point(18, 12) },
    },
  ]);
  expect(f.world.get(f.soldier, MoveIntent, "x")).toBe(point(18, 12).x);
  expect(f.kernel.orders!.rows(f.soldier)).toHaveLength(1);
  step(f.kernel, [
    {
      tick: f.kernel.tick,
      seat: 3,
      sequence: 19,
      type: "unit.move",
      payload: { entities: [f.soldier], ...point(22, 12) },
    },
    {
      tick: f.kernel.tick,
      seat: 1,
      sequence: 18,
      type: "unit.move",
      payload: { entities: [f.soldier], ...point(21, 12), append: 1 },
    },
  ]);
  expect(f.kernel.orders!.rows(f.soldier)).toHaveLength(0);
  expect(f.world.get(f.soldier, MoveIntent, "x")).toBe(point(22, 12).x);
});

test("queued multi-builder sites pay once after all participants finish, then each builder continues", () => {
  const f = fixture(),
    [a, b] = f.builders;
  f.command("unit.move", { entities: [a!], ...point(18, 12) });
  f.command("unit.move", { entities: [b!], ...point(8, 18) });
  expect(
    f.command("economy.build", {
      builders: f.builders,
      definition: building.id,
      force: 0,
      x: 11 * 1024,
      y: 10 * 1024,
      facing: 16384,
      append: 1,
    }),
  ).toBe("accepted");
  f.command("unit.move", { entities: f.builders, ...point(20, 15), append: 1 });
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  f.ticks(120);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(900);
  expect(
    f.world.query(Template).filter((id) => f.world.get(id, Template, "definition") === 3),
  ).toHaveLength(1);
  expect(f.world.query(ConstructionSite)).toHaveLength(0);
  expect(f.builders.map((id) => f.world.get(id, Transform, "x"))).toEqual([
    point(20, 15).x,
    point(20, 15).x,
  ]);
});

test("queued build waits for future funds without charging or reserving a site", () => {
  const f = fixture();
  f.kernel.economy?.spend(1, 0, { credits: 1000 }, "economy.build");
  expect(
    f.command("economy.build", {
      builders: f.builders,
      definition: building.id,
      force: 0,
      x: 11 * 1024,
      y: 10 * 1024,
      facing: 16384,
      append: 1,
    }),
  ).toBe("accepted");
  f.ticks(10);
  expect(f.world.query(ConstructionSite)).toHaveLength(0);
  const row = f.kernel.orders!.rows(f.builders[0]!)[0]!;
  expect(ORDER_REFUSALS[f.world.get(row, QueuedOrder, "reason") - 1]).toBe("insufficient_funds");
  f.kernel.economy?.gain(0, { credits: 100 });
  f.ticks(60);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0);
  expect(
    f.world.query(Template).filter((id) => f.world.get(id, Template, "definition") === 3),
  ).toHaveLength(1);
});

test("lost targets are hidden from pending copies and rejected at execution without losing later work", () => {
  const f = fixture(),
    target = f.spawn(2, 1, 25, 12);
  f.command("unit.move", { entities: [f.soldier], ...point(18, 12) });
  expect(f.command("unit.attack", { entities: [f.soldier], entity: target, append: 1 })).toBe(
    "accepted",
  );
  f.world.destroy(target);
  f.command("unit.move", { entities: [f.soldier], ...point(19, 13), append: 1 });
  const snapshot = createProjection(f.setup, 1, "controlled").snapshot(f.kernel);
  expect(
    snapshot.entities.find((row) => row.queuedOrders)?.queuedOrders?.[0]?.target,
  ).toBeUndefined();
  f.ticks(40);
  expect(f.world.has(f.soldier, OrderFailure)).toBe(true);
  expect(f.world.get(f.soldier, Transform, "x")).toBe(point(19, 13).x);
});

test("future execution rechecks the original issuer's grant while another controller can cancel", () => {
  const f = fixture(8);
  f.command("unit.move", { entities: [f.soldier], ...point(24, 12) });
  f.command("unit.move", { entities: [f.soldier], ...point(25, 12), append: 1 });
  f.ticks(40);
  const row = f.kernel.orders!.rows(f.soldier)[0]!;
  expect(ORDER_REFUSALS[f.world.get(row, QueuedOrder, "reason") - 1]).toBe("no_grant");
  expect(
    createProjection(f.setup, 1, "controlled")
      .snapshot(f.kernel)
      .entities.some((row) => row.queuedOrders),
  ).toBe(false);
  expect(f.command("unit.cancelQueued", { item: row }, 3)).toBe("accepted");
});

test("an automatic hauler yields to queued manual movement after one actual paid unload", () => {
  const f = fixture();
  f.spawn(5, 0, 12, 13);
  const hauler = f.spawn(4, 0, 12, 17);
  f.ticks(2);
  expect(f.command("unit.move", { entities: [hauler], ...point(19, 15), append: 1 })).toBe(
    "accepted",
  );
  f.ticks(180);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1010);
  expect(f.world.get(hauler, Harvester, "cargo")).toBe(0);
  expect(f.world.get(hauler, Harvester, "enabled")).toBe(0);
  expect(f.world.get(hauler, Transform, "x")).toBe(point(19, 15).x);
});

test("pending state participates in canonical bytes/hashes and observations are copied", () => {
  const a = fixture(),
    b = fixture();
  for (const f of [a, b]) {
    f.command("unit.hold", { entities: [f.soldier] });
    f.command("unit.move", { entities: [f.soldier], ...point(18, 12), append: 1 });
  }
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  expect(a.world.serialize()).toEqual(b.world.serialize());
  const row = b.kernel.orders!.rows(b.soldier)[0]!;
  b.world.set(row, QueuedOrder, "x", point(19, 12).x);
  expect(checkpointHash(a.kernel)).not.toBe(checkpointHash(b.kernel));
  const view = a.kernel.observe!(1),
    item = view.entities.find((row) => row.queuedOrders)?.queuedOrders?.[0];
  if (!item) throw new Error("Missing projected queue");
  item.x = 1;
  expect(a.kernel.observe!(1).entities.find((row) => row.queuedOrders)?.queuedOrders?.[0]?.x).toBe(
    point(18, 12).x,
  );
  expect(a.world.has(a.soldier, MoveIntent)).toBe(false);
});
