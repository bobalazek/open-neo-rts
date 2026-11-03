import { expect, test } from "bun:test";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import { createMatch, type MatchSetup, SIM_VERSION } from "../../match";
import { createProjection } from "../../projection";
import {
  createMatchSnapshot,
  parseScenario,
  restoreMatchSnapshot,
  runScenario,
  SCENARIO_FORMAT,
} from "../../snapshots";
import { flatMap } from "../../testing/maps";
import { AttackOrder, combatFeature, ShotIntent, WeaponState } from "../combat";
import { Burning } from "../combat/burn";
import { applyWarhead, warheadDamage } from "../combat/damage";
import { Disabled } from "../combat/disable";
import { Slowed } from "../combat/slow";
import { BuilderConstruction, ConstructionSite } from "../construction";
import {
  type Definition,
  entitiesFeature,
  Health,
  OwnerForce,
  spawnEntity,
  Template,
  Transform,
} from "../entities";
import type { GameplayWeapon } from "../entities/weapons";
import { emitCombatEvent, MAX_COMBAT_EVENTS } from "../events/combat";
import { movementFeature } from "../movement";
import { ForceStatistics } from "../victory/statistics";
import { AreaReveal, CELL_VISION, initializeVision } from "../vision";
import { initializeProjectiles, MAX_ACTIVE_ROUNDS, PendingImpact, Projectile } from ".";

const unit: Definition = {
  id: "unit:flight/target",
  role: "combat",
  health: 1000,
  armor: "infantry",
  speed: 256,
  turnRate: 0x10000,
  domain: "foot",
  radiusSubcells: 128,
  visionSubcells: 1024,
};
const gun: GameplayWeapon = {
  id: "test",
  targets: ["ground", "air"],
  rangeSubcells: [0, 8 * 1024],
  reloadTicks: 1000,
  projectile: { kind: "bullet", speedSubcellsPerTick: 2 * 1024 },
  warheads: [{ type: "damage", amount: 10, tags: [] }],
};
const hq: Definition = {
  id: "structure:flight/headquarters",
  role: "headquarters",
  health: 1000,
  armor: "structure",
  speed: 0,
  turnRate: 0,
  footprint: [2, 2],
  power: 100,
  visionSubcells: 1024,
};

function fixture(
  options: {
    weapon?: GameplayWeapon;
    health?: number;
    armor?: Definition["armor"];
    resistance?: Definition["resistPerMille"];
    fog?: "off" | "standard";
    friendlyFire?: boolean;
    miss?: number;
    raised?: boolean;
    targetSpeed?: number;
    targetTurnRate?: number;
    targetDomain?: Definition["domain"];
    shallow?: boolean;
    extraDefinitions?: readonly Definition[];
    popCap?: number;
  } = {},
) {
  const weapon = options.weapon ?? gun;
  const definitions: Definition[] = (
    [
      hq,
      { ...unit, id: "unit:flight/worker", role: "builder" },
      { ...unit, id: "unit:flight/shooter", weapons: [weapon] },
      {
        ...unit,
        health: options.health ?? 1000,
        speed: options.targetSpeed ?? unit.speed,
        turnRate: options.targetTurnRate ?? unit.turnRate,
        armor: options.armor ?? "infantry",
        domain: options.targetDomain ?? unit.domain,
        ...(options.resistance && { resistPerMille: options.resistance }),
      },
      { ...hq, id: "structure:flight/blocker", footprint: [1, 1] },
      { ...unit, id: "unit:flight/aircraft", domain: "air", armor: "aircraft" },
      ...(options.extraDefinitions ?? []),
    ] satisfies Definition[]
  ).map((definition) =>
    options.extraDefinitions && definition.id.startsWith("unit:")
      ? { pop: 1, ...definition }
      : definition,
  );
  const map = flatMap(48),
    level = [...map.terrain.level];
  if (options.raised)
    for (let y = 18; y <= 22; y++) for (let x = 24; x <= 30; x++) level[y * 48 + x] = 1;
  const setup: MatchSetup = {
    map: {
      ...map,
      terrain: {
        ...map.terrain,
        level,
        ...(options.shallow && {
          water: map.terrain.water.map((value, cell) => (Math.floor(cell / 48) >= 12 ? 1 : value)),
        }),
      },
      spawns: [
        { id: "west", position: [8 * 1024, 8 * 1024], facing: 16384 },
        { id: "east", position: [38 * 1024, 8 * 1024], facing: 16384 },
      ],
    },
    seed: 5,
    debug: false,
    definitions,
    forces: [0, 1].map((index) => ({ index, faction: "faction:flight" })),
    seats: [1, 2, 3],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
      { seat: 2, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        popCap: options.popCap ?? 500,
        structureCap: 400,
        fog: options.fog ?? "off",
        friendlyFire: options.friendlyFire ?? true,
        highGroundMissPerMille: options.miss ?? 0,
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
  const actor = spawn(2, 0, 20, 20),
    target = spawn(3, 1, 24, 20);
  const advance = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) step(kernel, []);
  };
  const hp = (id = target) =>
    kernel.world.isAlive(id) ? kernel.world.get(id, Health, "current") : 0;
  const fire = () =>
    step(kernel, [
      {
        tick: kernel.tick,
        seat: 1,
        sequence: 0,
        type: "unit.attack",
        payload: { entities: [actor], entity: target },
      },
    ]);
  return { kernel, setup, definitions, actor, target, spawn, advance, hp, fire };
}

const emp: GameplayWeapon = {
  ...gun,
  projectile: { kind: "instant" },
  warheads: [
    { type: "damage", amount: 10, tags: [] },
    { type: "disable", durationTicks: 20, tags: ["emp"] },
  ],
};

// Synthetic round exercises the authored slow vocabulary without changing the roster.
const slow: GameplayWeapon = {
  ...gun,
  projectile: { kind: "instant" },
  warheads: [{ type: "slow", perMille: 500, durationTicks: 20, tags: ["nanite"] }],
};

const sensor: GameplayWeapon = {
  ...gun,
  projectile: { kind: "instant" },
  warheads: [{ type: "reveal", radiusSubcells: 2 * 1024, durationTicks: 20, tags: [] }],
};

const payload: Definition = { ...unit, id: "unit:flight/payload", pop: 2, speed: 0 };
const spawner: GameplayWeapon = {
  ...gun,
  projectile: { kind: "instant" },
  warheads: [
    { type: "damage", amount: 10, tags: [] },
    { type: "spawn", unit: payload.id, count: 3, tags: [] },
  ],
};
const payloads = (kernel: import("../../kernel").Kernel) =>
  kernel.world.query(Template).filter((id) => kernel.world.get(id, Template, "definition") === 6);

