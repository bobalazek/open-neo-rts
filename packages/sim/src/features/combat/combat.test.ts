import { expect, test } from "bun:test";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing/maps";
import { BuilderConstruction, ConstructionSite } from "../construction";
import { Harvester, StructurePower } from "../economy";
import {
  type Definition,
  entitiesFeature,
  Health,
  OwnerForce,
  spawnEntity,
  Transform,
} from "../entities";
import type { GameplayWeapon } from "../entities/weapons";
import { MoveIntent, movementFeature } from "../movement";
import { initializeVision } from "../vision";
import {
  AttackOrder,
  combatFeature,
  MAX_SHOT_INTENTS,
  ShotIntent,
  WeaponState,
  weaponTargets,
} from ".";

const gun: GameplayWeapon = {
  id: "gun",
  targets: ["ground"],
  rangeSubcells: [0, 5 * 1024],
  reloadTicks: 3,
  projectile: { kind: "instant" },
  warheads: [
    {
      type: "damage",
      amount: 10,
      versusPerMille: { infantry: 500, heavy: 1500, structure: 200 },
      tags: [],
    },
  ],
};
const unit: Definition = {
  id: "unit:combat/infantry",
  role: "combat",
  health: 100,
  speed: 512,
  turnRate: 0x10000,
  domain: "foot",
  radiusSubcells: 128,
  armor: "infantry",
  visionSubcells: 6 * 1024,
};
const hq: Definition = {
  id: "structure:combat/headquarters",
  role: "headquarters",
  health: 1000,
  speed: 0,
  turnRate: 0,
  power: 100,
  armor: "structure",
  footprint: [2, 2],
  visionSubcells: 1024,
};
function fixture(
  options: {
    weapon?: GameplayWeapon;
    weapons?: readonly GameplayWeapon[];
    aimRate?: number;
    fog?: "off" | "standard";
    turnRate?: number;
    harvester?: boolean;
  } = {},
) {
  const attacker: Definition = {
    ...unit,
    id: "unit:combat/shooter",
    turnRate: options.turnRate ?? 0x10000,
    weapons: options.weapons ?? [options.weapon ?? gun],
    ...(options.aimRate !== undefined && { turretTurnAnglePerTick: options.aimRate }),
    ...(options.harvester && {
      role: "harvester",
      harvestCapacity: 500,
      harvestAmountPerSecond: 5,
    }),
  };
  const definitions: Definition[] = [
    hq,
    { ...unit, id: "unit:combat/worker", role: "builder" },
    attacker,
    { ...unit, visionSubcells: 0 },
    { ...unit, id: "unit:combat/heavy", armor: "heavy", visionSubcells: 0 },
    { ...unit, id: "unit:combat/threat", visionSubcells: 0, weapons: [gun] },
    { ...hq, id: "structure:combat/target", footprint: [1, 1], visionSubcells: 0 },
    { ...unit, id: "unit:combat/aircraft", domain: "air", armor: "aircraft", visionSubcells: 0 },
    { ...unit, id: "unit:combat/naval", domain: "naval", armor: "naval", visionSubcells: 0 },
    {
      ...hq,
      id: "structure:combat/defense",
      role: "defense",
      power: -10,
      footprint: [1, 1],
      weapons: [options.weapon ?? gun],
      ...(options.aimRate !== undefined && { turretTurnAnglePerTick: options.aimRate }),
      visionSubcells: 0,
    },
  ];
  const setup: MatchSetup = {
    map: {
      ...flatMap(48),
      ...(options.harvester && {
        resources: [
          {
            kind: "ore" as const,
            position: [20 * 1024, 22 * 1024] as const,
            amount: 100,
            radius: 0,
          },
        ],
      }),
      spawns: [
        { id: "west", position: [8 * 1024, 8 * 1024], facing: 16384 },
        { id: "east", position: [38 * 1024, 8 * 1024], facing: 16384 },
      ],
    },
    seed: 7,
    debug: false,
    definitions,
    forces: [0, 1].map((index) => ({ index, faction: "faction:combat" })),
    seats: [1, 2, 3, 4],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders", "economy.build"], grantedAtTick: 0 },
      { seat: 2, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
      { seat: 3, force: 0, scopes: ["economy.build"], grantedAtTick: 0 },
      { seat: 4, force: 0, scopes: ["unit.orders"], grantedAtTick: 0, expiresAtTick: 1 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        popCap: 500,
        structureCap: 400,
        fog: options.fog ?? "off",
      },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: index ? "east" : "west",
        start: {
          structures: [hq.id],
          units: [{ unit: definitions[1]?.id as string, count: 1, pop: 1, role: "builder" }],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  // These unit tests inspect targeting's unconsumed handoff; projectile integration is tested separately.
  kernel.systems.combat.splice(1);
  const spawn = (index: number, force: number, x: number, y: number, facing = 0) => {
    const definition = definitions[index] as Definition;
    return spawnEntity(kernel, index, definition, {
      definition: definition.id,
      force,
      x: x * 1024 + (definition.footprint ? 0 : 512),
      y: y * 1024 + (definition.footprint ? 0 : 512),
      facing,
    });
  };
  const actor = spawn(2, 0, 20, 20);
  const advance = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) step(kernel, []);
  };
  const shots = (shooter = actor) =>
    kernel.world
      .query(ShotIntent)
      .filter((id) => kernel.world.get(id, ShotIntent, "shooter") === shooter);
  const state = (shooter = actor, weapon = 0) =>
    kernel.world
      .query(WeaponState)
      .find(
        (id) =>
          kernel.world.get(id, WeaponState, "shooter") === shooter &&
          kernel.world.get(id, WeaponState, "weapon") === weapon,
      ) as number;
  const attack = (entity: number, seat = 1, actors = [actor]) =>
    step(kernel, [
      {
        tick: kernel.tick,
        seat,
        sequence: 0,
        type: "unit.attack",
        payload: { entities: actors, entity },
      },
    ])[0]?.result;
  return { kernel, setup, definitions, actor, spawn, advance, shots, state, attack };
}

test("range endpoints are inclusive and legal domain checks include ground structures without admitting air/naval targets", () => {
  const f = fixture({ weapon: { ...gun, rangeSubcells: [2 * 1024, 5 * 1024] } });
  const near = f.spawn(3, 1, 21, 20),
    far = f.spawn(3, 1, 26, 20),
    target = f.spawn(6, 1, 22, 20, 16384);
  f.spawn(7, 1, 22, 20);
  f.spawn(8, 1, 23, 20);
  f.advance();
  expect(f.shots()).toHaveLength(1);
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(target);
  expect(f.kernel.world.get(target, Health, "current")).toBe(1000);
  expect(f.attack(near)).toBe("accepted");
  expect(f.shots()).toEqual([]);
  expect(f.attack(far)).toBe("accepted");
  expect(f.shots()).toEqual([]);
  f.kernel.world.set(far, Transform, "x", 25 * 1024 + 512);
  f.advance();
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(far);
  expect(weaponTargets(gun, f.definitions[7] as Definition)).toBe(false);
  expect(weaponTargets({ ...gun, targets: ["air"] }, f.definitions[6] as Definition)).toBe(false);
});

test("auto acquisition ranks threats before units before structures, then versus, distance and stable IDs", () => {
  const f = fixture();
  const infantry = f.spawn(3, 1, 21, 20),
    heavy = f.spawn(4, 1, 24, 20),
    threat = f.spawn(5, 1, 25, 20),
    building = f.spawn(6, 1, 22, 20, 16384);
  f.advance();
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(threat);
  f.kernel.world.destroy(threat);
  f.advance(3);
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(heavy);
  const tied = f.spawn(4, 1, 20, 24);
  f.advance(3);
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(heavy);
  f.kernel.world.destroy(heavy);
  f.kernel.world.destroy(tied);
  f.advance(3);
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(infantry);
  f.kernel.world.destroy(infantry);
  f.advance(3);
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(building);
});

test("isolated air and naval fixtures launch only the declared target domain using the authored projectile kind", () => {
  for (const [domain, index] of [
    ["air", 7],
    ["naval", 8],
  ] as const) {
    const f = fixture({
      weapon: {
        ...gun,
        targets: [domain],
        projectile: { kind: "bullet", speedSubcellsPerTick: 1536 },
      },
    });
    f.spawn(3, 1, 21, 20);
    const target = f.spawn(index, 1, 23, 20);
    f.advance();
    expect(f.shots()).toHaveLength(1);
    expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(target);
    expect(f.kernel.world.get(target, Health, "current")).toBe(100);
  }
});

test("explicit attacks use current grants and Force sight, refuse allies/hidden or forbidden targets and ordinary orders clear the lock", () => {
  const f = fixture({ fog: "standard" });
  const enemy = f.spawn(3, 1, 22, 20),
    hidden = f.spawn(3, 1, 40, 40),
    ally = f.spawn(3, 0, 21, 20),
    air = f.spawn(7, 1, 22, 20);
  f.advance();
  expect(f.attack(enemy, 3)).toBe("no_grant");
  expect(f.attack(enemy, 4)).toBe("no_grant");
  for (const invalid of [hidden, ally, air]) expect(f.attack(invalid)).toBe("bad_payload");
  expect(f.attack(enemy)).toBe("accepted");
  expect(f.kernel.world.get(f.actor, AttackOrder, "target")).toBe(enemy);
  expect(
    step(f.kernel, [
      {
        tick: f.kernel.tick,
        seat: 1,
        sequence: 0,
        type: "unit.move",
        payload: { entities: [f.actor], x: 18 * 1024 + 512, y: 18 * 1024 + 512 },
      },
    ])[0]?.result,
  ).toBe("accepted");
  expect(f.kernel.world.has(f.actor, AttackOrder)).toBe(false);
});

test("explicit priority overrides threats while mixed selections ignore weapons unable to target that domain", () => {
  const f = fixture({ weapon: { ...gun, reloadTicks: 0 } });
  const infantry = f.spawn(3, 1, 21, 20),
    threat = f.spawn(5, 1, 24, 20);
  f.advance();
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(threat);
  expect(f.attack(infantry)).toBe("accepted");
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(infantry);
  const mixed = fixture({ weapon: { ...gun, targets: ["air"] } });
  const target = mixed.spawn(3, 1, 22, 20),
    ground = mixed.spawn(5, 0, 20, 20);
  expect(mixed.attack(target, 1, [mixed.actor, ground])).toBe("accepted");
  expect(mixed.kernel.world.has(mixed.actor, AttackOrder)).toBe(false);
  expect(mixed.kernel.world.get(ground, AttackOrder, "target")).toBe(target);
});

test("hidden and removed targets cancel pending burst without spending RNG or resetting the last-shot reload", () => {
  const f = fixture({
    fog: "standard",
    weapon: { ...gun, burst: { count: 3, delayTicks: 2 }, reloadTicks: 10, scatterSubcells: 300 },
  });
  const target = f.spawn(3, 1, 22, 20);
  f.advance();
  const random = f.kernel.streams.get("combat");
  if (!random) throw new Error("Missing committed-shot stream");
  const afterShot = { ...random };
  f.kernel.world.set(target, Transform, "x", 40 * 1024 + 512);
  f.advance();
  expect(f.shots()).toEqual([]);
  expect(f.kernel.world.get(f.state(), WeaponState, "remaining")).toBe(0);
  expect(f.kernel.streams.get("combat")).toEqual(afterShot);
  f.kernel.world.set(target, Transform, "x", 22 * 1024 + 512);
  f.advance(8);
  expect(f.shots()).toEqual([]);
  f.advance();
  expect(f.shots()).toHaveLength(1);
  f.kernel.world.destroy(target);
  f.advance();
  expect(f.shots()).toEqual([]);
});

test("reload and burst timing are exact and zero delay/reload remains bounded to one authored burst per tick", () => {
  const f = fixture({ weapon: { ...gun, burst: { count: 3, delayTicks: 2 }, reloadTicks: 5 } });
  f.spawn(3, 1, 22, 20);
  const counts: number[] = [];
  for (let i = 0; i < 10; i++) {
    f.advance();
    counts.push(f.shots().length);
  }
  expect(counts).toEqual([1, 0, 1, 0, 1, 0, 0, 0, 0, 1]);
  const zero = fixture({ weapon: { ...gun, burst: { count: 20, delayTicks: 0 }, reloadTicks: 0 } });
  zero.spawn(3, 1, 22, 20);
  zero.advance();
  expect(zero.shots()).toHaveLength(20);
  zero.advance();
  expect(zero.shots()).toHaveLength(20);
});

test("turrets turn independently at authored integer rates; stationary forward aim turns the body and moving aim respects its arc", () => {
  const f = fixture({ weapon: { ...gun, aim: "turret" }, aimRate: 0x1000 });
  f.spawn(3, 1, 20, 23);
  f.advance(3);
  expect(f.shots()).toEqual([]);
  expect(f.kernel.world.get(f.state(), WeaponState, "facing")).toBe(0x3000);
  expect(f.kernel.world.get(f.actor, Transform, "facing")).toBe(0);
  f.advance();
  expect(f.shots()).toHaveLength(1);
  const forward = fixture({ weapon: { ...gun, aim: "forward" }, turnRate: 0x1000 });
  forward.spawn(3, 1, 20, 23);
  forward.advance(4);
  expect(forward.shots()).toHaveLength(1);
  expect(forward.kernel.world.get(forward.actor, Transform, "facing")).toBe(0x4000);
  const moving = fixture({ weapon: { ...gun, aim: "forward", arcAngle: 0 }, turnRate: 0 });
  moving.spawn(3, 1, 20, 23);
  step(moving.kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [moving.actor], x: 25 * 1024 + 512, y: 20 * 1024 + 512 },
    },
  ]);
  expect(moving.kernel.world.has(moving.actor, MoveIntent)).toBe(true);
  expect(moving.shots()).toEqual([]);
});

