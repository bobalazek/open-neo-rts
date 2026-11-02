import { expect, test } from "bun:test";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { createMatchRecord, verifyMatchRecord } from "../../snapshots";
import { replayScenario } from "../../snapshots/replay";
import { flatMap } from "../../testing/maps";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { MoveIntent } from "../movement";
import { Projectile } from "../projectiles";
import { UnitMode } from ".";

function fixture() {
  const mode = {
    id: "siege-mode",
    cooldownTicks: 3,
    damagePerMille: 1250,
    armorPerMille: 1500,
    rangePerMille: 1000,
    rangeBonusSubcells: 3072,
    cost: { credits: 100 },
  };
  const definitions: Definition[] = [
    {
      id: "structure:deployment/headquarters",
      role: "headquarters",
      health: 1000,
      speed: 0,
      turnRate: 0,
      footprint: [1, 1],
      visionSubcells: 1024,
    },
    {
      id: "unit:deployment/builder",
      role: "builder",
      health: 100,
      speed: 100,
      turnRate: 65536,
      domain: "foot",
      radiusSubcells: 0,
      visionSubcells: 1024,
    },
    {
      id: "unit:deployment/tank",
      role: "combat",
      health: 900,
      speed: 102,
      turnRate: 65536,
      domain: "tracked",
      radiusSubcells: 256,
      armor: "heavy",
      visionSubcells: 20 * 1024,
      deployMode: mode,
      weapons: [
        {
          id: "cannon",
          targets: ["ground"],
          rangeSubcells: [0, 7 * 1024],
          reloadTicks: 1000,
          projectile: {
            kind: "bullet",
            speedSubcellsPerTick: 512,
            blockedBy: ["units", "structures"],
          },
          warheads: [{ type: "damage", amount: 100, tags: [] }],
        },
      ],
    },
  ];
  const setup: MatchSetup = {
    seed: 7,
    debug: false,
    map: {
      ...flatMap(48),
      spawns: [0, 1].map((i) => ({
        id: `s${i}`,
        position: [(6 + 32 * i) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    definitions,
    forces: [0, 1].map((index) => ({ index, faction: "faction:deployment" })),
    seats: [1, 2, 3],
    grants: [
      ...[0, 1].map((force) => ({
        seat: force + 1,
        force,
        scopes: ["unit.orders", "unit.abilities", "surrender"] as const,
        grantedAtTick: 0,
      })),
      { seat: 3, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
    ],
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
            { unit: definitions[2]!.id, count: 1, pop: 3, role: "combat" },
          ],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const spawn = (force: number, x: number, facing = 0) =>
    spawnEntity(kernel, 2, definitions[2]!, {
      definition: definitions[2]!.id,
      force,
      x: x * 1024,
      y: 20 * 1024,
      facing,
    });
  const deploy = (entities: number[], seat = 1) =>
    step(kernel, [
      { tick: kernel.tick, seat, sequence: 0, type: "unit.deploy", payload: { entities } },
    ])[0]?.result;
  const move = (entity: number) =>
    step(kernel, [
      {
        tick: kernel.tick,
        seat: 1,
        sequence: 0,
        type: "unit.move",
        payload: { entities: [entity], x: 30 * 1024, y: 20 * 1024 },
      },
    ])[0]?.result;
  const until = (tick: number) => {
    while (kernel.tick < tick) step(kernel, []);
  };
  return { kernel, setup, mode, spawn, deploy, move, until };
}

test("deployment authorizes every actor, pays a unique selection atomically, keeps cooldown and copies metadata", () => {
  const f = fixture(),
    a = f.spawn(0, 20),
    b = f.spawn(0, 22);
  expect(f.kernel.economy?.spend(1, 0, { credits: 850 }, "unit.abilities").ok).toBe(true);
  expect(f.deploy([a, b], 3)).toBe("no_grant");
  expect(f.deploy([a, b])).toBe("insufficient_funds");
  expect(f.kernel.economy?.balance(0)?.credits).toBe(150);
  expect(f.kernel.world.has(a, UnitMode)).toBe(false);
  expect(f.kernel.world.has(b, UnitMode)).toBe(false);
  expect(Object.isFrozen(f.mode)).toBe(false);
  f.mode.damagePerMille = 0;
  f.mode.cost.credits = 999;
  f.kernel.economy?.gain(0, { credits: 50 });
  expect(f.deploy([b, a, a])).toBe("accepted");
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0);
  expect(f.kernel.unitModes?.damageBonus(a)).toBe(250);
  expect(f.deploy([a, b])).toBe("cooldown");
  f.until(f.kernel.world.get(a, UnitMode, "readyAt"));
  const own = createProjection(f.setup, 1, "controlled")
    .snapshot(f.kernel)
    .entities.find((e) => e.x === 20 * 1024);
  const other = createProjection(f.setup, 2, "controlled")
    .snapshot(f.kernel)
    .entities.find((e) => e.x === 20 * 1024);
  expect(own?.deploy?.readyAt).toBeNumber();
  expect(other?.deploy).toEqual({ id: "siege-mode", active: true });
  const ordersOnly = createProjection(f.setup, 3, "controlled")
    .snapshot(f.kernel)
    .entities.find((e) => e.x === 20 * 1024);
  expect(ordersOnly?.deploy?.readyAt).toBeUndefined();
  const observed = f.kernel.observe?.(1).entities.find((e) => e.x === 20 * 1024);
  if (observed?.deploy) observed.deploy.active = false;
  expect(f.kernel.observe?.(1).entities.find((e) => e.x === 20 * 1024)?.deploy?.active).toBe(true);
  expect(f.deploy([a, b])).toBe("accepted");
  expect(f.kernel.economy?.balance(0)?.credits).toBe(0);
  expect(f.kernel.unitModes?.active(a)).toBeUndefined();
});

test("deploy cancels a real route and all movement entry points remain locked until packing", () => {
  const f = fixture(),
    actor = f.spawn(0, 20);
  expect(f.move(actor)).toBe("accepted");
  expect(f.kernel.world.has(actor, MoveIntent)).toBe(true);
  expect(f.deploy([actor])).toBe("accepted");
  const x = f.kernel.world.get(actor, Transform, "x");
  expect(f.kernel.world.has(actor, MoveIntent)).toBe(false);
  expect(f.move(actor)).toBe("immobile");
  f.kernel.movement?.order(actor, { x: 30 * 1024, y: 20 * 1024 });
  f.until(f.kernel.tick + 10);
  expect(f.kernel.world.get(actor, Transform, "x")).toBe(x);
  expect(f.kernel.world.has(actor, MoveIntent)).toBe(false);
  expect(f.deploy([actor])).toBe("accepted");
  expect(f.move(actor)).toBe("accepted");
  expect(f.kernel.world.has(actor, MoveIntent)).toBe(true);
});

test("real flight applies mode damage and armor once, and packing cannot change an already launched shell", () => {
  const close = fixture(),
    a = close.spawn(0, 20),
    b = close.spawn(1, 26, 32768);
  expect(close.deploy([a])).toBe("accepted");
  close.until(20);
  expect(close.kernel.world.get(a, Health, "current")).toBe(834);
  expect(close.kernel.world.get(b, Health, "current")).toBe(775);
  const distant = fixture(),
    shooter = distant.spawn(0, 20),
    target = distant.spawn(1, 28, 32768);
  expect(distant.deploy([shooter])).toBe("accepted");
  expect(distant.kernel.unitModes?.range(shooter, 7 * 1024)).toBe(10 * 1024);
  distant.until(3);
  expect(distant.deploy([shooter])).toBe("accepted");
  const round = distant.kernel.world.query(Projectile)[0];
  expect(round).toBeDefined();
  expect(distant.kernel.world.get(round!, Projectile, "damageBonus")).toBe(250);
  distant.until(25);
  expect(distant.kernel.world.get(target, Health, "current")).toBe(775);
});

test("deployment commands reproduce active mid-match and terminal hashes through the normal record pipeline", () => {
  const f = fixture();
  const tank = f.kernel.world
    .query(Template, OwnerForce)
    .find(
      (entity) =>
        f.kernel.world.get(entity, Template, "definition") === 2 &&
        f.kernel.world.get(entity, OwnerForce, "force") === 0,
    )!;
  expect(f.deploy([tank])).toBe("accepted");
  const activeHash = checkpointHash(f.kernel);
  f.until(5);
  expect(f.deploy([tank])).toBe("accepted");
  f.until(10);
  step(f.kernel, [
    { tick: 10, seat: 1, sequence: 0, type: "match.surrender", payload: { force: 0 } },
  ]);
  const record = createMatchRecord(f.kernel, f.setup);
  expect(checkpointHash(replayScenario(record.scenario, 1))).toBe(activeHash);
  expect(verifyMatchRecord(JSON.parse(JSON.stringify(record))).hash).toBe(record.hash);
});
