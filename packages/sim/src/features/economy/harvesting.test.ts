import { expect, test } from "bun:test";
import { parseTerrain, SCHEMAS, validate } from "@open-neo-rts/content";
import supplyTruck from "../../../../../content/core/factions/eastern-collective/units/supply-truck/unit.json";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup, toMatchResources } from "../../match";
import { createProjection } from "../../projection";
import { Disabled, initializeDisable } from "../combat/disable";
import { ConstructionSite } from "../construction";
import {
  type Definition,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
  toDefinition,
} from "../entities";
import { perimeterPoint } from "../entities/perimeter";
import { MoveIntent } from "../movement";
import { ForceBank } from "./bank";
import { HARVEST_STATUSES, Harvester, harvestSnapshot } from "./harvesting";
import { oreCells } from "./ore";

const hq: Definition = {
  id: "structure:logistics/headquarters",
  role: "headquarters",
  health: 1000,
  power: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 2],
};
const worker: Definition = {
  id: "unit:logistics/worker",
  role: "builder",
  health: 50,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
};
const truck: Definition = {
  id: "unit:logistics/truck",
  role: "harvester",
  health: 900,
  speed: 1024,
  turnRate: 65536,
  domain: "wheeled",
  radiusSubcells: 819,
  harvestCapacity: 10,
  harvestAmountPerSecond: 5,
};
const depot: Definition = {
  id: "structure:logistics/depot",
  role: "dropoff",
  health: 1800,
  power: -20,
  speed: 0,
  turnRate: 0,
  footprint: [3, 3],
  dock: true,
  exits: [{ side: "south", cell: [1, 2] }],
};
const block: Definition = {
  id: "prop:logistics/block",
  health: 0,
  speed: 0,
  turnRate: 0,
  footprint: [1, 1],
  blocks: "movement",
};
const marker: Definition = {
  ...hq,
  id: "structure:logistics/marker",
  role: "support",
  footprint: [1, 1],
  construction: { cost: { credits: 1 }, buildTicks: 100 },
};

function fixture(
  options: {
    capacity?: number;
    amount?: number;
    rate?: number;
    split?: boolean;
    resources?: MatchSetup["map"]["resources"];
  } = {},
) {
  const terrain = parseTerrain(40, 40, {});
  if (options.split)
    for (let y = 0; y < 40; y++) {
      terrain.water[y * 40 + 22] = 1;
      terrain.water[y * 40 + 23] = 2;
      terrain.water[y * 40 + 24] = 1;
    }
  const definition = {
    ...truck,
    harvestCapacity: options.capacity ?? 10,
    harvestAmountPerSecond: options.rate ?? 5,
  };
  const definitions = [hq, { ...worker, builds: [marker.id] }, definition, depot, block, marker];
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    definitions,
    forces: [{ index: 0, faction: "faction:logistics" }],
    seats: [1, 2, 3, 4, 5],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
      { seat: 2, force: 0, scopes: ["production.queue"], grantedAtTick: 0 },
      { seat: 3, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
      {
        seat: 5,
        force: 0,
        scopes: ["economy.build", "unit.orders"],
        grantedAtTick: 0,
        expiresAtTick: 1,
      },
    ],
    map: {
      id: "map:logistics",
      terrain: {
        ...terrain,
        level: [...terrain.level],
        ramp: [...terrain.ramp],
        surface: [...terrain.surface],
        water: [...terrain.water],
        biome: [...terrain.biome],
      },
      spawns: [{ id: "spawn", position: [8 * 1024, 8 * 1024], facing: 16384 }],
      objects: [],
      resources:
        options.resources ??
        toMatchResources([
          { kind: "ore", position: [18, 18], radius: 1, amount: options.amount ?? 1000 },
        ]),
    },
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 1, max: 1 } },
      settings: { startingCredits: 1000, popCap: 500, structureCap: 400 },
      forces: [
        {
          index: 0,
          team: 0,
          spawn: "spawn",
          start: {
            structures: [hq.id],
            units: [
              { unit: worker.id, count: 1, pop: 1, role: "builder" },
              { unit: truck.id, count: 1, pop: 0, role: "harvester" },
            ],
            resources: { credits: 1000, materials: 0 },
          },
        },
      ],
    },
  };
  const kernel = createMatch(setup);
  const id = kernel.world
    .query(Template)
    .find((entity) => kernel.world.get(entity, Template, "definition") === 2) as number;
  const spawn = (index = 3, x = 18, y = 10, facing = 16384, force = 0) =>
    spawnEntity(kernel, index, definitions[index] as Definition, {
      definition: (definitions[index] as Definition).id,
      force,
      x: x * 1024,
      y: y * 1024,
      facing,
    });
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) step(kernel, []);
  };
  const state = (entity = id) => HARVEST_STATUSES[kernel.world.get(entity, Harvester, "state")];
  const until = (predicate: () => boolean, max = 2000) => {
    for (let i = 0; i < max && !predicate(); i++) step(kernel, []);
    expect(predicate()).toBe(true);
  };
  const cargo = (entity = id) => kernel.world.get(entity, Harvester, "cargo");
  const command = (type: "unit.harvest" | "unit.stop", seat = 1, entities = [id]) =>
    step(kernel, [{ tick: kernel.tick, seat, sequence: 0, type, payload: { entities } }])[0]
      ?.result;
  return {
    kernel,
    setup,
    id,
    definition,
    definitions,
    spawn,
    advance,
    until,
    state,
    cargo,
    command,
  };
}