test("unfinished, powered-off and brownout consuming structures cannot shoot; completed unpowered weapons still operate", () => {
  const f = fixture();
  f.kernel.world.destroy(f.actor);
  const defense = f.spawn(9, 0, 20, 20, 16384);
  f.spawn(3, 1, 22, 20);
  f.kernel.world.add(defense, ConstructionSite);
  f.advance();
  expect(f.shots(defense)).toEqual([]);
  f.kernel.world.remove(defense, ConstructionSite);
  f.kernel.world.set(defense, StructurePower, "enabled", 0);
  f.advance();
  expect(f.shots(defense)).toEqual([]);
  f.kernel.world.set(defense, StructurePower, "enabled", 1);
  for (const id of f.kernel.world.query(StructurePower))
    if (id !== defense && f.kernel.world.get(id, OwnerForce, "force") === 0)
      f.kernel.world.set(id, StructurePower, "enabled", 0);
  f.advance();
  expect(f.shots(defense)).toEqual([]);
  f.kernel.world.set(defense, StructurePower, "amount", 0);
  f.advance();
  expect(f.shots(defense)).toHaveLength(1);
});

test("blockable shots use physical structure clearance; unblocked weapons retain their declared projectile kind", () => {
  const f = fixture({
    weapon: {
      ...gun,
      projectile: { kind: "bullet", speedSubcellsPerTick: 1024, blockedBy: ["structures"] },
    },
  });
  const target = f.spawn(3, 1, 24, 20),
    obstruction = f.spawn(6, 0, 22, 20, 16384);
  f.advance();
  expect(f.shots()).toEqual([]);
  f.kernel.world.destroy(obstruction);
  f.advance();
  expect(f.shots()).toHaveLength(1);
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(target);
  expect(f.kernel.world.get(target, Health, "current")).toBe(100);
});