test("mixed spawn rounds use firing ownership, nearest legal cells, current blockers and once-only statistics", () => {
  const f = fixture({ weapon: spawner, extraDefinitions: [payload] });
  f.spawn(4, 0, 23, 20);
  f.fire();
  expect(f.hp()).toBe(990);
  const spawned = payloads(f.kernel);
  expect(spawned).toHaveLength(3);
  expect(
    spawned.map((id) => [
      f.kernel.world.get(id, Transform, "x"),
      f.kernel.world.get(id, Transform, "y"),
    ]),
  ).toEqual(
    [
      [24, 19],
      [24, 21],
      [25, 20],
    ].map(([x, y]) => [x! * 1024 + 512, y! * 1024 + 512]),
  );
  for (const id of spawned) {
    expect(f.kernel.world.get(id, OwnerForce, "force")).toBe(0);
    expect(f.kernel.world.get(id, Health, "current")).toBe(payload.health);
    expect(f.kernel.world.get(id, Transform, "facing")).toBe(0);
  }
  const stats = f.kernel.world
    .query(ForceStatistics)
    .find((id) => f.kernel.world.get(id, ForceStatistics, "force") === 0)!;
  expect(f.kernel.world.get(stats, ForceStatistics, "unitsBuilt")).toBe(3);
  f.advance(8);
  expect(payloads(f.kernel)).toEqual(spawned);
  expect(f.kernel.world.get(stats, ForceStatistics, "unitsBuilt")).toBe(3);
});

test("spawn limits obey shared population rules including zero-pop payloads and occupied local cells", () => {
  const f = fixture({ weapon: spawner, extraDefinitions: [{ ...payload, pop: 30 }], popCap: 50 });
  f.fire(); // one starting builder + shooter, leaving room for only one thirty-pop payload
  expect(payloads(f.kernel)).toHaveLength(1);
  const zero = fixture({ weapon: spawner, extraDefinitions: [{ ...payload, pop: 0 }], popCap: 50 });
  for (let i = 0; i < 48; i++) zero.spawn(1, 0, 12 + (i % 8), 28 + Math.floor(i / 8));
  zero.fire();
  expect(payloads(zero.kernel)).toHaveLength(3);
  const blocked = fixture({ weapon: spawner, extraDefinitions: [payload] });
  for (let y = 16; y <= 24; y++) for (let x = 20; x <= 28; x++) blocked.spawn(4, 0, x, y);
  blocked.fire();
  expect(payloads(blocked.kernel)).toEqual([]);
  expect(blocked.kernel.world.query(PendingImpact)).toEqual([]);
});

test("delayed spawn survives shooter death, rejects defeated ownership and respects ground domains", () => {
  const delayed = { ...spawner, warheads: [{ ...spawner.warheads[1]!, delayTicks: 3 }] };
  const f = fixture({ weapon: delayed, extraDefinitions: [payload] });
  f.fire();
  f.kernel.world.destroy(f.actor);
  f.advance(2);
  expect(payloads(f.kernel)).toEqual([]);
  f.advance();
  expect(payloads(f.kernel)).toHaveLength(3);
  const defeated = fixture({ weapon: delayed, extraDefinitions: [payload] });
  defeated.fire();
  for (const id of defeated.kernel.world.query(Template, OwnerForce))
    if (defeated.kernel.world.get(id, OwnerForce, "force") === 0) defeated.kernel.world.destroy(id);
  // The result ends the match before the pending payload. Its removal cannot resurrect the Force.
  defeated.advance(5);
  applyWarhead(
    defeated.kernel,
    defeated.definitions,
    spawner,
    spawner.warheads[1]!,
    {
      force: 0,
      direct: 0,
      x: 24 * 1024,
      y: 20 * 1024,
      fromX: 0,
      fromY: 0,
      air: false,
      maxLevel: 0,
    },
    true,
    500,
  );
  expect(payloads(defeated.kernel)).toEqual([]);
  const water = fixture({
    weapon: spawner,
    extraDefinitions: [{ ...payload, domain: "tracked" }],
    shallow: true,
  });
  water.fire();
  expect(payloads(water.kernel)).toEqual([]);
  const wading = fixture({
    weapon: spawner,
    extraDefinitions: [{ ...payload, domain: "wheeled" }],
    shallow: true,
  });
  wading.fire();
  expect(payloads(wading.kernel)).toHaveLength(3);
});

test("spawn references validate before a match starts; omitted unit is inert and omitted count means one", () => {
  const base = fixture({ weapon: spawner, extraDefinitions: [payload] }).setup;
  for (const reference of ["unit:flight/missing", hq.id]) {
    const setup = {
      ...base,
      definitions: base.definitions.map((definition, index) =>
        index === 2
          ? {
              ...definition,
              weapons: [{ ...spawner, warheads: [{ type: "spawn", unit: reference, tags: [] }] }],
            }
          : definition,
      ),
    };
    expect(() => createMatch(setup)).toThrow();
  }
  const absent = fixture({
    weapon: { ...spawner, warheads: [{ type: "spawn", tags: [] }] },
    extraDefinitions: [payload],
  });
  absent.fire();
  expect(payloads(absent.kernel)).toEqual([]);
  const single = fixture({
    weapon: { ...spawner, warheads: [{ type: "spawn", unit: payload.id, tags: [] }] },
    extraDefinitions: [payload],
  });
  single.fire();
  expect(payloads(single.kernel)).toHaveLength(1);
});

test("delayed mixed sensor rounds reveal their impact after shooter and direct victim die", () => {
  const f = fixture({
    weapon: {
      ...sensor,
      warheads: [
        { type: "damage", amount: 1000, tags: [] },
        { ...sensor.warheads[0]!, delayTicks: 3 },
      ],
    },
  });
  f.fire();
  expect(f.hp()).toBe(0);
  expect(f.kernel.world.query(AreaReveal)).toEqual([]);
  f.kernel.world.destroy(f.actor);
  f.advance(2);
  expect(f.kernel.world.query(AreaReveal)).toEqual([]);
  f.advance();
  const fields = f.kernel.world.query(AreaReveal);
  expect(fields).toHaveLength(1);
  expect(f.kernel.world.get(fields[0]!, AreaReveal, "force")).toBe(0);
  expect(f.kernel.world.get(fields[0]!, AreaReveal, "x")).toBe(
    24 * 1024 + 512 - unit.radiusSubcells!,
  );
  expect(f.kernel.world.get(fields[0]!, AreaReveal, "from")).toBe(4);
  expect(f.kernel.world.get(fields[0]!, AreaReveal, "until")).toBe(24);
  f.advance(20);
  expect(f.kernel.world.query(AreaReveal)).toEqual([]);
});