test("normal trucks seek real stock, accumulate five whole credits per second and retain the authored cargo capacity", () => {
  const f = fixture({ capacity: 500 });
  f.until(() => f.state() === "mining");
  const before = oreCells(f.kernel.world).reduce((sum, value) => sum + value.remaining, 0);
  f.advance(19);
  expect(f.cargo()).toBe(5);
  expect(harvestSnapshot(f.kernel, f.id, f.definition)?.capacity).toBe(500);
  expect(oreCells(f.kernel.world).reduce((sum, value) => sum + value.remaining, 0)).toBe(
    before - 5,
  );
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
});

test("EMP suspends a mining truck without consuming ore or losing partial work/cargo", () => {
  const f = fixture({ capacity: 500 });
  initializeDisable(f.kernel, [
    {
      ...truck,
      weapons: [
        {
          id: "emp",
          targets: ["ground"],
          rangeSubcells: [0, 1024],
          reloadTicks: 20,
          projectile: { kind: "instant" },
          warheads: [{ type: "disable", durationTicks: 20, tags: ["emp"] }],
        },
      ],
    },
  ]);
  f.command("unit.harvest");
  f.until(() => f.state() === "mining");
  f.advance(7);
  const work = f.kernel.world.get(f.id, Harvester, "miningWork"),
    cargo = f.cargo();
  const remaining = oreCells(f.kernel.world).reduce((sum, cell) => sum + cell.remaining, 0);
  f.kernel.world.add(f.id, Disabled, { until: f.kernel.tick + 20 });
  f.advance(20);
  expect(f.cargo()).toBe(cargo);
  expect(f.kernel.world.get(f.id, Harvester, "miningWork")).toBe(work);
  expect(oreCells(f.kernel.world).reduce((sum, cell) => sum + cell.remaining, 0)).toBe(remaining);
  f.advance(20);
  expect(f.cargo()).toBe(cargo + 5);
});

test("full trucks travel to a legal external dock, unload for forty ticks and credit exactly once", () => {
  const f = fixture();
  f.spawn();
  f.until(() => f.state() === "unloading");
  expect(f.cargo()).toBe(10);
  expect(f.kernel.world.get(f.id, Transform, "y")).toBe(14 * 1024 + 512);
  expect(f.kernel.world.get(f.id, Harvester, "unloadTicks")).toBe(1);
  f.advance(38);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  f.advance(1);
  expect(f.cargo()).toBe(0);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1010);
  f.command("unit.stop");
  f.advance(80);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1010);
});