test("scatter is deterministic, distance-scaled and bounded; failed shots never create a combat stream", () => {
  const weapon = { ...gun, scatterSubcells: 1024 };
  const f = fixture({ weapon }),
    other = fixture({ weapon });
  f.spawn(3, 1, 25, 20);
  other.spawn(3, 1, 25, 20);
  f.advance();
  other.advance();
  expect(checkpointHash(f.kernel)).toBe(checkpointHash(other.kernel));
  for (const shot of f.shots()) {
    const x = f.kernel.world.get(shot, ShotIntent, "scatterX"),
      y = f.kernel.world.get(shot, ShotIntent, "scatterY");
    expect(x * x + y * y).toBeLessThanOrEqual(1024 * 1024);
  }
  const none = fixture({ weapon });
  none.spawn(7, 1, 22, 20);
  none.advance();
  expect(none.kernel.streams.has("combat")).toBe(false);
});

test("bounded launch handoff defers excess shots without consuming their cooldown or random stream", () => {
  const weapons = Array.from({ length: 32 }, (_, index) => ({
    ...gun,
    id: `gun-${index}`,
    reloadTicks: 0,
    burst: { count: 20, delayTicks: 0 },
  }));
  const f = fixture({ weapons });
  f.spawn(3, 1, 22, 20);
  for (let i = 0; i < 6; i++) f.spawn(2, 0, 20, 20);
  f.advance();
  expect(f.kernel.world.query(ShotIntent)).toHaveLength(MAX_SHOT_INTENTS);
  expect(f.kernel.streams.has("combat")).toBe(false);
  const rows = f.kernel.world.query(WeaponState);
  expect(rows.some((row) => f.kernel.world.get(row, WeaponState, "reloadAt") === 0)).toBe(true);
});