test("ground sensor impacts expose only permitted actors, then hide units and preserve last-seen structures", () => {
  const f = fixture({
    weapon: { ...sensor, rangeSubcells: [0, 0] },
    fog: "standard",
    friendlyFire: false,
  });
  const building = f.spawn(4, 1, 25, 20);
  const projection = createProjection(f.setup, 1, "controlled");
  const impact = {
    force: 0,
    direct: 0,
    x: 24 * 1024 + 512,
    y: 20 * 1024 + 512,
    fromX: 0,
    fromY: 0,
    air: false,
    maxLevel: 0,
  };
  for (const warhead of [
    { type: "reveal", durationTicks: 2, tags: [] },
    { type: "reveal", radiusSubcells: 2048, tags: [] },
  ])
    applyWarhead(f.kernel, f.definitions, sensor, warhead, impact, false);
  expect(f.kernel.world.query(AreaReveal)).toEqual([]);
  applyWarhead(
    f.kernel,
    f.definitions,
    sensor,
    { ...sensor.warheads[0]!, durationTicks: 2 },
    impact,
    false,
  );
  expect(projection.snapshot(f.kernel).entities.some((entity) => entity.force === 1)).toBe(false);
  f.advance();
  const packet = projection.snapshot(f.kernel);
  expect(packet.entities.some((entity) => projection.resolve(entity.handle) === f.target)).toBe(
    true,
  );
  expect(packet.entities.some((entity) => projection.resolve(entity.handle) === building)).toBe(
    true,
  );
  expect(packet.entities.filter((entity) => entity.force === 1)).toHaveLength(2);
  expect(JSON.stringify(packet)).not.toMatch(/AreaReveal|durationTicks|radiusSubcells/);
  const field = f.kernel.world.query(AreaReveal)[0]!;
  expect(packet.entities.some((entity) => projection.resolve(entity.handle) === field)).toBe(false);
  expect(f.kernel.vision?.canSeeCell(1, 23, 20)).toBe(true); // enemy's ordinary one-cell vision
  expect(f.kernel.vision?.canSeeCell(1, 22, 20)).toBe(false); // our sensor is not shared with enemies
  f.advance(2);
  const expired = projection.snapshot(f.kernel);
  expect(f.kernel.vision?.cellState(0, 24, 20)).toBe(CELL_VISION.explored);
  expect(expired.entities.some((entity) => entity.force === 1)).toBe(false);
  expect(expired.ghosts?.some((ghost) => ghost.definition === f.definitions[4]!.id)).toBe(true);
  f.kernel.world.set(building, Health, "current", 0);
  f.advance();
  expect(projection.snapshot(f.kernel).ghosts).toEqual(expired.ghosts);
});

test("slow composes with shallow-wheel speed, retains its route and resumes exactly at expiry", () => {
  const f = fixture({ weapon: slow, targetDomain: "wheeled", shallow: true });
  f.fire();
  const x = () => f.kernel.world.get(f.target, Transform, "x");
  const before = x();
  const move = step(f.kernel, [
    {
      tick: f.kernel.tick,
      seat: 2,
      sequence: 0,
      type: "unit.move",
      payload: {
        entities: [f.target],
        x: 32 * 1024 + 512,
        y: 20 * 1024 + 512,
      },
    },
  ]);
  expect(move[0]?.result).toBe("accepted");
  expect(x() - before).toBe(64);
  expect(f.kernel.world.get(f.target, Slowed, "until")).toBe(20);
  f.advance(18);
  const end = x();
  expect(f.kernel.slowPerMille?.(f.target)).toBe(0);
  f.advance();
  expect(x() - end).toBe(128);
  expect(f.kernel.world.has(f.target, Slowed)).toBe(false);
});

for (const turnRate of [0, 0x10000])
  test(`full slow preserves its route past the stuck budget with turn rate ${turnRate}`, () => {
    const f = fixture({
      weapon: { ...slow, warheads: [{ ...slow.warheads[0]!, perMille: 1000, durationTicks: 160 }] },
      targetTurnRate: turnRate,
    });
    f.kernel.world.set(f.target, Transform, "facing", 0x8000);
    f.fire();
    const x = () => f.kernel.world.get(f.target, Transform, "x");
    const before = x();
    step(f.kernel, [
      {
        tick: f.kernel.tick,
        seat: 2,
        sequence: 0,
        type: "unit.move",
        payload: {
          entities: [f.target],
          x: 32 * 1024 + 512,
          y: 20 * 1024 + 512,
        },
      },
    ]);
    f.advance(158);
    expect(x()).toBe(before);
    expect(
      f.kernel.movement?.snapshot().routes.find((route) => route.entity === f.target)?.stuck,
    ).toBe(0);
    // The zero-turn fixture needs to face its path before it can resume linear movement.
    f.kernel.world.set(f.target, Transform, "facing", 0);
    f.advance();
    expect(x() - before).toBe(256);
  });

test("slow scales strength with resistance and area falloff, preserving immunity and delayed friendly-fire rules", () => {
  for (const [resistance, strength] of [
    [0, 0],
    [500, 250],
    [3000, 1000],
  ] as const) {
    const f = fixture({
      weapon: { ...slow, warheads: [...slow.warheads, { type: "damage", amount: 10, tags: [] }] },
      resistance: { nanite: resistance },
    });
    f.fire();
    expect(f.kernel.slowPerMille?.(f.target)).toBe(strength);
    expect(f.hp()).toBe(990);
  }
  const f = fixture({
    weapon: {
      ...slow,
      warheads: [
        { ...slow.warheads[0]!, radiusSubcells: 1024, delayTicks: 3, falloffPerMille: [1000, 500] },
      ],
    },
    friendlyFire: false,
  });
  const outer = f.spawn(3, 1, 24, 21),
    ally = f.spawn(3, 0, 25, 20);
  f.fire();
  expect(f.kernel.slowPerMille?.(f.target)).toBe(0);
  f.advance(3);
  expect(f.kernel.slowPerMille?.(f.target)).toBe(500);
  expect(f.kernel.slowPerMille?.(outer)).toBe(250);
  expect(f.kernel.slowPerMille?.(ally)).toBe(0);
  const projected = createProjection(f.setup, 1, "controlled")
    .snapshot(f.kernel)
    .entities.find((entity) => entity.force === 1 && entity.definition === unit.id);
  expect(projected?.slowed).toBe(true);
  for (const field of ["strength", "until", "perMille"])
    expect(projected).not.toHaveProperty(field);
});

