import { expect, test } from "bun:test";
import { step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { createMatchRecord, verifyMatchRecord } from "../../snapshots";
import { flatMap } from "../../testing/maps";
import { AttackOrder, WeaponState } from "../combat";
import { initializeBurn } from "../combat/burn";
import { applyWarhead } from "../combat/damage";
import { Disabled } from "../combat/disable";
import { ORDER_REFUSALS, QueuedOrder } from "../control/orders";
import { MoveIntent, MovementFailure } from "../movement";
import { CombatMotion, PendingImpact, Projectile } from "../projectiles";
import { ForceStatistics } from "../victory/statistics";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from ".";
import { Boarding, Cargo } from "./transport";

function fixture(configure?: (definitions: Definition[]) => void, fog: "off" | "standard" = "off") {
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
      scopes: ["unit.orders", "unit.abilities", "economy.build", "surrender"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        popCap: 200,
        structureCap: 150,
        fog,
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

test("queued partial unload waits for all exits before following movement starts", () => {
  const f = fixture(),
    { world, kernel, apc, infantry } = f;
  const passenger = spawnEntity(kernel, 1, f.setup.definitions[1]!, {
    definition: f.setup.definitions[1]!.id,
    force: 0,
    x: 13 * 1024 + 512,
    y: 12 * 1024 + 512,
    facing: 0,
  });
  for (const id of [apc, infantry]) {
    world.set(id, Transform, "x", (id === apc ? 12 : 13) * 1024 + 512);
    world.set(id, Transform, "y", 12 * 1024 + 512);
  }
  expect(f.command("unit.load", { entity: apc, entities: [infantry, passenger] })).toBe("accepted");
  expect(world.query(Cargo)).toHaveLength(2);
  const blockers: number[] = [];
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++) {
      if ((!x && !y) || (!x && y === 1)) continue;
      blockers.push(
        spawnEntity(kernel, 1, f.setup.definitions[1]!, {
          definition: f.setup.definitions[1]!.id,
          force: 1,
          x: (12 + x) * 1024 + 512,
          y: (12 + y) * 1024 + 512,
          facing: 0,
        }),
      );
    }
  step(kernel, [
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 0,
      type: "unit.unload",
      payload: { entity: apc, append: 1 },
    },
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 1,
      type: "unit.move",
      payload: { entities: [apc], x: 25 * 1024 + 512, y: 12 * 1024 + 512, append: 1 },
    },
  ]);
  expect(world.query(Cargo)).toHaveLength(1);
  expect(kernel.orders!.rows(apc)).toHaveLength(2);
  expect(ORDER_REFUSALS[world.get(kernel.orders!.rows(apc)[0]!, QueuedOrder, "reason") - 1]).toBe(
    "unload_blocked",
  );
  expect(world.has(apc, MoveIntent)).toBe(false);
  step(kernel, []);
  expect(kernel.orders!.rows(apc)).toHaveLength(2);
  expect(world.query(Cargo)).toHaveLength(1);
  expect(world.has(apc, MoveIntent)).toBe(false);
  for (const blocker of blockers) world.destroy(blocker);
  step(kernel, []);
  step(kernel, []);
  expect(world.query(Cargo)).toHaveLength(0);
  expect(world.has(apc, MoveIntent)).toBe(true);
});

