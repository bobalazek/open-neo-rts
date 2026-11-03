import { expect, test } from "bun:test";
import type { Command, Payloads } from "../../commands";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createProjection } from "../../projection";
import { flatMap } from "../../testing/maps";
import { ConstructionApproach, ConstructionSite } from "../construction";
import { type Definition, Health, OwnerForce, spawnEntity, Template, Transform } from "../entities";
import { checkSpawnPlacement } from "../entities/placement";
import { Remains, SALVAGE_STATES, SalvageOrder } from ".";
import { SALVAGE_WORK } from "./work";

const unit: Definition = {
  id: "unit:salvage/builder",
  role: "builder",
  health: 100,
  speed: 1024,
  turnRate: 65536,
  domain: "foot",
  radiusSubcells: 128,
  visionSubcells: 4 * 1024,
};
const structure: Definition = {
  id: "structure:salvage/headquarters",
  role: "headquarters",
  health: 100,
  speed: 0,
  turnRate: 0,
  footprint: [2, 3],
  cells: ["ll", "ll", "ll"],
  visionSubcells: 4 * 1024,
  construction: { cost: { credits: 1000, materials: 6 }, buildTicks: 100 },
};
function fixture(
  options: { fog?: "standard" | "off"; expires?: number; cost?: Definition["construction"] } = {},
) {
  const definitions: Definition[] = [
    structure,
    unit,
    {
      ...unit,
      id: "unit:salvage/vehicle",
      role: "combat",
      domain: "tracked",
      construction: options.cost === undefined ? structure.construction : options.cost,
    },
  ];
  const setup: MatchSetup = {
    seed: 5,
    debug: false,
    definitions,
    map: {
      ...flatMap(32),
      spawns: [
        { id: "west", position: [6 * 1024, 6 * 1024], facing: 16384 },
        { id: "east", position: [24 * 1024, 24 * 1024], facing: 16384 },
      ],
    },
    forces: [0, 1].map((index) => ({ index, faction: "faction:fixture" })),
    seats: [1, 2, 3],
    grants: [0, 1].flatMap((force) => [
      { seat: force + 1, force, scopes: ["unit.orders"] as const, grantedAtTick: 0 },
      {
        seat: force + 1,
        force,
        scopes: ["economy.build"] as const,
        grantedAtTick: 0,
        ...(options.expires !== undefined && { expiresAtTick: options.expires }),
      },
    ]),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        fog: options.fog ?? "off",
        popCap: 500,
        structureCap: 400,
      },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: index ? "east" : "west",
        start: {
          structures: [structure.id],
          units: [{ unit: unit.id, count: 1, pop: 1, role: "builder" }],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup),
    world = kernel.world;
  const builders = world
    .query(Template, OwnerForce)
    .filter((id) => definitions[world.get(id, Template, "definition")]?.role === "builder");
  const target = spawnEntity(kernel, 2, definitions[2]!, {
    definition: definitions[2]!.id,
    force: 1,
    x: 12 * 1024,
    y: 12 * 1024,
    facing: 16384,
  });
  const position = (id: number, x = 11 * 1024 + 512, y = 12 * 1024 + 512) => {
    world.set(id, Transform, "x", x);
    world.set(id, Transform, "y", y);
  };
  position(builders[0]!);
  const kill = (id = target, site = false) => {
    if (site) world.add(id, ConstructionSite);
    world.set(id, Health, "current", 0);
    step(kernel, []);
    return world.query(Remains).at(-1)!;
  };
  const command = <T extends keyof Payloads>(type: T, payload: Payloads[T], seat = 1) =>
    step(kernel, [{ tick: kernel.tick, sequence: 0, seat, type, payload } as Command])[0]?.result;
  const ticks = (count: number) => {
    for (let i = 0; i < count; i++) step(kernel, []);
  };
  const order = (entity: number, ids = [builders[0]!], seat = 1) =>
    command("economy.salvage", { entity, builders: ids }, seat);
  return { kernel, world, setup, builders, target, position, kill, command, ticks, order };
}

test("actual destruction stores bounded cost-based value; approaching builders work then receive it exactly once", () => {
  const f = fixture(),
    remains = f.kill(),
    builder = f.builders[0]!;
  expect(f.world.get(remains, Remains, "materials")).toBe(4);
  f.position(builder, 8 * 1024 + 512);
  expect(f.order(remains)).toBe("accepted");
  expect(f.world.get(remains, Remains, "work")).toBe(0);
  f.ticks(20);
  expect(f.world.get(builder, ConstructionApproach, "state")).toBe(1);
  expect(f.world.get(remains, Remains, "work")).toBeGreaterThan(0);
  expect(f.kernel.economy?.balance(0)?.materials).toBe(0);
  f.ticks(110);
  expect(f.world.isAlive(remains)).toBe(false);
  expect(f.world.has(builder, SalvageOrder)).toBe(false);
  expect(f.kernel.economy?.balance(0)?.materials).toBe(4);
  expect(f.order(remains)).toBe("bad_payload");
  f.ticks(20);
  expect(f.kernel.economy?.balance(0)?.materials).toBe(4);
});

test("unfinished and unpriced remains can be cleared without minting resources; extreme prices stay integer-bounded", () => {
  for (const options of [
    { cost: null },
    { cost: { cost: { credits: 0x7fffffff, materials: 0x7fffffff }, buildTicks: 1 } },
  ]) {
    const f = fixture(options),
      remains = f.kill();
    const value = f.world.get(remains, Remains, "materials");
    expect(value).toBe(options.cost ? 542239620 : 0);
    expect(Number.isInteger(value)).toBe(true);
  }
  const f = fixture(),
    remains = f.kill(f.target, true);
  expect(f.world.get(remains, Remains, "materials")).toBe(0);
  f.order(remains);
  f.ticks(110);
  expect(f.world.isAlive(remains)).toBe(false);
  expect(f.kernel.economy?.balance(0)?.materials).toBe(0);
});