test("slow refreshes without stacking, stronger replacement has its own deadline and source death cannot clear it", () => {
  const f = fixture({ weapon: slow });
  f.fire();
  f.advance(2);
  const impact = {
    force: 0,
    direct: f.target,
    x: 0,
    y: 0,
    fromX: 0,
    fromY: 0,
    air: false,
    maxLevel: 255,
  };
  const hit = (perMille: number, durationTicks: number) =>
    applyWarhead(
      f.kernel,
      f.definitions,
      slow,
      { type: "slow", perMille, durationTicks, tags: [] },
      impact,
      false,
    );
  hit(250, 80);
  expect(f.kernel.world.get(f.target, Slowed, "until")).toBe(20);
  hit(500, 30);
  expect(f.kernel.world.get(f.target, Slowed, "until")).toBe(33);
  hit(750, 2);
  expect(f.kernel.slowPerMille?.(f.target)).toBe(750);
  expect(f.kernel.world.get(f.target, Slowed, "until")).toBe(5);
  f.kernel.world.destroy(f.actor);
  f.advance();
  expect(f.kernel.slowPerMille?.(f.target)).toBe(750);
  f.advance();
  expect(f.kernel.slowPerMille?.(f.target)).toBe(0);
  f.kernel.world.destroy(f.target);
  expect(() => hit(1000, 100)).not.toThrow();
});

test("slow never invents missing duration/strength and does not attach to immobile structures", () => {
  for (const warhead of [
    { type: "slow", perMille: 500, tags: [] },
    { type: "slow", durationTicks: 20, tags: [] },
    { type: "slow", durationTicks: 0, perMille: 500, tags: [] },
    { type: "slow", durationTicks: 20, perMille: 0, tags: [] },
  ]) {
    const f = fixture({ weapon: { ...slow, warheads: [warhead] } });
    f.fire();
    expect(f.kernel.world.has(f.target, Slowed)).toBe(false);
  }
  const f = fixture({ weapon: slow });
  const target = f.spawn(4, 1, 30, 20);
  applyWarhead(
    f.kernel,
    f.definitions,
    slow,
    slow.warheads[0]!,
    { force: 0, direct: target, x: 0, y: 0, fromX: 0, fromY: 0, air: false, maxLevel: 255 },
    false,
  );
  expect(f.kernel.world.has(target, Slowed)).toBe(false);
});

const flame: GameplayWeapon = {
  ...gun,
  projectile: { kind: "beam" },
  warheads: [
    { type: "damage", amount: 10, tags: ["fire"] },
    { type: "burn", amountPerSecond: 5, durationTicks: 60, tags: ["fire"] },
  ],
};

test("beam impacts apply once and a three-second burn delivers exact fractional DPS through its last tick", () => {
  const f = fixture({ weapon: flame });
  f.fire();
  expect(f.hp()).toBe(990);
  expect(f.kernel.world.query(Projectile)).toEqual([]);
  expect(f.kernel.burning?.(f.target)).toBe(true);
  expect(
    f.kernel.combatEvents?.some((event) => event.type === "impact" && event.projectile === "beam"),
  ).toBe(true);
  const projection = createProjection(f.setup, 1, "controlled").snapshot(f.kernel);
  expect(
    projection.entities.find((row) => row.force === 1 && row.definition === unit.id)?.burning,
  ).toBe(true);
  f.advance(59);
  expect(f.hp()).toBe(975);
  f.advance(20);
  expect(f.hp()).toBe(975);
  expect(f.kernel.world.has(f.target, Burning)).toBe(false);
});

test("beams trace moving targets at their current pose, including when unused speed metadata is present", () => {
  const impacts: { x: number; y: number }[] = [];
  for (const projectile of [
    { kind: "instant" },
    { kind: "beam" },
    { kind: "beam", speedSubcellsPerTick: 512 },
  ]) {
    const f = fixture({ weapon: { ...flame, projectile } });
    step(f.kernel, [
      {
        tick: 0,
        seat: 1,
        sequence: 0,
        type: "unit.attack",
        payload: { entities: [f.actor], entity: f.target },
      },
      {
        tick: 0,
        seat: 2,
        sequence: 0,
        type: "unit.move",
        payload: { entities: [f.target], x: 24 * 1024 + 512, y: 25 * 1024 + 512 },
      },
    ]);
    expect(f.hp()).toBe(990);
    expect(f.kernel.burning?.(f.target)).toBe(true);
    const impact = f.kernel.combatEvents?.find((event) => event.type === "impact");
    if (!impact) throw new Error("Expected the instantaneous shot's actual impact");
    impacts.push({ x: impact.x, y: impact.y });
  }
  expect(impacts[1]).toEqual(impacts[0]);
  expect(impacts[2]).toEqual(impacts[0]);
});

test("burn resistance, refresh and stronger-source replacement preserve bounded rates and fractional work", () => {
  const immune = fixture({ weapon: flame, resistance: { fire: 0 } });
  immune.fire();
  expect(immune.hp()).toBe(1000);
  expect(immune.kernel.burning?.(immune.target)).toBe(false);
  const f = fixture({ weapon: flame });
  f.fire();
  f.advance(9);
  const impact = {
    force: 0,
    direct: f.target,
    x: 0,
    y: 0,
    fromX: 0,
    fromY: 0,
    air: false,
    maxLevel: 255,
  };
  const carry = f.kernel.world.get(f.target, Burning, "carry");
  applyWarhead(f.kernel, f.definitions, flame, flame.warheads[1]!, impact, false);
  expect(f.kernel.world.get(f.target, Burning, "until")).toBe(70);
  expect(f.kernel.world.get(f.target, Burning, "carry")).toBe(carry);
  applyWarhead(
    f.kernel,
    f.definitions,
    flame,
    { type: "burn", amountPerSecond: 1, durationTicks: 120, tags: [] },
    impact,
    false,
  );
  expect(f.kernel.world.get(f.target, Burning, "until")).toBe(70);
  applyWarhead(
    f.kernel,
    f.definitions,
    flame,
    { type: "burn", amountPerSecond: 10, durationTicks: 20, tags: [] },
    impact,
    false,
  );
  expect(f.kernel.world.get(f.target, Burning, "until")).toBe(30);
  f.kernel.world.destroy(f.actor);
  f.advance(20);
  expect(f.hp()).toBe(978);
  const row = f.kernel.world
    .query(ForceStatistics)
    .find((id) => f.kernel.world.get(id, ForceStatistics, "force") === 0)!;
  expect(f.kernel.world.get(row, ForceStatistics, "damageDealt")).toBe(22);
});