test("queued passenger movement survives ordinary unloading but is cleared by emergency ejection", () => {
  for (const emergency of [false, true]) {
    const f = fixture(),
      { world, kernel, apc, infantry } = f;
    world.set(apc, Transform, "x", 12 * 1024 + 512);
    world.set(apc, Transform, "y", 12 * 1024 + 512);
    world.set(infantry, Transform, "x", 13 * 1024 + 512);
    world.set(infantry, Transform, "y", 12 * 1024 + 512);
    step(kernel, [
      {
        tick: kernel.tick,
        seat: 1,
        sequence: 0,
        type: "unit.load",
        payload: { entities: [infantry], entity: apc, append: 1 },
      },
      {
        tick: kernel.tick,
        seat: 1,
        sequence: 1,
        type: "unit.move",
        payload: { entities: [infantry], x: 20 * 1024 + 512, y: 12 * 1024 + 512, append: 1 },
      },
    ]);
    step(kernel, []);
    expect(world.has(infantry, Cargo)).toBe(true);
    expect(kernel.orders!.rows(infantry)).toHaveLength(1);
    if (emergency) {
      world.set(apc, Health, "current", 0);
      step(kernel, []);
    } else expect(f.command("unit.unload", { entity: apc })).toBe("accepted");
    expect(world.has(infantry, Cargo)).toBe(false);
    expect(kernel.orders!.rows(infantry)).toHaveLength(0);
    expect(world.has(infantry, MoveIntent)).toBe(!emergency);
  }
});

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

function bunkerFixture(
  fog: "off" | "standard" = "off",
  bullet = false,
  arrange = true,
  emp = false,
) {
  const f = fixture((definitions) => {
    definitions[1]!.armor = "infantry";
    definitions[1]!.visionSubcells = 20 * 1024;
    definitions[1]!.weapons = [
      {
        id: "rifle",
        targets: ["ground"],
        rangeSubcells: [0, (bullet ? 3 : 2) * 1024],
        reloadTicks: 100,
        projectile: bullet
          ? { kind: "bullet", speedSubcellsPerTick: 256, blockedBy: ["units", "structures"] }
          : { kind: "instant", blockedBy: ["units", "structures"] },
        warheads: [
          { type: "damage", amount: 10, tags: [] },
          ...(emp ? [{ type: "disable", durationTicks: 20, tags: ["emp"] }] : []),
        ],
      },
    ];
    definitions[2]!.deployMode = {
      id: "bunker",
      cooldownTicks: 3,
      damagePerMille: 2000,
      armorPerMille: 1500,
      rangePerMille: 1000,
      rangeBonusSubcells: 3072,
      cost: {},
    };
    definitions[2]!.transportFireWhileDeployed = true;
    definitions.push({
      id: "unit:transport/spotter",
      role: "support",
      health: 100,
      speed: 100,
      turnRate: 65536,
      domain: "foot",
      radiusSubcells: 256,
      visionSubcells: 10 * 1024,
    });
  }, fog);
  const enemy = f.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        f.world.get(id, Template, "definition") === 2 && f.world.get(id, OwnerForce, "force") === 1,
    )!;
  const position = (id: number, x: number, y: number) => {
    f.world.set(id, Transform, "x", x);
    f.world.set(id, Transform, "y", y);
  };
  if (arrange) {
    position(f.apc, 12 * 1024 + 512, 12 * 1024 + 512);
    position(f.infantry, 13 * 1024 + 512, 12 * 1024 + 512);
    position(enemy, 15 * 1024 + 512, 12 * 1024 + 512);
  }
  return { ...f, enemy, position };
}

test("mixed attack ignores a packed unarmed carrier without erasing its newly queued move", () => {
  const f = bunkerFixture(),
    { world, kernel, apc, infantry, enemy } = f;
  f.command("unit.load", { entity: apc, entities: [infantry] });
  f.command("unit.deploy", { entities: [apc] });
  f.command("unit.attack", { entities: [apc], entity: enemy });
  step(kernel, []);
  step(kernel, []);
  const armed = spawnEntity(kernel, 1, f.setup.definitions[1]!, {
    definition: f.setup.definitions[1]!.id,
    force: 0,
    x: 13 * 1024 + 512,
    y: 14 * 1024 + 512,
    facing: 0,
  });
  let pending = -1;
  kernel.systems.ingest.push(() => {
    pending = kernel.orders!.rows(apc).length;
  });
  const result = step(kernel, [
    { tick: kernel.tick, seat: 1, sequence: 0, type: "unit.deploy", payload: { entities: [apc] } },
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 1,
      type: "unit.move",
      payload: { entities: [apc], x: 20 * 1024 + 512, y: 12 * 1024 + 512, append: 1 },
    },
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 2,
      type: "unit.attack",
      payload: { entities: [apc, armed], entity: enemy },
    },
  ]);
  expect(result.map((row) => row.result)).toEqual(["accepted", "accepted", "accepted"]);
  expect(pending).toBe(1);
  expect(world.has(apc, MoveIntent)).toBe(true);
});