test("EMP pauses an existing dock's partial unload and resumes its remaining work exactly once", () => {
  const f = fixture();
  initializeDisable(f.kernel, [
    {
      ...truck,
      weapons: [
        {
          id: "emp",
          targets: ["ground"],
          rangeSubcells: [0, 1024],
          reloadTicks: 20,
          projectile: { kind: "instant" },
          warheads: [{ type: "disable", durationTicks: 20, tags: ["emp"] }],
        },
      ],
    },
  ]);
  const dock = f.spawn();
  f.until(() => f.state() === "unloading");
  f.advance(7);
  expect(f.kernel.world.get(f.id, Harvester, "unloadTicks")).toBe(8);
  f.kernel.world.add(dock, Disabled, { until: f.kernel.tick + 5 });
  f.advance(5);
  expect(f.kernel.world.get(f.id, Harvester, "unloadTicks")).toBe(8);
  expect(f.kernel.world.get(f.id, Harvester, "dock")).toBe(dock);
  expect(f.cargo()).toBe(10);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  f.advance(31);
  expect(f.cargo()).toBe(10);
  f.advance(1);
  expect(f.cargo()).toBe(0);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1010);
});

test("no completed friendly dropoff retains cargo and recovers when one completes, dies or changes ownership", () => {
  const f = fixture();
  const dock = f.spawn();
  f.kernel.world.add(dock, ConstructionSite);
  const enemyDock = f.spawn(3, 28, 10);
  f.kernel.world.set(enemyDock, OwnerForce, "force", 99);
  f.until(() => f.state() === "no_dropoff");
  expect(f.cargo()).toBe(10);
  f.advance(80);
  expect(f.cargo()).toBe(10);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  f.kernel.world.remove(dock, ConstructionSite);
  f.until(() => f.state() === "unloading");
  f.kernel.world.set(dock, OwnerForce, "force", 99);
  f.advance(1);
  expect(f.state()).toBe("no_dropoff");
  expect(f.cargo()).toBe(10);
  f.kernel.world.destroy(dock);
  const replacement = f.spawn();
  expect(replacement).not.toBe(dock);
  f.until(() => f.kernel.economy?.balance(0)?.credits === 1010);
  expect(f.cargo()).toBe(0);
});

test("one dock admits arriving trucks in tick and stable-ID order, retaining other cargo", () => {
  const f = fixture();
  f.spawn();
  const second = f.spawn(2, 14, 16);
  f.advance(1);
  f.command("unit.stop");
  f.command("unit.stop", 1, [second]);
  for (const [truckId, x, y] of [
    [second, 19, 16],
    [f.id, 21, 16],
  ] as const) {
    f.kernel.world.set(truckId, Harvester, "cargo", 10);
    f.kernel.world.set(truckId, Transform, "x", x * 1024 + 512);
    f.kernel.world.set(truckId, Transform, "y", y * 1024 + 512);
  }
  f.command("unit.harvest", 1, [second]);
  f.until(() => f.state(second) === "unloading");
  f.command("unit.harvest");
  f.until(() => f.state() === "queued");
  expect(f.cargo()).toBe(10);
  f.until(() => f.cargo(second) === 0);
  expect(f.cargo()).toBe(10);
  f.until(() => f.cargo() === 0);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1020);
});

test("bank overflow retains all cargo and completed unload work until an atomic deposit fits", () => {
  const f = fixture();
  f.spawn();
  const bank = f.kernel.world.query(ForceBank)[0] as number;
  f.kernel.world.set(bank, ForceBank, "credits", 0x7fffffff - 9);
  f.until(() => f.state() === "bank_full");
  expect(f.cargo()).toBe(10);
  expect(f.kernel.world.get(f.id, Harvester, "unloadTicks")).toBe(40);
  const stocks = oreCells(f.kernel.world).map((value) => value.remaining);
  f.advance(20);
  expect(f.cargo()).toBe(10);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0x7fffffff - 9);
  expect(oreCells(f.kernel.world).map((value) => value.remaining)).toEqual(stocks);
  f.kernel.world.set(bank, ForceBank, "credits", 1000);
  f.advance(1);
  expect(f.cargo()).toBe(0);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1010);
});