test("mixed EMP shots deal damage and pause a vehicle's existing route until the exclusive deadline", () => {
  const f = fixture({ weapon: emp, targetDomain: "tracked", armor: "heavy" });
  const { kernel, target } = f,
    world = kernel.world;
  step(kernel, [
    {
      tick: 0,
      seat: 2,
      sequence: 0,
      type: "unit.move",
      payload: {
        entities: [target],
        x: 28 * 1024 + 512,
        y: 20 * 1024 + 512,
      },
    },
  ]);
  // The automatic shot hits the moving tank's rear during that same tick.
  expect(f.hp()).toBe(985);
  expect(world.get(target, Disabled, "until")).toBe(20);
  const paused = world.get(target, Transform, "x");
  expect(kernel.movement?.snapshot().routes.some((route) => route.entity === target)).toBe(true);
  f.advance(19);
  expect(world.get(target, Transform, "x")).toBe(paused);
  expect(kernel.disabled?.(target)).toBe(false);
  f.advance();
  expect(world.has(target, Disabled)).toBe(false);
  expect(world.get(target, Transform, "x")).toBeGreaterThan(paused);
});

test("EMP respects infantry and zero-tag immunity, duration resistance, refresh and expired/dead targets", () => {
  for (const options of [
    { targetDomain: "foot" as const },
    {
      targetDomain: "tracked" as const,
      resistance: { emp: 0 },
    },
  ]) {
    const f = fixture({ weapon: emp, ...options });
    f.fire();
    expect(f.hp()).toBe(990);
    expect(f.kernel.disabled?.(f.target)).toBe(false);
  }
  const f = fixture({ weapon: emp, targetDomain: "tracked", resistance: { emp: 500 } });
  f.fire();
  const { world } = f.kernel;
  expect(world.get(f.target, Disabled, "until")).toBe(10);
  f.advance(2);
  const impact = {
    force: 0,
    direct: f.target,
    x: 0,
    y: 0,
    fromX: 0,
    fromY: 0,
    air: false,
    maxLevel: 255,
  };
  applyWarhead(f.kernel, f.definitions, emp, emp.warheads[1]!, impact, false);
  expect(world.get(f.target, Disabled, "until")).toBe(13);
  applyWarhead(
    f.kernel,
    f.definitions,
    emp,
    { type: "disable", durationTicks: 2, tags: ["emp"] },
    impact,
    false,
  );
  expect(world.get(f.target, Disabled, "until")).toBe(13);
  world.destroy(f.target);
  expect(f.kernel.disabled?.(f.target)).toBe(false);
  expect(() =>
    applyWarhead(f.kernel, f.definitions, emp, emp.warheads[1]!, impact, false),
  ).not.toThrow();
});

test("EMP's delayed area uses existing geometry and friendly-fire rules; projection reveals no deadline", () => {
  const weapon = {
    ...emp,
    warheads: [
      { type: "disable", durationTicks: 20, delayTicks: 3, radiusSubcells: 1024, tags: ["emp"] },
    ],
  };
  const f = fixture({ weapon, targetDomain: "tracked", friendlyFire: false });
  const ally = f.spawn(3, 0, 24, 21);
  f.fire();
  expect(f.kernel.disabled?.(f.target)).toBe(false);
  f.advance(3);
  expect(f.kernel.disabled?.(f.target)).toBe(true);
  expect(f.kernel.disabled?.(ally)).toBe(false);
  const visible = createProjection(f.setup, 1, "controlled")
    .snapshot(f.kernel)
    .entities.find((row) => row.force === 1 && row.definition === unit.id);
  expect(visible?.disabled).toBe(true);
  expect(visible).not.toHaveProperty("until");
});

for (const [weapon, status] of [
  [emp, "disabled"],
  [flame, "burning"],
  [slow, "slowed"],
  [sensor, "revealed"],
  [spawner, "spawned"],
] as const)
  test(`timed ${status} combat from starting kits replays canonical state and the final hash`, () => {
    const base = fixture({
      weapon,
      targetDomain: "tracked",
      ...(status === "spawned" && { extraDefinitions: [payload] }),
    }).setup;
    const setup: MatchSetup = {
      ...base,
      definitions: base.definitions.map((definition, index) =>
        index === 3 ? { ...definition, weapons: [weapon] } : definition,
      ),
      normal: {
        ...base.normal!,
        forces: base.normal!.forces.map((force) => ({
          ...force,
          start: {
            ...force.start,
            units: [
              ...force.start.units,
              {
                unit: base.definitions[force.index === 0 ? 2 : 3]!.id,
                count: 1,
                pop: 1,
                role: "combat",
              },
            ],
          },
        })),
      },
    };
    const kernel = createMatch(setup),
      world = kernel.world;
    const actor = world.query(Template).find((id) => world.get(id, Template, "definition") === 2)!;
    const target = world.query(Template).find((id) => world.get(id, Template, "definition") === 3)!;
    const commands = [
      {
        tick: 0,
        seat: 1,
        sequence: 0,
        type: "unit.attackMove" as const,
        payload: {
          entities: [actor],
          x: world.get(target, Transform, "x"),
          y: world.get(target, Transform, "y"),
        },
      },
    ];
    expect(step(kernel, commands)[0]?.result).toBe("accepted");
    let observed = false;
    for (let i = 0; i < 200; i++) {
      step(kernel, []);
      observed ||=
        status === "disabled"
          ? kernel.disabled?.(target) === true
          : status === "burning"
            ? kernel.burning?.(target) === true
            : status === "slowed"
              ? !!kernel.slowPerMille?.(target)
              : status === "revealed"
                ? kernel.world.query(AreaReveal).length > 0
                : payloads(kernel).length > 0;
      if (
        (status === "slowed" || status === "revealed" || status === "spawned") &&
        kernel.tick === 100
      ) {
        if (status === "slowed") {
          expect(kernel.slowPerMille?.(target)).toBeGreaterThan(0);
          expect(checkpointHash(kernel)).toBe("4373496c276f116c");
        } else if (status === "revealed") {
          expect(kernel.world.query(AreaReveal)).not.toEqual([]);
          expect(checkpointHash(kernel)).toBe("eecbfe6741791c31");
        } else {
          expect(payloads(kernel)).not.toEqual([]);
          expect(checkpointHash(kernel)).toBe("b89a555cae666f71");
        }
        const restored = restoreMatchSnapshot(createMatchSnapshot(kernel, setup), setup);
        expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
        step(restored, []);
        step(kernel, []);
        expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
      }
    }
    expect(observed).toBe(true);
    const scenario = parseScenario({
      format: SCENARIO_FORMAT,
      simVersion: SIM_VERSION,
      setup,
      commands,
    });
    expect(runScenario(scenario, { ticks: kernel.tick }).at(-1)?.hash).toBe(checkpointHash(kernel));
  });