test("opaque human/bot handles cannot resolve ghosts or hidden targets; attack orders are private copied observations", () => {
  const f = fixture({ fog: "standard" });
  const target = f.spawn(3, 1, 22, 20);
  f.spawn(6, 1, 22, 21, 16384);
  f.advance();
  const projection = createProjection(f.setup, 1, "controlled");
  const snapshot = projection.snapshot(f.kernel);
  const actor = snapshot.entities.find((entity) => projection.resolve(entity.handle) === f.actor);
  const victim = snapshot.entities.find((entity) => projection.resolve(entity.handle) === target);
  expect(
    f.kernel.controllerPayload?.(1, {
      type: "unit.attack",
      payload: { entities: [actor?.handle as string], entity: victim?.handle as string },
    }),
  ).toEqual({ entities: [f.actor], entity: target });
  expect(f.attack(target)).toBe("accepted");
  expect(
    projection.snapshot(f.kernel).entities.find((entity) => entity.handle === actor?.handle)
      ?.attackTarget,
  ).toBe(victim?.handle);
  expect(
    createProjection(f.setup, 3, "controlled")
      .snapshot(f.kernel)
      .entities.find((entity) => entity.definition === f.definitions[2]?.id)?.attackTarget,
  ).toBeUndefined();
  f.kernel.world.set(target, Transform, "x", 40 * 1024 + 512);
  f.kernel.world.set(f.actor, Transform, "x", 8 * 1024 + 512);
  f.kernel.world.set(f.actor, Transform, "y", 30 * 1024 + 512);
  f.advance();
  expect(projection.resolve(victim?.handle)).toBeUndefined();
  expect(f.kernel.world.has(f.actor, AttackOrder)).toBe(false);
  const hidden = projection.snapshot(f.kernel);
  expect(hidden.ghosts?.length).toBeGreaterThan(0);
  const ghost = hidden.ghosts?.[0];
  expect(projection.resolve(ghost?.handle)).toBeUndefined();
  expect(
    f.kernel.controllerPayload?.(1, {
      type: "unit.attack",
      payload: { entities: [actor?.handle as string], entity: ghost?.handle as string },
    }),
  ).toEqual({ entities: [f.actor], entity: -1 });
});