test("deployed cargo uses its own range/damage and keeps reload across pack and unload", () => {
  const { kernel, world, apc, infantry, enemy, command, position } = bunkerFixture();
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  for (let ticks = 0; ticks < 4; ticks++) step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(600);
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  expect(world.get(enemy, Health, "current")).toBe(600);
  expect(kernel.transport?.snapshot(apc)?.firing).toBe(true);
  position(enemy, 14 * 1024, 12 * 1024 + 512);
  expect(command("unit.attack", { entities: [apc], entity: enemy })).toBe("accepted");
  expect(world.get(enemy, Health, "current")).toBe(590);
  expect(world.get(apc, Health, "current")).toBe(600);
  const state = world
    .query(WeaponState)
    .find((id) => world.get(id, WeaponState, "shooter") === infantry)!;
  const reloadAt = world.get(state, WeaponState, "reloadAt");
  for (let ticks = 0; ticks < 3; ticks++) step(kernel, []);
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  expect(kernel.transport?.snapshot(apc)?.firing).toBe(false);
  for (let ticks = 0; ticks < 3; ticks++) step(kernel, []);
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  expect(world.get(enemy, Health, "current")).toBe(590);
  expect(command("unit.unload", { entity: apc })).toBe("accepted");
  expect(world.get(state, WeaponState, "reloadAt")).toBe(reloadAt);
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  for (let ticks = 0; ticks < 40 && !world.has(infantry, Cargo); ticks++) step(kernel, []);
  expect(world.has(infantry, Cargo)).toBe(true);
  expect(world.get(state, WeaponState, "reloadAt")).toBe(reloadAt);
  while (kernel.tick < reloadAt) step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(590);
  step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(580);
});

test("EMP pauses mounted weapons and mode/cargo actions, retaining cargo and elapsed reload", () => {
  const { kernel, world, apc, infantry, enemy, command, position } = bunkerFixture(
    "off",
    false,
    true,
    true,
  );
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  position(enemy, 14 * 1024, 12 * 1024 + 512);
  expect(command("unit.attack", { entities: [apc], entity: enemy })).toBe("accepted");
  const state = world
    .query(WeaponState)
    .find((id) => world.get(id, WeaponState, "shooter") === infantry)!;
  const reloadAt = world.get(state, WeaponState, "reloadAt");
  world.add(apc, Disabled, { until: kernel.tick + 120 });
  expect(command("unit.deploy", { entities: [apc] })).toBe("immobile");
  expect(command("unit.unload", { entity: apc })).toBe("immobile");
  expect(kernel.transport?.snapshot(apc)?.firing).toBe(false);
  const health = world.get(enemy, Health, "current");
  expect(world.get(apc, AttackOrder, "target")).toBe(enemy);
  for (let i = 0; i < 118; i++) step(kernel, []);
  expect(world.has(infantry, Cargo)).toBe(true);
  expect(world.has(infantry, Transform)).toBe(false);
  expect(world.get(state, WeaponState, "reloadAt")).toBe(reloadAt);
  expect(world.get(enemy, Health, "current")).toBe(health);
  expect(world.get(apc, AttackOrder, "target")).toBe(enemy);
  step(kernel, []);
  expect(kernel.unitModes?.snapshot(apc)?.active).toBe(true);
  expect(world.get(enemy, Health, "current")).toBe(health - 10);
});