test("invalid targets, mixed Forces and duplicate builders leave an accepted job intact", () => {
  const f = fixture(),
    remains = f.kill(),
    builder = f.builders[0]!;
  f.order(remains);
  for (const [target, ids, seat] of [
    [builder, [builder], 1],
    [remains, [builder, builder], 1],
    [remains, f.builders, 1],
    [remains, [builder], 2],
  ] as const) {
    expect(f.order(target, [...ids], seat)).not.toBe("accepted");
    expect(f.world.get(builder, SalvageOrder, "target")).toBe(remains);
  }
  expect(f.world.get(remains, Remains, "work")).toBeGreaterThan(0);
});

test("stop and move replace salvage; target work survives explicit resumption", () => {
  const f = fixture(),
    remains = f.kill(),
    builder = f.builders[0]!;
  f.order(remains);
  f.ticks(10);
  const work = f.world.get(remains, Remains, "work");
  f.command("unit.stop", { entities: [builder] });
  f.ticks(10);
  expect(f.world.has(builder, SalvageOrder)).toBe(false);
  expect(f.world.get(remains, Remains, "work")).toBe(work);
  f.order(remains);
  expect(f.world.get(remains, Remains, "work")).toBeGreaterThan(work);
  f.command("unit.move", { entities: [builder], x: 9 * 1024 + 512, y: 12 * 1024 + 512 });
  expect(f.world.has(builder, SalvageOrder)).toBe(false);
});

test("grant expiry pauses work without granting income or dropping stored progress", () => {
  const f = fixture({ expires: 20 }),
    remains = f.kill(),
    builder = f.builders[0]!;
  f.order(remains);
  f.ticks(22);
  const work = f.world.get(remains, Remains, "work");
  f.ticks(100);
  expect(f.world.get(remains, Remains, "work")).toBe(work);
  expect(SALVAGE_STATES[f.world.get(builder, SalvageOrder, "state")]).toBe("grant");
  expect(f.kernel.economy?.balance(0)?.materials).toBe(0);
});

test("lost sight revokes a salvage target and its private projection handle", () => {
  const f = fixture({ fog: "standard" }),
    remains = f.kill(),
    builder = f.builders[0]!;
  f.order(remains);
  const projection = createProjection(f.setup, 1, "controlled"),
    view = projection.snapshot(f.kernel);
  const handle = view.remains![0]!.handle;
  expect(view.entities.find((row) => row.salvageOrder)?.salvageOrder?.target).toBe(handle);
  expect(projection.resolve(handle, "economy.build")).toBeUndefined();
  f.position(builder, 3 * 1024, 3 * 1024);
  f.ticks(2);
  expect(f.world.has(builder, SalvageOrder)).toBe(false);
  expect(projection.snapshot(f.kernel).remains).toHaveLength(0);
  expect(projection.resolve(handle)).toBeUndefined();
  expect(f.order(remains)).toBe("bad_payload");
});

test("opposing builders cannot double-pay a contested remains row; bank overflow retains completed work", () => {
  const f = fixture(),
    remains = f.kill();
  f.position(f.builders[1]!, 13 * 1024 + 512);
  f.order(remains);
  f.order(remains, [f.builders[1]!], 2);
  f.kernel.economy?.gain(0, { materials: 0x7fffffff });
  f.ticks(120);
  expect(f.world.get(remains, Remains, "work")).toBe(SALVAGE_WORK);
  expect(SALVAGE_STATES[f.world.get(f.builders[0]!, SalvageOrder, "state")]).toBe("storage");
  expect(f.kernel.economy?.balance(1)?.materials).toBe(0);
  f.kernel.economy?.spend(1, 0, { materials: 4 }, "economy.build");
  f.ticks(1);
  expect(f.world.isAlive(remains)).toBe(false);
  expect(f.kernel.economy?.balance(0)?.materials).toBe(0x7fffffff);
  expect(f.kernel.economy?.balance(1)?.materials).toBe(0);
});

test("clearing rotated rubble releases its entire placement footprint", () => {
  const f = fixture();
  f.position(f.target, 17 * 1024, 17 * 1024);
  const target = spawnEntity(f.kernel, 0, structure, {
    definition: structure.id,
    force: 1,
    x: 12 * 1024,
    y: 12 * 1024,
    facing: 32768,
  });
  const remains = f.kill(target);
  const spawn = { definition: structure.id, force: 0, x: 12 * 1024, y: 12 * 1024, facing: 32768 };
  expect(checkSpawnPlacement(f.kernel, f.setup.definitions, spawn).ok).toBe(false);
  f.order(remains);
  f.ticks(110);
  expect(f.world.isAlive(remains)).toBe(false);
  expect(checkSpawnPlacement(f.kernel, f.setup.definitions, spawn).ok).toBe(true);
});

test("identical command streams preserve canonical progress and outcome hashes", () => {
  const a = fixture(),
    b = fixture();
  const ar = a.kill(),
    br = b.kill();
  a.order(ar);
  b.order(br);
  a.ticks(30);
  b.ticks(30);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  expect(a.world.serialize()).toEqual(b.world.serialize());
  b.world.set(br, Remains, "work", b.world.get(br, Remains, "work") + 1);
  expect(checkpointHash(a.kernel)).not.toBe(checkpointHash(b.kernel));
  b.world.set(br, Remains, "work", b.world.get(br, Remains, "work") - 1);
  a.ticks(110);
  b.ticks(110);
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
});
