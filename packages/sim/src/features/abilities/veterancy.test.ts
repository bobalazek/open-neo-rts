import { expect, test } from "bun:test";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { createMatchRecord, verifyMatchRecord } from "../../snapshots";
import { flatMap } from "../../testing/maps";
import { applyBurn } from "../combat/burn";
import { applyWarhead } from "../combat/damage";
import { Disabled } from "../combat/disable";
import {
  type Definition,
  entitiesFeature,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
} from "../entities";
import { Cargo } from "../entities/transport";
import type { GameplayWeapon } from "../entities/weapons";
import { PendingImpact, Projectile } from "../projectiles";
import { ExperienceYield, initializeVeterancy, UnitExperience } from "./veterancy";

const weapon: GameplayWeapon = {
  id: "gun",
  targets: ["ground"],
  rangeSubcells: [0, 32 * 1024],
  reloadTicks: 1000,
  projectile: { kind: "instant" },
  warheads: [{ type: "damage", amount: 100, tags: [] }],
};
function fixture(
  options: {
    off?: boolean;
    targetHealth?: number;
    targetCost?: number;
    sourceCost?: number;
    weapon?: GameplayWeapon;
    carrier?: boolean;
  } = {},
) {
  const definitions: Definition[] = [
    {
      id: "structure:experience/headquarters",
      role: "headquarters",
      health: 1000,
      speed: 0,
      turnRate: 0,
      footprint: [1, 1],
    },
    {
      id: "unit:experience/soldier",
      role: "combat",
      health: 100,
      speed: 64,
      turnRate: 65536,
      domain: "foot",
      radiusSubcells: 128,
      armor: "infantry",
      visionSubcells: 32 * 1024,
      pop: 1,
      construction: { cost: { credits: options.sourceCost ?? 100 }, buildTicks: 1 },
      deployMode: {
        id: "siege-mode",
        cooldownTicks: 1,
        damagePerMille: 1250,
        armorPerMille: 1000,
        rangePerMille: 1000,
        rangeBonusSubcells: 0,
        cost: {},
      },
      weapons: [options.weapon ?? weapon],
    },
    {
      // Starting kits sort IDs; the dummy must spawn beside, rather than behind, its HQ.
      id: "unit:experience/a-target",
      role: "combat",
      health: options.targetHealth ?? 100,
      speed: 64,
      turnRate: 0,
      domain: "foot",
      radiusSubcells: 128,
      armor: "infantry",
      pop: 1,
      construction: { cost: { credits: options.targetCost ?? 100 }, buildTicks: 1 },
    },
    {
      id: "unit:experience/carrier",
      role: "transport",
      health: 500,
      speed: 64,
      turnRate: 65536,
      domain: "wheeled",
      radiusSubcells: 128,
      pop: 1,
      transportSlots: 3,
      transportFireWhileDeployed: true,
      deployMode: {
        id: "bunker-mode",
        cooldownTicks: 1,
        damagePerMille: 1000,
        armorPerMille: 1000,
        rangePerMille: 1000,
        rangeBonusSubcells: 0,
        cost: {},
      },
    },
    {
      id: "unit:experience/builder",
      role: "builder",
      health: 100,
      speed: 64,
      turnRate: 0,
      domain: "foot",
      radiusSubcells: 128,
      pop: 1,
      builds: [],
    },
  ];
  const setup: MatchSetup = {
    seed: 7,
    debug: false,
    definitions,
    map: {
      ...flatMap(48),
      spawns: [0, 1].map((i) => ({
        id: `s${i}`,
        position: [6 * 1024, (8 + i * 24) * 1024] as const,
        facing: 0,
      })),
    },
    forces: [0, 1].map((index) => ({ index, faction: "faction:experience" })),
    seats: [1, 2, 3],
    grants: [
      ...[0, 1].map((force) => ({
        seat: force + 1,
        force,
        scopes: ["unit.orders", "unit.abilities", "surrender"] as const,
        grantedAtTick: 0,
      })),
      { seat: 3, force: 0, scopes: ["economy.build"], grantedAtTick: 0 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        popCap: 200,
        structureCap: 150,
        fog: "off",
        veterancy: !options.off,
        highGroundMissPerMille: 0,
      },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `s${index}`,
        start: {
          structures: [definitions[0]!.id],
          resources: { credits: 1000 },
          units: [
            { unit: definitions[index === 0 ? 1 : 2]!.id, count: 1, pop: 1, role: "combat" },
            { unit: definitions[4]!.id, count: 1, pop: 1, role: "builder" },
            ...(options.carrier && index === 0
              ? [{ unit: definitions[3]!.id, count: 1, pop: 1, role: "transport" }]
              : []),
          ],
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const actor = (index: number) =>
    kernel.world
      .query(Template)
      .find((id) => kernel.world.get(id, Template, "definition") === index)!;
  return { kernel, setup, definitions, source: actor(1), target: actor(2), carrier: actor(3) };
}
function hit(
  f: Pick<ReturnType<typeof fixture>, "kernel" | "definitions" | "source" | "target">,
  amount: number,
  target = f.target,
  source = f.source,
  radius = 0,
  force = 0,
) {
  const { world } = f.kernel;
  const x = world.get(target, Transform, "x"),
    y = world.get(target, Transform, "y");
  applyWarhead(
    f.kernel,
    f.definitions,
    weapon,
    { type: "damage", amount, tags: [], radiusSubcells: radius, friendlyFire: true },
    { source, force, direct: target, x, y, fromX: x - 1024, fromY: y, air: false, maxLevel: 2 },
    true,
  );
}
function anotherTarget(f: ReturnType<typeof fixture>) {
  return spawnEntity(f.kernel, 2, f.definitions[2]!, {
    definition: f.definitions[2]!.id,
    force: 1,
    x: 35 * 1024,
    y: 8 * 1024,
    facing: 0,
  });
}

test("actual hostile damage earns three bounded ranks; promotions preserve missing HP and target healing never refills XP", () => {
  const f = fixture(),
    { world } = f.kernel;
  world.set(f.source, Health, "current", 80);
  hit(f, 1000);
  expect(f.kernel.veterancy?.snapshot(f.source, true)).toEqual({
    rank: 1,
    xp: 100 * 1024,
    nextXp: 200 * 1024,
  });
  expect(world.get(f.source, Health, "current")).toBe(90);
  expect(f.kernel.veterancy?.maxHealth(f.source, 100)).toBe(110);
  world.set(f.target, Health, "current", 100);
  hit(f, 100);
  expect(f.kernel.veterancy?.snapshot(f.source, true)?.xp).toBe(100 * 1024);
  expect(world.get(f.target, ExperienceYield, "used")).toBe(100);
  for (let i = 0; i < 4; i++) hit(f, 100, anotherTarget(f));
  expect(f.kernel.veterancy?.snapshot(f.source, true)).toEqual({
    rank: 3,
    xp: 400 * 1024,
    nextXp: 400 * 1024,
  });
  expect(f.kernel.veterancy?.damageBonus(f.source)).toBe(300);
  expect(world.get(f.source, Health, "current")).toBe(110);
});

test("small hits carry exact target XP fractions, and dead or transferred sources cannot claim consumed damage", () => {
  const small = fixture({ targetHealth: 3, targetCost: 1 });
  for (let i = 0; i < 3; i++) hit(small, 1);
  expect(small.kernel.veterancy?.snapshot(small.source, true)?.xp).toBe(1024);
  expect(small.kernel.world.get(small.target, ExperienceYield, "carry")).toBe(0);
  for (const transfer of [false, true]) {
    const f = fixture();
    if (transfer) f.kernel.world.set(f.source, OwnerForce, "force", 1);
    else f.kernel.world.destroy(f.source);
    hit(f, 50);
    if (transfer) f.kernel.world.set(f.source, OwnerForce, "force", 0);
    else
      f.source = spawnEntity(f.kernel, 1, f.definitions[1]!, {
        definition: f.definitions[1]!.id,
        force: 0,
        x: 4096,
        y: 4096,
        facing: 0,
      });
    hit(f, 50);
    expect(f.kernel.veterancy?.snapshot(f.source, true)?.xp).toBe(50 * 1024);
  }
});

test("allied splash causes actual damage without XP, structures cannot rank, and zero-value targets give no reward", () => {
  const f = fixture();
  f.kernel.world.set(f.target, OwnerForce, "force", 0);
  hit(f, 10, f.target, f.source, 256);
  expect(f.kernel.world.get(f.target, Health, "current")).toBe(90);
  expect(f.kernel.veterancy?.snapshot(f.source, true)).toBeUndefined();
  f.kernel.world.set(f.target, OwnerForce, "force", 1);
  const hq = f.kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        f.kernel.world.get(id, Template, "definition") === 0 &&
        f.kernel.world.get(id, OwnerForce, "force") === 0,
    )!;
  hit(f, 20, f.target, hq);
  expect(f.kernel.veterancy?.snapshot(hq, true)).toBeUndefined();
  const free = fixture({ targetCost: 0 });
  hit(free, 100);
  expect(free.kernel.veterancy?.snapshot(free.source, true)).toBeUndefined();
});

test("top-rank repair carries one percent per second, waits after damage, pauses under EMP, and never revives", () => {
  const f = fixture(),
    { world } = f.kernel;
  for (let i = 0; i < 4; i++) hit(f, 100, i ? anotherTarget(f) : f.target);
  world.set(f.source, Health, "current", 100);
  f.kernel.veterancy!.damaged(f.source);
  for (let tick = 0; tick < 100; tick++) {
    f.kernel.tick = tick;
    f.kernel.veterancy!.repair();
  }
  expect(world.get(f.source, Health, "current")).toBe(100);
  for (let tick = 100; tick < 120; tick++) {
    f.kernel.tick = tick;
    f.kernel.veterancy!.repair();
  }
  expect(world.get(f.source, Health, "current")).toBe(101);
  expect(world.get(f.source, UnitExperience, "repairCarry")).toBe(600);
  world.register(Disabled);
  world.add(f.source, Disabled, { until: 1000 });
  f.kernel.disabled = (entity) => world.has(entity, Disabled);
  f.kernel.veterancy!.repair();
  expect(world.get(f.source, UnitExperience, "repairCarry")).toBe(600);
  f.kernel.veterancy!.damaged(f.source);
  expect(world.get(f.source, UnitExperience, "repairCarry")).toBe(0);
  world.set(f.source, Health, "current", 0);
  f.kernel.tick = 1000;
  f.kernel.veterancy!.repair();
  expect(world.get(f.source, Health, "current")).toBe(0);
});

test("visible rank and effective health are public; exact XP and copied observations require current army permission", () => {
  const f = fixture();
  hit(f, 100);
  const own = createProjection(f.setup, 1, "controlled")
    .snapshot(f.kernel)
    .entities.find((row) => row.definition.endsWith("/soldier"))!;
  const enemy = createProjection(f.setup, 2, "controlled")
    .snapshot(f.kernel)
    .entities.find((row) => row.definition.endsWith("/soldier"))!;
  const economic = createProjection(f.setup, 3, "controlled")
    .snapshot(f.kernel)
    .entities.find((row) => row.definition.endsWith("/soldier"))!;
  expect(own.veterancy).toEqual({ rank: 1, xp: 102400, nextXp: 204800 });
  expect(enemy.veterancy).toEqual({ rank: 1 });
  expect(economic.veterancy).toEqual({ rank: 1 });
  expect(enemy.maxHealth).toBe(110);
  f.kernel.captureObservations?.();
  const copy = f.kernel.observe!(1).entities.find((row) => row.veterancy)?.veterancy;
  copy!.xp = 999999;
  expect(f.kernel.observe!(1).entities.find((row) => row.veterancy)?.veterancy?.xp).toBe(102400);
});

test("first XP and promotion retain the actual damage cooldown from before experience existed", () => {
  const f = fixture();
  hit(f, 20, f.source, f.target, 0, 1);
  expect(f.kernel.world.has(f.source, UnitExperience)).toBe(false);
  expect(f.kernel.world.get(f.source, ExperienceYield, "damagedAt")).toBe(0);
  f.kernel.tick = 200;
  for (let i = 0; i < 4; i++) hit(f, 100, i ? anotherTarget(f) : f.target);
  expect(f.kernel.veterancy?.rank(f.source)).toBe(3);
  expect(f.kernel.world.get(f.source, Health, "current")).toBe(110);
  for (let tick = 200; tick < 220; tick++) {
    f.kernel.tick = tick;
    f.kernel.veterancy!.repair();
  }
  expect(f.kernel.world.get(f.source, Health, "current")).toBe(111);
  expect(f.kernel.world.get(f.source, UnitExperience, "repairCarry")).toBe(600);
});

test("rank and deploy damage bonuses add to the base rather than multiplying each other", () => {
  const f = fixture({ targetHealth: 200 });
  hit(f, 200);
  const target = anotherTarget(f);
  step(f.kernel, [
    { tick: 0, sequence: 0, seat: 1, type: "unit.deploy", payload: { entities: [f.source] } },
    {
      tick: 0,
      sequence: 1,
      seat: 1,
      type: "unit.attack",
      payload: { entities: [f.source], entity: target },
    },
  ]);
  expect(f.kernel.world.get(target, Health, "current")).toBe(65);
});

test("extreme authored values keep rank XP and thresholds inside u32 storage", () => {
  const f = fixture({ sourceCost: 0x7fffffff, targetCost: 0x7fffffff, targetHealth: 1 });
  for (let i = 0; i < 5; i++) hit(f, 0x7fffffff, i ? anotherTarget(f) : f.target);
  expect(f.kernel.veterancy?.snapshot(f.source, true)).toEqual({
    rank: 3,
    xp: 4_096_000_000,
    nextXp: 4_096_000_000,
  });
});

test("XP budget, carry, rank and repair progress survive a fresh registered World load", () => {
  const definitions = fixture({ targetHealth: 3, targetCost: 1 }).definitions;
  const make = () => {
    const kernel = createKernel({ seed: 1, debug: false });
    register(kernel, entitiesFeature(definitions));
    initializeVeterancy(kernel, definitions);
    return kernel;
  };
  const kernel = make();
  const source = spawnEntity(kernel, 1, definitions[1]!, {
    definition: definitions[1]!.id,
    force: 0,
    x: 0,
    y: 0,
    facing: 0,
  });
  const target = spawnEntity(kernel, 2, definitions[2]!, {
    definition: definitions[2]!.id,
    force: 1,
    x: 1024,
    y: 0,
    facing: 0,
  });
  hit({ kernel, definitions, source, target }, 1);
  const loaded = make();
  loaded.world.load(kernel.world.serialize());
  expect(loaded.world.serialize()).toEqual(kernel.world.serialize());
  expect(loaded.veterancy?.snapshot(source, true)).toEqual(
    kernel.veterancy?.snapshot(source, true),
  );
  hit({ kernel, definitions, source, target }, 1);
  hit({ kernel: loaded, definitions, source, target }, 1);
  expect(checkpointHash(loaded)).toBe(checkpointHash(kernel));
});

test("real launches award XP; Off changes neither health nor rank and terminal replay verifies", () => {
  for (const off of [false, true]) {
    const f = fixture({ off });
    expect(
      step(f.kernel, [
        {
          tick: 0,
          sequence: 0,
          seat: 1,
          type: "unit.attack",
          payload: { entities: [f.source], entity: f.target },
        },
      ])[0]?.result,
    ).toBe("accepted");
    expect(f.kernel.veterancy?.rank(f.source) ?? 0).toBe(off ? 0 : 1);
    expect(f.kernel.world.get(f.source, Health, "current")).toBe(off ? 100 : 110);
    step(f.kernel, [
      { tick: 1, sequence: 0, seat: 1, type: "match.surrender", payload: { force: 0 } },
    ]);
    const record = createMatchRecord(f.kernel, f.setup);
    expect(verifyMatchRecord(record).hash).toBe(record.hash);
  }
});

test("ballistic and delayed impacts preserve the actual source independently of the physical shooter", () => {
  const f = fixture({
    targetHealth: 200,
    weapon: {
      ...weapon,
      projectile: { kind: "bullet", speedSubcellsPerTick: 1024, blockedBy: ["units"] },
      warheads: [{ type: "damage", amount: 100, delayTicks: 3, tags: [] }],
    },
  });
  step(f.kernel, [
    {
      tick: 0,
      sequence: 0,
      seat: 1,
      type: "unit.attack",
      payload: { entities: [f.source], entity: f.target },
    },
  ]);
  const projectile = f.kernel.world.query(Projectile)[0]!;
  expect(f.kernel.world.get(projectile, Projectile, "source")).toBe(f.source);
  hit(f, 200, anotherTarget(f));
  expect(f.kernel.veterancy?.rank(f.source)).toBe(1);
  for (let i = 0; i < 40 && !f.kernel.world.query(PendingImpact).length; i++) step(f.kernel, []);
  const pending = f.kernel.world.query(PendingImpact)[0]!;
  expect(f.kernel.world.get(pending, PendingImpact, "source")).toBe(f.source);
  expect(f.kernel.world.get(pending, PendingImpact, "direct")).toBe(f.target);
  f.kernel.world.destroy(f.source);
  for (let i = 0; i < 4; i++) step(f.kernel, []);
  expect(f.kernel.world.query(UnitExperience)).toEqual([]);
  expect(f.kernel.world.get(f.target, Health, "current")).toBe(100);
  expect(f.kernel.world.get(f.target, ExperienceYield, "used")).toBe(100);
});

test("omitted veterancy defaults On, while malformed setting values refuse", () => {
  const f = fixture();
  const { veterancy: _veterancy, ...settings } = f.setup.normal!.settings;
  expect(
    createMatch({ ...f.setup, normal: { ...f.setup.normal!, settings } }).veterancy,
  ).toBeDefined();
  for (const bad of [null, 1, "on"])
    expect(() =>
      createMatch({
        ...f.setup,
        normal: { ...f.setup.normal!, settings: { ...settings, veterancy: bad } },
      } as unknown as MatchSetup),
    ).toThrow();
});

test("mounted fire credits the living passenger, with effective cargo health retained", () => {
  const f = fixture({ carrier: true }),
    { world } = f.kernel;
  world.set(f.source, Transform, "x", world.get(f.carrier, Transform, "x") + 256);
  world.set(f.source, Transform, "y", world.get(f.carrier, Transform, "y"));
  step(f.kernel, [
    {
      tick: 0,
      sequence: 0,
      seat: 1,
      type: "unit.load",
      payload: { entities: [f.source], entity: f.carrier },
    },
    { tick: 0, sequence: 1, seat: 1, type: "unit.deploy", payload: { entities: [f.carrier] } },
  ]);
  expect(world.has(f.source, Cargo)).toBe(true);
  expect(f.kernel.veterancy?.rank(f.source)).toBe(1);
  expect(f.kernel.veterancy?.rank(f.carrier)).toBe(0);
  expect(f.kernel.transport?.snapshot(f.carrier)?.passengers[0]?.maxHealth).toBe(110);
});

test("attached burn credits only its retained source with exact actual-HP awards", () => {
  const fire: GameplayWeapon = {
    ...weapon,
    warheads: [{ type: "burn", amountPerSecond: 20, durationTicks: 20, tags: [] }],
  };
  const f = fixture({ targetHealth: 20, weapon: fire });
  applyBurn(f.kernel, f.target, f.definitions[2]!, fire.warheads[0]!, 1000, 0, 0, f.source);
  for (let tick = 0; tick < 20; tick++) step(f.kernel, []);
  expect(f.kernel.veterancy?.snapshot(f.source, true)?.xp).toBe(100 * 1024);
});