test("accepted manual orders suspend harvesting without losing cargo or overriding the newer route; explicit harvest needs current unit grants", () => {
  const f = fixture({ capacity: 500 });
  f.until(() => f.cargo() === 2);
  expect(f.command("unit.harvest", 2)).toBe("no_grant");
  expect(f.command("unit.harvest", 5)).toBe("no_grant");
  const result = step(f.kernel, [
    {
      tick: f.kernel.tick,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [f.id], x: 8 * 1024 + 512, y: 25 * 1024 + 512 },
    },
  ]);
  expect(result[0]?.result).toBe("accepted");
  f.advance(10);
  expect(f.state()).toBe("idle");
  expect(f.cargo()).toBe(2);
  expect(f.kernel.world.has(f.id, MoveIntent)).toBe(true);
  expect(f.kernel.world.get(f.id, MoveIntent, "y")).toBe(25 * 1024 + 512);
  f.command("unit.stop");
  f.advance(20);
  expect(f.cargo()).toBe(2);
  expect(f.command("unit.harvest", 3)).toBe("accepted");
  f.until(() => f.cargo() > 2);
});

test("accepted friendly construction clearance keeps its new route and the truck's existing cargo", () => {
  const f = fixture();
  f.kernel.world.set(f.id, Transform, "x", 10 * 1024 + 512);
  f.kernel.world.set(f.id, Transform, "y", 10 * 1024 + 512);
  f.kernel.world.set(f.id, Harvester, "cargo", 2);
  const builder = f.kernel.world
    .query(Template)
    .find((id) => f.kernel.world.get(id, Template, "definition") === 1) as number;
  expect(
    step(f.kernel, [
      {
        tick: f.kernel.tick,
        seat: 1,
        sequence: 0,
        type: "economy.build",
        payload: {
          builders: [builder],
          definition: marker.id,
          force: 0,
          x: 10 * 1024,
          y: 10 * 1024,
          facing: 16384,
        },
      },
    ])[0]?.result,
  ).toBe("accepted");
  expect(f.kernel.world.get(f.id, Harvester, "enabled")).toBe(0);
  f.advance(30);
  expect(f.cargo()).toBe(2);
  expect(
    f.kernel.world
      .query(Template)
      .some((id) => f.kernel.world.get(id, Template, "definition") === 5),
  ).toBe(true);
});

test("depleted fields reselect reachable stock and absence of ore waits without minting cargo", () => {
  const f = fixture({
    capacity: 500,
    resources: toMatchResources([
      { kind: "ore", position: [18, 18], radius: 0, amount: 1 },
      { kind: "ore", position: [28, 28], radius: 0, amount: 3 },
    ]),
  });
  f.until(() => f.cargo() === 4);
  f.until(() => f.state() === "no_dropoff");
  expect(oreCells(f.kernel.world).every((value) => value.remaining === 0)).toBe(true);
  f.command("unit.stop");
  f.kernel.world.set(f.id, Harvester, "cargo", 0);
  f.command("unit.harvest");
  f.until(() => f.state() === "no_ore");
  f.advance(80);
  expect(f.cargo()).toBe(0);
});

test("disconnected stock is skipped rather than accepting a route snapped to reachable ground", () => {
  const f = fixture({
    split: true,
    capacity: 500,
    resources: toMatchResources([
      { kind: "ore", position: [18, 18], radius: 0, amount: 1 },
      { kind: "ore", position: [28, 28], radius: 0, amount: 3 },
    ]),
  });
  f.until(() => f.state() === "no_dropoff");
  expect(f.cargo()).toBe(1);
  expect(oreCells(f.kernel.world).filter((ore) => ore.remaining > 0)).toMatchObject([
    { remaining: 3 },
  ]);
});

test("destroyed trucks cannot deposit lost cargo and release their dock queue position", () => {
  const f = fixture();
  f.spawn();
  f.until(() => f.state() === "unloading");
  f.kernel.world.destroy(f.id);
  f.advance(80);
  expect(f.kernel.economy?.balance(0)?.credits).toBe(1000);
  const replacement = f.spawn(2, 16, 18);
  f.until(() => f.kernel.world.has(replacement, Harvester));
  f.until(() => f.kernel.economy?.balance(0)?.credits === 1010);
  expect(f.cargo(replacement)).toBe(0);
});