test("instant resolves now; bullets travel for real ticks and strike once without tunnelling", () => {
  const instant = fixture({ weapon: { ...gun, projectile: { kind: "instant" } } });
  instant.fire();
  expect(instant.hp()).toBe(990);
  expect(instant.kernel.world.query(Projectile)).toEqual([]);
  const f = fixture();
  f.fire();
  expect(f.hp()).toBe(1000);
  expect(f.kernel.world.query(Projectile)).toHaveLength(1);
  f.advance();
  expect(f.hp()).toBe(1000);
  f.advance();
  expect(f.hp()).toBe(990);
  expect(f.kernel.world.query(Projectile)).toEqual([]);
  f.advance(10);
  expect(f.hp()).toBe(990);
  const fast = fixture({
    weapon: { ...gun, projectile: { kind: "bullet", speedSubcellsPerTick: 10 * 1024 } },
  });
  const first = fast.spawn(3, 1, 22, 20);
  fast.fire();
  fast.advance();
  expect(fast.hp(first)).toBe(990);
  expect(fast.hp()).toBe(1000);
});

test("declared structure blockers stop a previously launched shell and shooter death does not erase flight", () => {
  const f = fixture({
    weapon: {
      ...gun,
      projectile: { kind: "bullet", speedSubcellsPerTick: 1024, blockedBy: ["structures"] },
    },
  });
  f.fire();
  f.advance();
  f.spawn(4, 0, 22, 20, 16384);
  f.kernel.world.destroy(f.actor);
  f.advance();
  expect(f.kernel.world.query(Projectile)).toEqual([]);
  expect(f.hp()).toBe(1000);
  const other = fixture();
  other.fire();
  other.kernel.world.destroy(other.actor);
  other.advance(2);
  expect(other.hp()).toBe(990);
});

test("ballistic leading uses actual velocity and relative sweeps detect targets crossing a fast segment", () => {
  const f = fixture({
    weapon: { ...gun, projectile: { kind: "bullet", speedSubcellsPerTick: 1024 } },
  });
  step(f.kernel, [
    {
      tick: 0,
      seat: 2,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [f.target], x: 24 * 1024 + 512, y: 30 * 1024 + 512 },
    },
    {
      tick: 0,
      seat: 1,
      sequence: 1,
      type: "unit.attack",
      payload: { entities: [f.actor], entity: f.target },
    },
  ]);
  const round = f.kernel.world.query(Projectile)[0] as number;
  expect(f.kernel.world.get(round, Projectile, "destinationY")).toBeGreaterThan(
    f.kernel.world.get(f.target, Transform, "y"),
  );
  f.advance(8);
  expect(f.hp()).toBe(990);
});

test("immediate swept splash uses contact-time poses while delayed warheads and fuses use detonation poses", () => {
  for (const mode of ["immediate", "delayed", "fuse"] as const) {
    const f = fixture({
      targetSpeed: 4096,
      weapon: {
        ...gun,
        projectile: {
          kind: "bullet",
          speedSubcellsPerTick: 4096,
          ...(mode === "fuse" && { fuseTicks: 1 }),
        },
        warheads: [
          {
            type: "damage",
            amount: 10,
            radiusSubcells: 1024,
            tags: [],
            ...(mode === "delayed" && { delayTicks: 1 }),
          },
        ],
      },
    });
    f.kernel.world.destroy(f.actor);
    f.kernel.world.set(f.target, Transform, "y", 18 * 1024 + 512);
    f.advance();
    const round = f.kernel.world.create();
    f.kernel.world.add(round, Projectile, {
      definition: 2,
      weapon: 0,
      force: 0,
      ceiling: 255,
      x: 22 * 1024 + 512,
      y: 20 * 1024 + 512,
      destinationX: 26 * 1024 + 512,
      destinationY: 20 * 1024 + 512,
      velocityX: 4096,
      velocityY: 0,
      speed: 4096,
      life: 5,
      born: 0,
    });
    step(f.kernel, [
      {
        tick: f.kernel.tick,
        seat: 2,
        sequence: 0,
        type: "unit.move",
        payload: { entities: [f.target], x: 24 * 1024 + 512, y: 22 * 1024 + 512 },
      },
    ]);
    expect(f.kernel.world.get(f.target, Transform, "y")).toBe(22 * 1024 + 512);
    expect(f.kernel.combatEvents?.some((event) => event.type === "impact")).toBe(mode !== "fuse");
    expect(f.hp()).toBe(mode === "immediate" ? 990 : 1000);
    f.advance();
    expect(f.hp()).toBe(mode === "immediate" ? 990 : 1000);
    expect(f.kernel.world.query(PendingImpact)).toEqual([]);
    expect(f.kernel.world.query(Projectile)).toEqual([]);
  }
});

test("missiles accelerate, obey turn limits, lose dead target references and expire without phantom damage", () => {
  const weapon = {
    ...gun,
    projectile: {
      kind: "missile",
      speedSubcellsPerTick: 1024,
      turnAnglePerTick: 1000,
      flightTicks: 8,
    },
  };
  const f = fixture({ weapon });
  f.fire();
  const round = f.kernel.world.query(Projectile)[0] as number;
  f.advance();
  expect(f.kernel.world.get(round, Projectile, "speed")).toBe(256);
  f.kernel.world.set(f.target, Transform, "y", 24 * 1024 + 512);
  const before = f.kernel.world.get(round, Projectile, "facing");
  f.advance();
  expect(
    Math.abs(
      ((f.kernel.world.get(round, Projectile, "facing") - before + 0x8000) & 0xffff) - 0x8000,
    ),
  ).toBeLessThanOrEqual(1000);
  f.kernel.world.destroy(f.target);
  f.advance();
  expect(f.kernel.world.get(round, Projectile, "target")).toBe(0);
  f.advance(10);
  expect(f.kernel.world.query(Projectile)).toEqual([]);
});

