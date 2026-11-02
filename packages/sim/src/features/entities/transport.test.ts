import { expect, test } from "bun:test";
import { step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { createMatchRecord, verifyMatchRecord } from "../../snapshots";
import { flatMap } from "../../testing/maps";
import { MovementFailure } from "../movement";
import { CombatMotion, PendingImpact } from "../projectiles";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from ".";
import { Boarding, Cargo } from "./transport";

function fixture(configure?: (definitions: Definition[]) => void) {
  const definitions: Definition[] = [
    {
      id: "structure:transport/headquarters",
      role: "headquarters",
      health: 1000,
      speed: 0,
      turnRate: 0,
      footprint: [1, 1],
    },
    {
      id: "unit:transport/builder",
      role: "builder",
      health: 100,
      speed: 128,
      turnRate: 65536,
      domain: "foot",
      radiusSubcells: 256,
      visionSubcells: 1024,
    },
    {
      id: "unit:transport/apc",
      role: "transport",
      health: 600,
      speed: 128,
      turnRate: 65536,
      domain: "wheeled",
      radiusSubcells: 768,
      transportSlots: 5,
      visionSubcells: 1024,
    },
  ];
  configure?.(definitions);
  const setup: MatchSetup = {
    seed: 7,
    debug: false,
    definitions,
    map: {
      ...flatMap(40),
      spawns: [0, 1].map((index) => ({
        id: `s${index}`,
        position: [(6 + 24 * index) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    forces: [0, 1].map((index) => ({ index, faction: "faction:transport" })),
    seats: [1, 2],
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["unit.orders", "economy.build", "surrender"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        popCap: 200,
        structureCap: 150,
        fog: "off",
        highGroundMissPerMille: 0,
      },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `s${index}`,
        start: {
          structures: [definitions[0]!.id],
          units: [
            { unit: definitions[1]!.id, count: 1, pop: 1, role: "builder" },
            { unit: definitions[2]!.id, count: 1, pop: 2, role: "transport" },
          ],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup),
    world = kernel.world;
  const own = (index: number) =>
    world
      .query(Template, OwnerForce)
      .find(
        (id) =>
          world.get(id, Template, "definition") === index &&
          world.get(id, OwnerForce, "force") === 0,
      )!;
  const apc = own(2),
    infantry = own(1);
  const command = (type: string, payload: unknown, seat = 1) =>
    step(kernel, [{ type, payload, seat, tick: kernel.tick, sequence: 0 }])[0]!.result;
  return { setup, kernel, world, apc, infantry, command };
}

test("boarding reserves capacity atomically, preserves identity and removes spatial presence", () => {
  const f = fixture(),
    { world, kernel, apc, infantry, command } = f;
  const passengers = [
    infantry,
    ...Array.from({ length: 5 }, () =>
      spawnEntity(kernel, 1, f.setup.definitions[1]!, {
        definition: f.setup.definitions[1]!.id,
        force: 0,
        x: 12 * 1024 + 512,
        y: 12 * 1024 + 512,
        facing: 0,
      }),
    ),
  ];
  world.set(apc, Transform, "x", 12 * 1024 + 512);
  world.set(apc, Transform, "y", 12 * 1024 + 512);
  for (const id of passengers) {
    world.set(id, Transform, "x", 13 * 1024 + 512);
    world.set(id, Transform, "y", 12 * 1024 + 512);
  }
  expect(command("unit.load", { entity: apc, entities: passengers }, 2)).toBe("no_grant");
  expect(command("unit.load", { entity: apc, entities: passengers })).toBe("transport_full");
  expect(world.query(Boarding)).toHaveLength(0);
  expect(
    command("unit.load", { entity: apc, entities: [...passengers.slice(0, 5), infantry] }),
  ).toBe("accepted");
  expect(world.query(Cargo)).toEqual(passengers.slice(0, 5));
  expect(
    passengers
      .slice(0, 5)
      .every((id) => !world.has(id, Transform) && world.get(id, Health, "current") === 100),
  ).toBe(true);
  const projection = createProjection(f.setup, 1, "controlled").snapshot(kernel);
  expect(
    projection.entities.filter(
      (entity) => entity.definition === "unit:transport/builder" && entity.force === 0,
    ),
  ).toHaveLength(1);
  expect(
    command("unit.move", { entities: passengers.slice(0, 5), x: 18 * 1024, y: 18 * 1024 }),
  ).toBe("accepted");
  expect(command("unit.unload", { entity: apc })).toBe("accepted");
  expect(world.query(Cargo)).toHaveLength(0);
  const points = passengers
    .slice(0, 5)
    .map((id) => `${world.get(id, Transform, "x")}:${world.get(id, Transform, "y")}`);
  expect(new Set(points).size).toBe(5);
});

test("cargo manifests are copied and private, and boarded handles lose spatial authority", () => {
  const { setup, kernel, world, apc, infantry, command } = fixture();
  const projection = createProjection(setup, 1, "controlled");
  const initial = projection.snapshot(kernel);
  const old = initial.entities.find(
    (entity) => entity.definition === "unit:transport/builder" && entity.force === 0,
  )!.handle;
  world.set(infantry, Transform, "x", world.get(apc, Transform, "x") + 1024);
  world.set(infantry, Transform, "y", world.get(apc, Transform, "y"));
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(projection.resolve(old, "unit.orders")).toBeUndefined();
  const own = projection
    .snapshot(kernel)
    .entities.find((entity) => entity.definition === "unit:transport/apc" && entity.force === 0)!;
  expect(own.cargo?.passengers).toHaveLength(1);
  const enemy = createProjection(setup, 2, "controlled")
    .snapshot(kernel)
    .entities.find((entity) => entity.definition === own.definition && entity.force === 0)!;
  expect(enemy).toBeDefined();
  expect(enemy.cargo).toBeUndefined();
  const first = kernel.observe!(1).entities.find((entity) => entity.cargo?.passengers.length)!;
  first.cargo!.passengers[0]!.health = 1;
  expect(
    kernel.observe!(1).entities.find((entity) => entity.cargo?.passengers.length)?.cargo
      ?.passengers[0]?.health,
  ).toBe(100);
});

test("boarding revokes delayed direct targeting and release starts a fresh motion baseline", () => {
  const { setup, kernel, world, apc, infantry, command } = fixture((definitions) => {
    definitions[1]!.armor = "infantry";
    definitions[1]!.weapons = [
      {
        id: "delayed",
        targets: ["ground"],
        rangeSubcells: [0, 1024],
        reloadTicks: 20,
        projectile: { kind: "instant" },
        warheads: [{ type: "damage", amount: 10, delayTicks: 2, tags: [] }],
      },
    ];
  });
  const at = { x: world.get(apc, Transform, "x"), y: world.get(apc, Transform, "y") };
  world.set(infantry, Transform, "x", at.x + 1024);
  world.set(infantry, Transform, "y", at.y);
  step(kernel, []);
  const hit = world.create();
  world.add(hit, PendingImpact, {
    shooter: 0,
    force: 1,
    definition: 1,
    weapon: 0,
    direct: infantry,
    air: 0,
    ceiling: 255,
    x: at.x + 1024,
    y: at.y,
    fromX: at.x + 4096,
    fromY: at.y,
    tick: kernel.tick,
    remaining: 1,
  });
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(world.has(infantry, CombatMotion)).toBe(false);
  for (let ticks = 0; ticks < 3; ticks++) step(kernel, []);
  expect(world.get(infantry, Health, "current")).toBe(100);
  expect(world.isAlive(hit)).toBe(false);
  expect(kernel.transport?.unload(1, apc)).toBeUndefined();
  expect(world.get(infantry, CombatMotion, "x")).toBe(world.get(infantry, Transform, "x"));
  expect(world.get(infantry, CombatMotion, "y")).toBe(world.get(infantry, Transform, "y"));
  expect(setup.definitions[1]?.health).toBe(100);
});

test("boarding follows normal paths and stop replaces a pending reservation", () => {
  const { world, kernel, apc, infantry, command } = fixture();
  world.set(apc, Transform, "x", 14 * 1024 + 576);
  world.set(apc, Transform, "y", 12 * 1024 + 512);
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(world.has(infantry, Boarding)).toBe(true);
  expect(command("unit.stop", { entities: [infantry] })).toBe("accepted");
  expect(world.has(infantry, Boarding)).toBe(false);
  world.add(infantry, MovementFailure, { reason: 1 });
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(world.has(infantry, Boarding)).toBe(true);
  for (let ticks = 0; ticks < 240 && !world.has(infantry, Cargo); ticks++) step(kernel, []);
  expect(world.has(infantry, Cargo)).toBe(true);
  world.set(apc, Health, "current", 0);
  step(kernel, []);
  expect(world.has(infantry, Cargo)).toBe(false);
  expect(world.has(infantry, Transform)).toBe(true);
  expect(world.get(infantry, Health, "current")).toBe(50);
  expect(world.isAlive(apc)).toBe(false);
});

test("loaded builders cannot pay for construction and blocked exits retain or destroy cargo honestly", () => {
  const { setup, kernel, world, apc, infantry, command } = fixture((definitions) => {
    definitions.push({
      id: "structure:transport/relay",
      role: "defense",
      health: 100,
      speed: 0,
      turnRate: 0,
      footprint: [1, 1],
      construction: { cost: { credits: 10 }, buildTicks: 20 },
    });
    definitions[1]!.builds = ["structure:transport/relay"];
  });
  const at = { x: world.get(apc, Transform, "x"), y: world.get(apc, Transform, "y") };
  world.set(infantry, Transform, "x", at.x + 1024);
  world.set(infantry, Transform, "y", at.y);
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  const credits = kernel.economy!.balance(0)!.credits;
  expect(
    command("economy.build", {
      definition: "structure:transport/relay",
      force: 0,
      builders: [infantry],
      x: 9 * 1024,
      y: 10 * 1024,
      facing: 16384,
    }),
  ).toBe("bad_payload");
  expect(kernel.economy!.balance(0)!.credits).toBe(credits);
  const cx = Math.floor(at.x / 1024),
    cy = Math.floor(at.y / 1024);
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++) {
      if (!x && !y) continue;
      spawnEntity(kernel, 1, setup.definitions[1]!, {
        definition: setup.definitions[1]!.id,
        force: 0,
        x: (cx + x) * 1024 + 512,
        y: (cy + y) * 1024 + 512,
        facing: 0,
      });
    }
  expect(command("unit.unload", { entity: apc })).toBe("placement_failed");
  expect(world.has(infantry, Cargo)).toBe(true);
  world.set(apc, Health, "current", 0);
  step(kernel, []);
  expect(world.isAlive(infantry)).toBe(false);
  expect(
    kernel.combatEvents?.some((event) => event.type === "death" && event.entity === infantry) ??
      false,
  ).toBe(false);
  const counters = kernel.statistics!.snapshot(1).find((row) => row.force === 0)!.counters;
  expect(counters.unitsLost).toBe(1);
  expect(counters.damageTaken).toBe(100);
});

test("accepted boarding and unload inputs reproduce a terminal match record", () => {
  const { setup, kernel, world, apc, infantry, command } = fixture();
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  for (let ticks = 0; ticks < 240 && !world.has(infantry, Cargo); ticks++) step(kernel, []);
  expect(world.has(infantry, Cargo)).toBe(true);
  expect(command("unit.unload", { entity: apc })).toBe("accepted");
  expect(command("match.surrender", { force: 0 })).toBe("accepted");
  const record = createMatchRecord(kernel, setup);
  expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
});

test("a carrier dying during approach cancels its reservation and stale numeric targets refuse safely", () => {
  const { kernel, world, apc, infantry, command } = fixture();
  world.set(apc, Transform, "x", 18 * 1024 + 512);
  world.set(apc, Transform, "y", 14 * 1024 + 512);
  let killed = false;
  kernel.systems.combat.push(() => {
    if (!killed) {
      world.set(apc, Health, "current", 0);
      killed = true;
    }
  });
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(world.isAlive(apc)).toBe(false);
  expect(world.has(infantry, Boarding)).toBe(true);
  step(kernel, []);
  expect(world.has(infantry, Boarding)).toBe(false);
  expect(world.has(infantry, Transform)).toBe(true);
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("bad_payload");
  expect(command("unit.unload", { entity: apc })).toBe("bad_payload");
});