test("weapon clocks, aim and pending launches serialize canonically and restore without closure state", () => {
  const definitions: Definition[] = [
    { ...unit, weapons: [{ ...gun, burst: { count: 3, delayTicks: 2 } }] },
    { ...unit, id: "unit:combat/victim", visionSubcells: 0 },
  ];
  const make = () => {
    const kernel = createKernel({ seed: 1, debug: false, map: flatMap(16) });
    register(kernel, entitiesFeature(definitions));
    register(kernel, movementFeature({ definitions, grants: [] }));
    register(kernel, { components: [ConstructionSite, BuilderConstruction] });
    initializeVision(kernel, {
      definitions,
      forces: [
        { index: 0, faction: "faction:fixture" },
        { index: 1, faction: "faction:fixture" },
      ],
    });
    register(kernel, combatFeature({ definitions, grants: [] }));
    return kernel;
  };
  const source = make();
  spawnEntity(source, 0, definitions[0] as Definition, {
    definition: unit.id,
    force: 0,
    x: 5 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  spawnEntity(source, 1, definitions[1] as Definition, {
    definition: "unit:combat/victim",
    force: 1,
    x: 7 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  step(source, []);
  const restored = make();
  restored.world.load(source.world.serialize());
  restored.vision?.load(source.vision?.serialize());
  restored.tick = source.tick;
  expect(checkpointHash(restored)).toBe(checkpointHash(source));
  for (let tick = 0; tick < 10; tick++) {
    step(source, []);
    step(restored, []);
    expect(checkpointHash(restored)).toBe(checkpointHash(source));
  }
});

test("normal compiled weapon boundaries reject malformed nested data and own immutable combat copies", () => {
  for (const weapon of [
    { ...gun, rangeSubcells: [500, 1] },
    { ...gun, reloadTicks: 0.5 },
    { ...gun, rangeSubcells: [0, 0x7fffffff] },
    { ...gun, projectile: { kind: "unknown" } },
    { ...gun, projectile: { kind: "instant", extra: 1 } },
    { ...gun, burst: { count: 21, delayTicks: 0 } },
    { ...gun, warheads: [{ type: "damage", amount: 0.5, tags: [] }] },
  ])
    expect(() => fixture({ weapon: weapon as GameplayWeapon })).toThrow("Invalid match map");
  expect(() => fixture({ weapon: { ...gun, aim: "turret" } })).toThrow("authored turret");
  const weapon = {
    ...gun,
    warheads: [
      { type: "damage", amount: 10, versusPerMille: { infantry: 500, heavy: 1500 }, tags: [] },
    ],
  };
  const f = fixture({ weapon });
  const infantry = f.spawn(3, 1, 21, 20),
    heavy = f.spawn(4, 1, 24, 20);
  weapon.warheads[0]?.versusPerMille &&
    Reflect.set(weapon.warheads[0].versusPerMille, "infantry", 10000);
  f.advance();
  expect(f.kernel.world.get(f.shots()[0] as number, ShotIntent, "target")).toBe(heavy);
  expect(infantry).not.toBe(heavy);
});

test("explicit attack and harvest replace each other while preserving mined cargo", () => {
  const f = fixture({ harvester: true });
  for (
    let tick = 0;
    tick < 60 &&
    (!f.kernel.world.has(f.actor, Harvester) || !f.kernel.world.get(f.actor, Harvester, "cargo"));
    tick++
  )
    f.advance();
  const cargo = f.kernel.world.get(f.actor, Harvester, "cargo");
  expect(cargo).toBeGreaterThan(0);
  const target = f.spawn(3, 1, 21, 22);
  expect(f.attack(target)).toBe("accepted");
  expect(f.kernel.world.get(f.actor, Harvester, "enabled")).toBe(0);
  expect(f.kernel.world.get(f.actor, Harvester, "cargo")).toBe(cargo);
  expect(f.kernel.world.has(f.actor, AttackOrder)).toBe(true);
  const [result] = step(f.kernel, [
    {
      tick: f.kernel.tick,
      seat: 1,
      sequence: 0,
      type: "unit.harvest",
      payload: { entities: [f.actor] },
    },
  ]);
  expect(result?.result).toBe("accepted");
  expect(f.kernel.world.has(f.actor, AttackOrder)).toBe(false);
  expect(f.kernel.world.get(f.actor, Harvester, "enabled")).toBe(1);
  expect(f.kernel.world.get(f.actor, Harvester, "cargo")).toBe(cargo);
});