test("cargo never contributes sight and firing effects identify only the carrier", () => {
  const { setup, kernel, world, apc, infantry, enemy, command } = bunkerFixture("standard");
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  for (let ticks = 0; ticks < 4; ticks++) step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(600);
  expect(kernel.vision?.canSeeEntity(0, enemy)).toBe(false);
  spawnEntity(kernel, 3, setup.definitions[3]!, {
    definition: setup.definitions[3]!.id,
    force: 0,
    x: 12 * 1024 + 512,
    y: 14 * 1024 + 512,
    facing: 0,
  });
  // Target is visible now but still beyond the passenger's two-cell weapon range.
  step(kernel, []);
  expect(kernel.vision?.canSeeEntity(0, enemy)).toBe(true);
  expect(world.get(enemy, Health, "current")).toBe(600);
  world.set(enemy, Transform, "x", 14 * 1024);
  step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(590);
  const projection = createProjection(setup, 1, "controlled").snapshot(kernel);
  const carrier = projection.entities.find(
    (entity) => entity.force === 0 && entity.definition === "unit:transport/apc",
  )!;
  expect(carrier.cargo?.firing).toBe(true);
  expect(
    projection.combatEvents
      ?.filter((event) => event.type === "launch")
      .map((event) => event.entity),
  ).toEqual([carrier.handle]);
  expect(
    projection.entities.some(
      (entity) => entity.force === 0 && entity.definition === "unit:transport/builder",
    ),
  ).toBe(false);
  const foreign = createProjection(setup, 2, "controlled").snapshot(kernel);
  expect(
    foreign.entities.find(
      (entity) => entity.force === 0 && entity.definition === carrier.definition,
    )?.cargo,
  ).toBeUndefined();
});

test("already-launched passenger rounds survive packing and carrier destruction", () => {
  const { kernel, world, apc, infantry, enemy, command, position } = bunkerFixture("off", true);
  position(enemy, 15 * 1024, 12 * 1024 + 512);
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  const shot = world.query(Projectile).find((id) => world.get(id, Projectile, "force") === 0)!;
  expect(world.get(shot, Projectile, "life")).toBe(24);
  expect(world.get(shot, Projectile, "shooter")).toBe(apc);
  expect(world.get(shot, Projectile, "definition")).toBe(1);
  for (let ticks = 0; ticks < 3; ticks++) step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(600);
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  world.set(apc, Health, "current", 0);
  step(kernel, []);
  expect(world.isAlive(apc)).toBe(false);
  for (let ticks = 0; ticks < 12; ticks++) step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(590);
  expect(world.get(infantry, Health, "current")).toBe(50);
});

test("forward passenger weapons turn privately and carrier stop interrupts their burst", () => {
  const base = bunkerFixture();
  const weapon = base.setup.definitions[1]?.weapons?.[0];
  if (!weapon) throw new Error("Missing fixture rifle");
  const setup = {
    ...base.setup,
    definitions: base.setup.definitions.map((definition, index) =>
      index === 1
        ? {
            ...definition,
            weapons: [{ ...weapon, aim: "forward" as const, burst: { count: 3, delayTicks: 2 } }],
          }
        : definition,
    ),
  };
  const kernel = createMatch(setup),
    world = kernel.world;
  const own = (definition: number, force: number) =>
    world
      .query(Template, OwnerForce)
      .find(
        (id) =>
          world.get(id, Template, "definition") === definition &&
          world.get(id, OwnerForce, "force") === force,
      )!;
  const apc = own(2, 0),
    infantry = own(1, 0),
    enemy = own(2, 1);
  for (const [id, x, y, facing] of [
    [apc, 12 * 1024 + 512, 12 * 1024 + 512, 16384],
    [infantry, 13 * 1024 + 512, 12 * 1024 + 512, 32768],
    [enemy, 14 * 1024, 12 * 1024 + 512, 0],
  ]) {
    world.set(id!, Transform, "x", x!);
    world.set(id!, Transform, "y", y!);
    world.set(id!, Transform, "facing", facing!);
  }
  const command = (type: string, payload: unknown) =>
    step(kernel, [{ type, payload, seat: 1, tick: kernel.tick, sequence: 0 }])[0]!.result;
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  expect(world.get(enemy, Health, "current")).toBe(590);
  expect(world.get(apc, Transform, "facing")).toBe(16384);
  expect(world.has(infantry, Transform)).toBe(false);
  const state = world
    .query(WeaponState)
    .find((id) => world.get(id, WeaponState, "shooter") === infantry)!;
  expect(world.get(state, WeaponState, "remaining")).toBe(2);
  expect(command("unit.stop", { entities: [apc] })).toBe("accepted");
  expect(world.get(state, WeaponState, "remaining")).toBe(0);
  for (let ticks = 0; ticks < 6; ticks++) step(kernel, []);
  expect(world.get(enemy, Health, "current")).toBe(590);
});