test("direct plus splash warheads apply once each with shape distance, resistance and friendly-fire override", () => {
  const weapon: GameplayWeapon = {
    ...gun,
    projectile: { kind: "instant" },
    warheads: [
      { type: "damage", amount: 10, tags: [] },
      { type: "damage", amount: 20, radiusSubcells: 1024, falloffPerMille: [1000, 500], tags: [] },
    ],
  };
  const f = fixture({ weapon });
  const friend = f.spawn(3, 0, 24, 20.5),
    neighbour = f.spawn(3, 1, 24, 20.5);
  f.fire();
  expect(f.hp()).toBe(970);
  expect(f.hp(friend)).toBe(980);
  expect(f.hp(neighbour)).toBe(980);
  const safe = fixture({
    weapon: {
      ...weapon,
      warheads: [
        weapon.warheads[0] as (typeof weapon.warheads)[number],
        { ...weapon.warheads[1], friendlyFire: false } as (typeof weapon.warheads)[number],
      ],
    },
  });
  const protectedFriend = safe.spawn(3, 0, 24, 20.5);
  safe.fire();
  expect(safe.hp(protectedFriend)).toBe(1000);
});

test("zero, immunity and final-floor damage remain exact even for large products and duplicate tags", () => {
  const target = { ...unit, armor: "heavy" as const, resistPerMille: { fire: 500 } };
  expect(
    warheadDamage(
      { type: "damage", amount: 100, versusPerMille: { heavy: 333 }, tags: ["fire", "fire"] },
      target,
      333,
      1250,
    ),
  ).toBe(6);
  for (const amount of [0, 1])
    expect(
      warheadDamage(
        { type: "damage", amount, versusPerMille: { heavy: 0 }, tags: [] },
        target,
        1000,
      ),
    ).toBe(0);
  expect(
    warheadDamage({ type: "damage", amount: 1, versusPerMille: { heavy: 1 }, tags: [] }, target, 1),
  ).toBe(1);
  const f = fixture({
    weapon: {
      ...gun,
      projectile: { kind: "instant" },
      warheads: [
        {
          type: "damage",
          amount: 100000,
          versusPerMille: { default: 10000 },
          tags: ["fire", "emp", "explosive", "energy", "nanite"],
        },
      ],
    },
    resistance: { fire: 10000, emp: 10000, explosive: 10000, energy: 10000, nanite: 10000 },
  });
  f.fire();
  expect(f.kernel.world.isAlive(f.target)).toBe(false);
});

test("splash includes exact body tangency and excludes the next squared-distance fringe", () => {
  const f = fixture({
    weapon: {
      ...gun,
      projectile: { kind: "instant" },
      warheads: [{ type: "damage", amount: 100, radiusSubcells: 1024, tags: [] }],
    },
  });
  const tangent = f.spawn(3, 1, 25, 20),
    outside = f.spawn(3, 1, 25, 20);
  f.kernel.world.set(outside, Transform, "y", 20 * 1024 + 513);
  f.fire();
  expect(f.hp(tangent)).toBe(900);
  expect(f.hp(outside)).toBe(1000);
});

test("delayed multi-warhead damage and fuses persist and never repeat after target removal", () => {
  const f = fixture({
    weapon: {
      ...gun,
      projectile: { kind: "instant" },
      warheads: [
        { type: "damage", amount: 10, delayTicks: 2, tags: [] },
        { type: "damage", amount: 5, delayTicks: 4, tags: [] },
      ],
    },
  });
  f.fire();
  expect(f.hp()).toBe(1000);
  expect(f.kernel.world.query(PendingImpact)).toHaveLength(1);
  f.advance(2);
  expect(f.hp()).toBe(990);
  f.advance(2);
  expect(f.hp()).toBe(985);
  f.advance(10);
  expect(f.hp()).toBe(985);
  expect(f.kernel.world.query(PendingImpact)).toEqual([]);
  const fuse = fixture({
    weapon: {
      ...gun,
      projectile: { kind: "bullet", speedSubcellsPerTick: 10 * 1024, fuseTicks: 3 },
    },
  });
  fuse.fire();
  fuse.advance();
  expect(fuse.hp()).toBe(1000);
  fuse.advance(2);
  expect(fuse.hp()).toBe(1000);
  fuse.advance();
  expect(fuse.hp()).toBe(990);
});

test("death removes the actor once, clears targets and releases occupancy while event output stays outside hashes", () => {
  const f = fixture({ health: 10, weapon: { ...gun, projectile: { kind: "instant" } } });
  f.fire();
  expect(f.kernel.world.isAlive(f.target)).toBe(false);
  expect(f.kernel.world.has(f.actor, AttackOrder)).toBe(false);
  expect(f.kernel.combatEvents?.filter((event) => event.type === "death")).toHaveLength(1);
  const before = checkpointHash(f.kernel);
  emitCombatEvent(f.kernel, { type: "flight", x: 0, y: 0, force: 0, projectile: "bullet" });
  expect(checkpointHash(f.kernel)).toBe(before);
  f.advance();
  expect(f.kernel.combatEvents?.filter((event) => event.type === "death")).toEqual([]);
  f.kernel.combatEvents = [];
  for (let i = 0; i < MAX_COMBAT_EVENTS; i++)
    emitCombatEvent(f.kernel, { type: "flight", x: 0, y: 0, force: 0 });
  emitCombatEvent(f.kernel, { type: "death", x: 0, y: 0, force: 0 });
  expect(f.kernel.combatEvents).toHaveLength(MAX_COMBAT_EVENTS);
  expect(f.kernel.combatEvents.at(-1)?.type).toBe("death");
});

test("uphill misses strike the terrain below their victim instead of faking a direct hit", () => {
  const f = fixture({
    raised: true,
    miss: 1000,
    weapon: {
      ...gun,
      projectile: { kind: "instant" },
      warheads: [{ type: "damage", amount: 100, radiusSubcells: 1024, tags: [] }],
    },
  });
  f.fire();
  expect(f.hp()).toBe(1000);
  expect(f.kernel.streams.has("combat")).toBe(true);
  expect(
    f.kernel.combatEvents?.some((event) => event.type === "impact" && event.x <= 24 * 1024),
  ).toBe(true);
  const hit = fixture({
    raised: true,
    miss: 0,
    weapon: { ...gun, projectile: { kind: "instant" } },
  });
  hit.fire();
  expect(hit.hp()).toBe(990);
});