test("blocked exterior docks are not used and recover after clearance; rotated radius-aware points share production geometry", () => {
  for (const facing of [0, 16384, 32768, 49152]) {
    const f = fixture();
    const dock = f.spawn(3, 18, 10, facing);
    const point = perimeterPoint(
      depot,
      { x: 18 * 1024, y: 10 * 1024, facing },
      depot.exits?.[0] as NonNullable<Definition["exits"]>[number],
      truck.radiusSubcells as number,
    );
    const obstacle = f.spawn(4, Math.floor(point.x / 1024), Math.floor(point.y / 1024));
    f.until(() => f.state() === "no_dropoff");
    expect(f.cargo()).toBe(10);
    f.kernel.world.destroy(obstacle);
    f.until(() => f.state() === "unloading");
    expect(f.kernel.world.get(f.id, Harvester, "dock")).toBe(dock);
    expect({
      x: f.kernel.world.get(f.id, Transform, "x"),
      y: f.kernel.world.get(f.id, Transform, "y"),
    }).toEqual({ x: point.x, y: point.y });
  }
});

test("harvester state is canonical and copied projection exposes cargo only under current economic grants", () => {
  const f = fixture(),
    twin = fixture();
  f.until(() => f.cargo() === 2);
  twin.advance(f.kernel.tick);
  expect(checkpointHash(twin.kernel)).toBe(checkpointHash(f.kernel));
  const before = checkpointHash(f.kernel);
  f.kernel.world.set(f.id, Harvester, "miningWork", 1);
  expect(checkpointHash(f.kernel)).not.toBe(before);
  const economic = createProjection(f.setup, 2, "controlled");
  const visible = economic
    .snapshot(f.kernel)
    .entities.find((entity) => entity.definition === truck.id);
  expect(visible?.harvesting).toMatchObject({ cargo: 2, capacity: 10 });
  expect(economic.resolve(visible?.handle)).toBe(f.id);
  Reflect.set(visible?.harvesting as object, "cargo", 999);
  expect(f.cargo()).toBe(2);
  const observed = f.kernel.observe?.(2).entities.find((entity) => entity.harvesting)?.harvesting;
  expect(observed?.cargo).toBe(2);
  if (!observed) throw new Error("Missing permitted harvester observation");
  Reflect.set(observed, "cargo", 999);
  expect(
    f.kernel.observe?.(2).entities.find((entity) => entity.harvesting)?.harvesting?.cargo,
  ).toBe(2);
  expect(
    createProjection(f.setup, 3, "controlled")
      .snapshot(f.kernel)
      .entities.find((entity) => entity.definition === truck.id)?.harvesting,
  ).toBeUndefined();
  expect(createProjection(f.setup, 4, "controlled").snapshot(f.kernel).entities).toEqual([]);
  expect(createProjection(f.setup, 5, "controlled").snapshot(f.kernel).entities).toEqual([]);
});

test("missing or invalid mining metadata stays unavailable instead of silently defaulting", () => {
  const raw = {
    id: truck.id,
    role: "harvester",
    health: 900,
    movement: { domain: "wheeled", speed: 1.6 },
    radius: 0.8,
    harvest: { capacity: 500, amountPerSecond: 5 },
  };
  expect(toDefinition(raw)).toMatchObject({ harvestCapacity: 500, harvestAmountPerSecond: 5 });
  expect(
    validate(SCHEMAS.unit, { ...supplyTruck, harvest: { capacity: 500, amountPerSecond: 5 } }),
  ).toEqual([]);
  expect(
    toDefinition({ ...raw, harvest: { capacity: 500 } }).harvestAmountPerSecond,
  ).toBeUndefined();
  for (const rate of [0, -1, 0.5, 0x80000000]) {
    expect(() =>
      toDefinition({ ...raw, harvest: { capacity: 500, amountPerSecond: rate } }),
    ).toThrow();
    expect(
      validate(SCHEMAS.unit, { ...supplyTruck, harvest: { capacity: 500, amountPerSecond: rate } })
        .length,
    ).toBeGreaterThan(0);
  }
  expect(() => toDefinition({ ...raw, role: "combat" })).toThrow("only harvester");
});