test("a terminal record reproduces real boarding, travel and mounted combat from its starting kit", () => {
  const { setup, kernel, world, apc, infantry, enemy, command } = bunkerFixture("off", true, false);
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  for (let ticks = 0; ticks < 240 && !world.has(infantry, Cargo); ticks++) step(kernel, []);
  expect(world.has(infantry, Cargo)).toBe(true);
  expect(
    command("unit.move", {
      entities: [apc],
      x: world.get(enemy, Transform, "x") - 2 * 1024,
      y: world.get(enemy, Transform, "y"),
    }),
  ).toBe("accepted");
  for (let ticks = 0; ticks < 400 && world.has(apc, MoveIntent); ticks++) step(kernel, []);
  expect(command("unit.deploy", { entities: [apc] })).toBe("accepted");
  const victim = world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        world.get(id, Template, "definition") === 1 && world.get(id, OwnerForce, "force") === 1,
    )!;
  for (let ticks = 0; ticks < 30 && world.get(victim, Health, "current") === 100; ticks++)
    step(kernel, []);
  expect(world.get(victim, Health, "current")).toBe(90);
  expect(world.get(enemy, Health, "current")).toBe(600);
  expect(world.has(infantry, Transform)).toBe(false);
  expect(command("match.surrender", { force: 0 })).toBe("accepted");
  const record = createMatchRecord(kernel, setup);
  expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
});

test("an attached burn persists aboard and simultaneous carrier death cannot revive or expose dead cargo", () => {
  const { setup, kernel, world, apc, infantry, command } = bunkerFixture();
  const weapon = {
    id: "fire",
    targets: ["ground"],
    rangeSubcells: [0, 1024] as const,
    reloadTicks: 20,
    projectile: { kind: "beam" },
    warheads: [{ type: "burn", amountPerSecond: 20, durationTicks: 20, tags: ["fire"] }],
  };
  initializeBurn(
    kernel,
    setup.definitions.map((definition, index) =>
      index === 1 ? { ...definition, weapons: [weapon] } : definition,
    ),
  );
  world.set(infantry, Health, "current", 2);
  applyWarhead(
    kernel,
    setup.definitions,
    weapon,
    weapon.warheads[0]!,
    {
      force: 1,
      direct: infantry,
      x: world.get(infantry, Transform, "x"),
      y: world.get(infantry, Transform, "y"),
      fromX: 0,
      fromY: 0,
      air: false,
      maxLevel: 255,
    },
    false,
  );
  expect(command("unit.load", { entity: apc, entities: [infantry] })).toBe("accepted");
  expect(world.has(infantry, Transform)).toBe(false);
  expect(world.get(infantry, Health, "current")).toBe(1);
  world.set(apc, Health, "current", 0);
  step(kernel, []);
  expect(world.isAlive(infantry)).toBe(false);
  expect(world.isAlive(apc)).toBe(false);
  expect(kernel.combatEvents?.some((event) => event.entity === infantry)).toBe(false);
  const own = world
    .query(ForceStatistics)
    .find((id) => world.get(id, ForceStatistics, "force") === 0)!;
  const enemy = world
    .query(ForceStatistics)
    .find((id) => world.get(id, ForceStatistics, "force") === 1)!;
  expect(world.get(own, ForceStatistics, "unitsLost")).toBe(1);
  expect(world.get(own, ForceStatistics, "damageTaken")).toBe(2);
  expect(world.get(enemy, ForceStatistics, "unitsDestroyed")).toBe(1);
});