test("visibility clips actual round events and own-hit/death alerts reveal no hidden attacker origin or raw IDs", () => {
  const f = fixture({
    fog: "standard",
    health: 10,
    weapon: {
      ...gun,
      projectile: {
        kind: "missile",
        speedSubcellsPerTick: 1024,
        turnAnglePerTick: 1000,
        flightTicks: 40,
      },
    },
  });
  // A separate source authorizes the shot, without giving the victim's Force sight of the shooter.
  f.spawn(1, 0, 24, 21);
  f.advance();
  const victim = createProjection(f.setup, 2, "controlled"),
    unauthorised = createProjection(f.setup, 3, "controlled");
  expect(victim.snapshot(f.kernel).combatEvents?.some((event) => event.type === "launch")).toBe(
    false,
  );
  expect(unauthorised.snapshot(f.kernel).combatEvents).toEqual([]);
  let observed = false;
  for (let tick = 0; tick < 12 && f.kernel.world.isAlive(f.target); tick++) {
    f.advance();
    const packet = victim.snapshot(f.kernel);
    for (const event of packet.combatEvents ?? []) {
      expect(Object.hasOwn(event, "round")).toBe(false);
      expect(Object.hasOwn(event, "force")).toBe(false);
      expect(event.x).toBeGreaterThan(22 * 1024);
      observed = true;
    }
  }
  expect(observed).toBe(true);
  expect(f.kernel.world.isAlive(f.target)).toBe(false);
});

test("event actor handles use current presented actors and retain only previously presented death victims", () => {
  const f = fixture({ health: 10, weapon: { ...gun, projectile: { kind: "instant" } } });
  const projection = createProjection(f.setup, 1, "controlled");
  const before = projection.snapshot(f.kernel);
  const actor = before.entities.find(
    (entity) => projection.resolve(entity.handle) === f.actor,
  )?.handle;
  const victim = before.entities.find(
    (entity) => projection.resolve(entity.handle) === f.target,
  )?.handle;
  f.fire();
  const snapshot = projection.snapshot(f.kernel);
  expect(snapshot.combatEvents?.find((event) => event.type === "launch")?.entity).toBe(actor);
  const death = snapshot.combatEvents?.find((event) => event.type === "death");
  expect(death?.entity).toBe(victim);
  expect(projection.resolve(death?.entity)).toBeUndefined();
  Reflect.set(death as object, "entity", "e999");
  expect(
    projection.snapshot(f.kernel).combatEvents?.find((event) => event.type === "death")?.entity,
  ).toBe(victim);
  expect(
    createProjection(f.setup, 1, "controlled")
      .snapshot(f.kernel)
      .combatEvents?.find((event) => event.type === "death")?.entity,
  ).toBeUndefined();
  const living = fixture({ weapon: { ...gun, projectile: { kind: "instant" } } });
  living.fire();
  const observer = createProjection(living.setup, 1, "controlled"),
    packet = observer.snapshot(living.kernel);
  const damaged = packet.combatEvents?.find((event) => event.type === "damage")?.entity;
  expect(observer.resolve(damaged)).toBe(living.target);
});

test("unsupported projectile kinds and exhausted round capacity cannot consume RNG or weapon clocks", () => {
  const unavailable = fixture({
    weapon: { ...gun, scatterSubcells: 100, projectile: { kind: "arc" } },
  });
  unavailable.fire();
  expect(unavailable.hp()).toBe(1000);
  expect(unavailable.kernel.world.query(ShotIntent)).toEqual([]);
  expect(unavailable.kernel.streams.has("combat")).toBe(false);
  const f = fixture({ weapon: { ...gun, scatterSubcells: 100, projectile: { kind: "instant" } } });
  for (let i = 0; i < MAX_ACTIVE_ROUNDS; i++) {
    const id = f.kernel.world.create();
    f.kernel.world.add(id, PendingImpact, {
      definition: 2,
      weapon: 0,
      remaining: 1,
      tick: 100000,
      ceiling: 255,
    });
  }
  f.fire();
  expect(f.kernel.streams.has("combat")).toBe(false);
  const state = f.kernel.world
    .query(WeaponState)
    .find((id) => f.kernel.world.get(id, WeaponState, "shooter") === f.actor) as number;
  expect(f.kernel.world.get(state, WeaponState, "reloadAt")).toBe(0);
  f.kernel.world.destroy(f.kernel.world.query(PendingImpact)[0] as number);
  f.advance();
  expect(f.kernel.streams.has("combat")).toBe(true);
});

test("active flight and delayed impacts continue identically after World and vision restoration", () => {
  const definitions: Definition[] = [
    {
      ...unit,
      visionSubcells: 6 * 1024,
      id: "unit:restore/shooter",
      weapons: [
        {
          ...gun,
          projectile: {
            kind: "missile",
            speedSubcellsPerTick: 1024,
            turnAnglePerTick: 1000,
            flightTicks: 40,
          },
          warheads: [{ type: "damage", amount: 10, delayTicks: 3, tags: [] }],
        },
      ],
    },
    unit,
  ];
  const make = () => {
    const kernel = createKernel({ seed: 1, debug: false, map: flatMap(16) });
    register(kernel, entitiesFeature(definitions));
    register(kernel, movementFeature({ definitions, grants: [] }));
    register(kernel, { components: [ConstructionSite, BuilderConstruction] });
    register(kernel, combatFeature({ definitions, grants: [] }));
    initializeProjectiles(kernel, { definitions });
    initializeVision(kernel, {
      definitions,
      forces: [
        { index: 0, faction: "faction:restore" },
        { index: 1, faction: "faction:restore" },
      ],
    });
    return kernel;
  };
  const source = make();
  spawnEntity(source, 0, definitions[0] as Definition, {
    definition: definitions[0]?.id as string,
    force: 0,
    x: 5 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  spawnEntity(source, 1, unit, {
    definition: unit.id,
    force: 1,
    x: 9 * 1024 + 512,
    y: 5 * 1024 + 512,
    facing: 0,
  });
  step(source, []);
  step(source, []);
  expect(source.world.query(Projectile)).toHaveLength(1);
  const restored = make();
  restored.world.load(source.world.serialize());
  restored.vision?.load(source.vision?.serialize());
  restored.tick = source.tick;
  expect(checkpointHash(restored)).toBe(checkpointHash(source));
  for (let tick = 0; tick < 15; tick++) {
    step(source, []);
    step(restored, []);
    expect(checkpointHash(restored)).toBe(checkpointHash(source));
  }
});
