import { expect, test } from "bun:test";
import { addString, createHasher, digest } from "@open-neo-rts/deterministic";
import { type Component, defineComponent } from "../ecs";
import { UnitMode } from "../features/abilities";
import { AttackOrder, WeaponState } from "../features/combat";
import { applyBurn, Burning } from "../features/combat/burn";
import { applyDisable, Disabled } from "../features/combat/disable";
import { applySlow, Slowed } from "../features/combat/slow";
import {
  KitStructure,
  RepairCredit,
  RepairOrder,
  RepairWork,
} from "../features/construction/repair";
import {
  BuilderConstruction,
  ConstructionApproach,
  ConstructionPayment,
} from "../features/construction/sites";
import { ORDER_REFUSALS, QueuedOrder } from "../features/control/orders";
import { ForceBank } from "../features/economy/bank";
import { Extraction, ResourceNode } from "../features/economy/extraction";
import { Harvester } from "../features/economy/harvesting";
import { OreCell } from "../features/economy/ore";
import { StructurePower } from "../features/economy/power";
import { Health, OwnerForce, spawnEntity, Template, Transform } from "../features/entities";
import { Boarding, Cargo } from "../features/entities/transport";
import { MoveIntent } from "../features/movement";
import { Remains } from "../features/salvage";
import { MatchOutcome } from "../features/victory";
import { StatisticsSeries, TypeStatistics } from "../features/victory/statistics";
import { checkpointHash, step, stream } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { resourceNodeOrigin } from "../match-map";
import { flatMap } from "../testing/maps";
import { restoreCanonicalState } from "./canonical-state";
import { prepareCanonicalValidation } from "./canonical-validation";
import { createMatchKeyframe } from "./keyframe";
import { createMatchRecord } from "./match-record";
import {
  createMatchSnapshot,
  MAX_SNAPSHOT_TICK,
  parseMatchSnapshot,
  restoreMatchSnapshot,
} from "./match-snapshot";
import { verifyMatchRecord } from "./playback";

function fixture(seed = 7) {
  const setup: MatchSetup = {
    seed,
    debug: false,
    map: {
      ...flatMap(48),
      spawns: [0, 1].map((i) => ({
        id: `s${i}`,
        position: [(6 + 28 * i) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    definitions: [
      {
        id: "structure:snapshot/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:snapshot/builder",
        role: "builder",
        health: 10,
        speed: 100,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
    ],
    forces: [0, 1].map((index) => ({ index, faction: "faction:snapshot" })),
    seats: [1, 2],
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["unit.orders", "surrender"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150 },
      bots: [{ seat: 2, kind: "idle" }],
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `s${index}`,
        start: {
          structures: ["structure:snapshot/headquarters"],
          units: [{ unit: "unit:snapshot/builder", count: 1, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  return { setup, kernel: createMatch(setup) };
}

// Recompute the public file checksum to distinguish structural validation from accidental damage.
function seal<T extends object>(value: T): T {
  const { checksum: _checksum, ...body } = value as T & { checksum?: string };
  const sorted = JSON.stringify(body, (_key, input) =>
    input && typeof input === "object" && !Array.isArray(input)
      ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : input,
  );
  const hash = createHasher();
  addString(hash, sorted);
  return { ...body, checksum: digest(hash).hex } as T;
}

test("owned keyframes restore repeatedly without elapsed-tick replay, isolate future state and retain input records", () => {
  const { setup, kernel } = fixture();
  const actor = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
  step(kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [actor], x: 20 * 1024 + 512, y: 20 * 1024 + 512 },
    },
  ]);
  for (let i = 0; i < 60; i++) step(kernel, []);
  const frame = createMatchKeyframe(kernel, setup),
    savedHash = checkpointHash(kernel);
  expect(Object.isFrozen(frame)).toBe(true);
  expect(Object.keys(frame)).toEqual(["tick", "hash", "serialize", "restore"]);
  const first = frame.restore(setup),
    second = frame.restore(setup);
  expect(checkpointHash(first)).toBe(savedHash);
  expect(checkpointHash(second)).toBe(savedHash);
  expect(first.log).toHaveLength(1); // elapsed hosted-controller steps were not replayed into the log
  expect(() => frame.restore({ ...setup, seed: 99 })).toThrow("setup");
  first.world.set(actor, Transform, "x", 1024);
  expect(checkpointHash(second)).toBe(savedHash);
  expect(checkpointHash(frame.restore(setup))).toBe(savedHash);
  for (let i = 0; i < 20; i++) {
    step(kernel, []);
    step(second, []);
    expect(checkpointHash(second)).toBe(checkpointHash(kernel));
  }
  const surrender = {
    tick: kernel.tick,
    seat: 1,
    sequence: 1,
    type: "match.surrender",
    payload: { force: 0 },
  };
  step(kernel, [surrender]);
  step(second, [surrender]);
  expect(verifyMatchRecord(createMatchRecord(second, setup)).hash).toBe(checkpointHash(kernel));
});

test("snapshot isolates its bytes, restores queued movement/bot state/fog and retains the full terminal record", () => {
  const { setup, kernel } = fixture();
  const actor = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
  step(kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [actor], x: 16 * 1024 + 512, y: 20 * 1024 + 512 },
    },
    {
      tick: 0,
      seat: 1,
      sequence: 1,
      type: "unit.move",
      payload: { entities: [actor], x: 20 * 1024 + 512, y: 23 * 1024 + 512, append: 1 },
    },
  ]);
  const snapshot = createMatchSnapshot(kernel, setup);
  const loaded = restoreMatchSnapshot(JSON.parse(JSON.stringify(snapshot)), setup);
  expect(checkpointHash(loaded)).toBe(checkpointHash(kernel));
  expect(loaded.orders?.rows(actor)).toHaveLength(1);
  for (let i = 0; i < 30; i++) {
    step(kernel, []);
    step(loaded, []);
    expect(checkpointHash(loaded)).toBe(checkpointHash(kernel));
  }
  expect(snapshot.tick).toBe(1);
  expect(loaded.world.get(actor, Transform, "x")).toBe(kernel.world.get(actor, Transform, "x"));
  const surrender = {
    tick: kernel.tick,
    seat: 1,
    sequence: 2,
    type: "match.surrender",
    payload: { force: 0 },
  };
  step(kernel, [surrender]);
  step(loaded, [surrender]);
  const record = createMatchRecord(loaded, setup);
  expect(record.scenario.commands).toHaveLength(3);
  expect(verifyMatchRecord(record).hash).toBe(checkpointHash(kernel));
  expect(checkpointHash(restoreMatchSnapshot(createMatchSnapshot(loaded, setup), setup))).toBe(
    checkpointHash(kernel),
  );
});

test("failed imports leave the live host untouched and reject identity, damage and forged state", () => {
  const { setup, kernel } = fixture();
  const snapshot = createMatchSnapshot(kernel, setup),
    before = checkpointHash(kernel);
  expect(() => restoreMatchSnapshot(snapshot, { ...setup, seed: 99 })).toThrow("setup");
  expect(() => restoreMatchSnapshot({ ...snapshot, tick: 1 }, setup)).toThrow("checksum");
  expect(() =>
    restoreMatchSnapshot(seal({ ...snapshot, tick: MAX_SNAPSHOT_TICK + 1 }), setup),
  ).toThrow("incompatible");
  expect(() =>
    restoreMatchSnapshot(seal({ ...snapshot, movement: { routes: [], scheduler: {} } }), setup),
  ).toThrow("input history");
  const forged = JSON.parse(JSON.stringify(snapshot));
  const actor = kernel.world.query(Template)[0]!;
  const originalX = kernel.world.get(actor, Transform, "x");
  kernel.world.set(actor, Transform, "x", 9 * 1024);
  const changed = createMatchSnapshot(kernel, setup);
  expect(() => restoreMatchSnapshot(changed, setup)).toThrow("input history");
  kernel.world.set(actor, Transform, "x", originalX);
  expect(checkpointHash(kernel)).toBe(before);
  expect(() => parseMatchSnapshot({ ...forged, extra: 1 })).toThrow("incompatible");
  expect(() =>
    parseMatchSnapshot({
      ...snapshot,
      get world() {
        throw new Error("getter ran");
      },
    }),
  ).toThrow("own data");
  expect(checkpointHash(kernel)).toBe(before);
});

test("non-serializable custom controllers and unrecorded PRNG changes refuse instead of losing state", () => {
  const { setup, kernel } = fixture();
  kernel.controllers.set(1, () => []);
  expect(() => createMatchSnapshot(kernel, setup)).toThrow("serializable");
  kernel.controllers.delete(1);
  stream(kernel, "unrecorded");
  expect(() => restoreMatchSnapshot(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "input history",
  );
});

test("signed PRNG words save as unsigned without changing canonical state", () => {
  const { setup, kernel } = fixture(12);
  const before = checkpointHash(kernel);
  expect(
    [...kernel.streams.values()].some(
      (words) => words.a < 0 || words.b < 0 || words.c < 0 || words.d < 0,
    ),
  ).toBe(true);
  const saved = createMatchSnapshot(kernel, setup);
  expect(
    saved.streams.every((words) => words.a >= 0 && words.b >= 0 && words.c >= 0 && words.d >= 0),
  ).toBe(true);
  expect(checkpointHash(restoreMatchSnapshot(saved, setup))).toBe(before);
});

test("a forged refused command cannot become accepted history in the resumed replay", () => {
  const { setup, kernel } = fixture();
  step(kernel, []);
  const saved = createMatchSnapshot(kernel, setup);
  const actor = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, OwnerForce, "force") === 1 &&
        kernel.world.get(id, Template, "definition") === 1,
    )!;
  const forged = seal({
    ...saved,
    scenario: {
      ...saved.scenario,
      commands: [
        {
          tick: 0,
          seat: 1,
          sequence: 0,
          type: "unit.hold",
          payload: { entities: [actor] },
        },
      ],
    },
  });
  expect(() => restoreMatchSnapshot(forged, setup)).toThrow("refused external inputs");
});

test("independent actor checks reject rehashed invalid rows without relying on command history", () => {
  const corruptions: ((kernel: ReturnType<typeof createMatch>, actor: number) => void)[] = [
    (kernel, actor) => kernel.world.set(actor, Template, "definition", 99),
    (kernel, actor) => kernel.world.set(actor, OwnerForce, "force", 99),
    (kernel, actor) => kernel.world.set(actor, Health, "current", 1000),
    (kernel, actor) => kernel.world.remove(actor, Health),
    (kernel, actor) => kernel.world.remove(actor, Transform),
    (kernel, actor) => kernel.world.set(actor, Transform, "x", -1),
  ];
  for (const corrupt of corruptions) {
    const { setup, kernel } = fixture();
    const actor = kernel.world
      .query(Template)
      .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
    corrupt(kernel, actor);
    const saved = createMatchSnapshot(kernel, setup),
      before = checkpointHash(kernel);
    expect(() => restoreCanonicalState(saved, setup)).toThrow("Invalid canonical state");
    expect(checkpointHash(kernel)).toBe(before);
  }
});

test("installed bank row identities survive restoration and cannot be rebound by valid-width bytes", () => {
  for (const replace of [false, true]) {
    const { setup, kernel } = fixture();
    const row = kernel.world.query(ForceBank)[0]!;
    if (replace) {
      const values = Object.fromEntries(
        Object.keys(ForceBank.fields).map((field) => [
          field,
          kernel.world.get(row, ForceBank, field as keyof typeof ForceBank.fields),
        ]),
      );
      kernel.world.destroy(row);
      kernel.world.add(kernel.world.create(), ForceBank, values);
    } else kernel.world.set(row, ForceBank, "force", 1);
    expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
      "installed row identities",
    );
  }
});

test("deposit and ore checks accept valid depleted/unlimited boundaries and reject rehashed stock or identity changes", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    map: {
      ...initial.map,
      resources: [
        { kind: "materials", position: [24 * 1024, 24 * 1024], amount: 100 },
        { kind: "oil", position: [28 * 1024, 24 * 1024] },
        { kind: "ore", position: [24 * 1024, 28 * 1024], radius: 1024, amount: 100 },
      ],
    },
  };
  const mutations: ((kernel: ReturnType<typeof createMatch>) => void)[] = [
    (kernel) => kernel.world.set(kernel.world.query(ForceBank)[0]!, ForceBank, "credits", -1),
    (kernel) =>
      kernel.world.set(kernel.world.query(ResourceNode)[0]!, ResourceNode, "remaining", 101),
    (kernel) =>
      kernel.world.set(kernel.world.query(ResourceNode)[1]!, ResourceNode, "remaining", 0),
    (kernel) => kernel.world.set(kernel.world.query(OreCell)[0]!, OreCell, "cap", 999),
    (kernel) => kernel.world.set(kernel.world.query(OreCell)[0]!, OreCell, "remaining", 101),
    (kernel) => kernel.world.set(kernel.world.query(OreCell)[0]!, OreCell, "regrowthTicks", 200),
  ];
  for (const mutate of mutations) {
    const kernel = createMatch(setup);
    mutate(kernel);
    expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
      "Invalid canonical state",
    );
  }
  const kernel = createMatch(setup);
  kernel.world.set(kernel.world.query(ResourceNode)[0]!, ResourceNode, "remaining", 0);
  kernel.world.set(kernel.world.query(ForceBank)[0]!, ForceBank, "credits", 0x7fffffff);
  const saved = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(saved, setup))).toBe(saved.hash);
});

test("valid cargo replaces its spatial pose and still obeys carrier ownership and capacity", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    definitions: [
      ...initial.definitions,
      {
        id: "unit:snapshot/carrier",
        role: "transport",
        health: 100,
        speed: 100,
        turnRate: 65536,
        domain: "wheeled",
        radiusSubcells: 128,
        transportSlots: 1,
      },
    ],
  };
  const kernel = createMatch(setup);
  const carrier = spawnEntity(kernel, 2, setup.definitions[2]!, {
    definition: "unit:snapshot/carrier",
    force: 0,
    x: 20 * 1024,
    y: 20 * 1024,
    facing: 0,
  });
  const passenger = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, Template, "definition") === 1 &&
        kernel.world.get(id, OwnerForce, "force") === 0,
    )!;
  kernel.world.remove(passenger, Transform);
  kernel.world.add(passenger, Cargo, { transport: carrier, x: 20 * 1024, y: 20 * 1024 });
  const saved = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(saved, setup))).toBe(saved.hash);
  kernel.world.set(passenger, OwnerForce, "force", 1);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "changed Force",
  );
  kernel.world.set(passenger, OwnerForce, "force", 0);
  const second = spawnEntity(kernel, 1, setup.definitions[1]!, {
    definition: setup.definitions[1]!.id,
    force: 0,
    x: 18 * 1024,
    y: 20 * 1024,
    facing: 0,
  });
  kernel.world.add(second, Boarding, { transport: carrier, seat: 1, plannedAt: 0 });
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "exceeds capacity",
  );
  kernel.world.remove(passenger, Cargo);
  kernel.world.add(passenger, Transform, { x: 16 * 1024, y: 20 * 1024 });
  kernel.world.add(passenger, Boarding, { transport: carrier, seat: 1, plannedAt: 0 });
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "exceeds capacity",
  );
  kernel.world.remove(second, Boarding);
  step(kernel, []);
  const reserved = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(reserved, setup))).toBe(reserved.hash);
});

test("expired-grant queued refusal is valid while future reason codes are rejected", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    grants: initial.grants.map((grant) =>
      grant.seat === 1 ? { ...grant, expiresAtTick: 2 } : grant,
    ),
  };
  const kernel = createMatch(setup);
  const actor = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, Template, "definition") === 1 &&
        kernel.world.get(id, OwnerForce, "force") === 0,
    )!;
  step(kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: {
        entities: [actor],
        x: kernel.world.get(actor, Transform, "x") + 2048,
        y: kernel.world.get(actor, Transform, "y"),
      },
    },
    { tick: 0, seat: 1, sequence: 1, type: "unit.stop", payload: { entities: [actor], append: 1 } },
  ]);
  expect(kernel.log.filter((entry) => entry.result === "accepted")).toHaveLength(2);
  while (kernel.tick < 22) step(kernel, []);
  const row = kernel.world.query(QueuedOrder)[0]!;
  expect(kernel.world.get(row, QueuedOrder, "reason")).toBe(ORDER_REFUSALS.indexOf("no_grant") + 1);
  const saved = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(saved, setup))).toBe(saved.hash);
  kernel.world.set(row, QueuedOrder, "reason", ORDER_REFUSALS.length + 1);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow("reason");
});

test("movement intents require bounded goals and the owner's saved route", () => {
  const { setup, kernel } = fixture();
  step(kernel, []);
  const actor = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
  kernel.world.add(actor, MoveIntent, { x: -0x80000000, y: 0x7fffffff });
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "outside the map",
  );
  kernel.world.set(actor, MoveIntent, "x", 20 * 1024);
  kernel.world.set(actor, MoveIntent, "y", 20 * 1024);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "no saved route",
  );
});

test("a real repair order retains both its builder work and target's prepaid credit ledger", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    grants: initial.grants.map((grant) => ({
      ...grant,
      scopes: [...grant.scopes, "economy.build"],
    })),
    definitions: [
      { ...initial.definitions[0]!, construction: { cost: { credits: 100 }, buildTicks: 1 } },
      {
        ...initial.definitions[1]!,
        repair: {
          targets: { structures: true, families: [], roles: [], tags: [] },
          rateMilliHealthPerSecond: 10000,
          rangeSubcells: 0,
          costPerMille: 250,
        },
      },
    ],
  };
  const kernel = createMatch(setup);
  const actor = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, Template, "definition") === 1 &&
        kernel.world.get(id, OwnerForce, "force") === 0,
    )!;
  const headquarters = kernel.world
    .query(KitStructure, OwnerForce)
    .find((id) => kernel.world.get(id, OwnerForce, "force") === 0)!;
  kernel.world.set(headquarters, Health, "current", 90);
  step(kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "economy.repair",
      payload: { builders: [actor], entity: headquarters },
    },
  ]);
  expect(kernel.log[0]?.result).toBe("accepted");
  expect(kernel.world.has(actor, RepairOrder)).toBe(true);
  const good = createMatchSnapshot(kernel, setup);
  const restored = restoreCanonicalState(good, setup);
  for (let i = 0; i < 20; i++) {
    step(kernel, []);
    step(restored, []);
    expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
  }
  for (const [id, component] of [
    [actor, RepairWork],
    [headquarters, RepairCredit],
  ] as const) {
    const candidate = restoreCanonicalState(good, setup);
    candidate.world.remove(id, component);
    expect(() => restoreCanonicalState(createMatchSnapshot(candidate, setup), setup)).toThrow(
      "Invalid canonical state",
    );
  }
  const distant = restoreCanonicalState(good, setup);
  distant.movement?.cancel(actor);
  if (distant.world.has(actor, MoveIntent)) distant.world.remove(actor, MoveIntent);
  distant.world.set(actor, ConstructionApproach, "next", 1);
  distant.world.set(actor, ConstructionApproach, "state", 1);
  distant.world.set(actor, ConstructionApproach, "x", 30 * 1024 + 512);
  distant.world.set(actor, ConstructionApproach, "y", 30 * 1024 + 512);
  expect(() => restoreCanonicalState(createMatchSnapshot(distant, setup), setup)).toThrow(
    "work point",
  );
  const conflicting = restoreCanonicalState(good, setup);
  conflicting.world.remove(actor, ConstructionApproach);
  conflicting.world.add(actor, BuilderConstruction, { target: headquarters });
  expect(() => restoreCanonicalState(createMatchSnapshot(conflicting, setup), setup)).toThrow(
    "conflicting work orders",
  );
});

test("harvester targets and retry timers remain bounded after actual owner initialization", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    definitions: [
      ...initial.definitions,
      {
        id: "unit:snapshot/truck",
        role: "harvester",
        health: 100,
        speed: 100,
        turnRate: 65536,
        domain: "wheeled",
        radiusSubcells: 128,
        harvestCapacity: 500,
        harvestAmountPerSecond: 5,
      },
    ],
  };
  const kernel = createMatch(setup);
  const truck = spawnEntity(kernel, 2, setup.definitions[2]!, {
    definition: setup.definitions[2]!.id,
    force: 0,
    x: 20 * 1024,
    y: 20 * 1024,
    facing: 0,
  });
  step(kernel, []);
  const good = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(good, setup))).toBe(good.hash);
  for (const field of ["retryAt", "avoidUntil", "arrivalTick", "x", "y"] as const) {
    const candidate = restoreCanonicalState(good, setup);
    candidate.world.set(
      truck,
      Harvester,
      field,
      field === "x" || field === "y" ? -0x80000000 : 0xffffffff,
    );
    expect(() => restoreCanonicalState(createMatchSnapshot(candidate, setup), setup)).toThrow(
      "destination or deadline",
    );
  }
});

test("owner-created combat timers restore but cannot exceed authored rates and deadlines", () => {
  const initial = fixture().setup;
  const warheads = [
    { type: "burn", amountPerSecond: 1, durationTicks: 20, tags: [] },
    { type: "slow", perMille: 500, durationTicks: 20, tags: [] },
    { type: "disable", durationTicks: 20, tags: [] },
  ];
  const setup: MatchSetup = {
    ...initial,
    definitions: [
      initial.definitions[0]!,
      {
        ...initial.definitions[1]!,
        armor: "infantry",
        weapons: [
          {
            id: "effects",
            targets: ["ground"],
            rangeSubcells: [0, 50 * 1024],
            reloadTicks: 3,
            projectile: { kind: "instant" },
            warheads,
          },
        ],
      },
    ],
  };
  const kernel = createMatch(setup);
  step(kernel, []);
  const actor = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
  const headquarters = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 0)!;
  applyBurn(kernel, actor, setup.definitions[1]!, warheads[0]!, 1000, 0, 0);
  applySlow(kernel, actor, setup.definitions[1]!, warheads[1]!, 1000);
  applyDisable(kernel, headquarters, setup.definitions[0]!, warheads[2]!, 1000);
  const clock = kernel.world
    .query(WeaponState)
    .find((id) => kernel.world.get(id, WeaponState, "shooter") === actor)!;
  kernel.world.set(clock, WeaponState, "reloadAt", kernel.tick + 3);
  kernel.world.set(clock, WeaponState, "nextShot", kernel.tick);
  const good = createMatchSnapshot(kernel, setup);
  const restored = restoreCanonicalState(good, setup);
  expect(checkpointHash(restored)).toBe(good.hash);
  for (let i = 0; i < 22; i++) {
    step(kernel, []);
    step(restored, []);
    expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
  }
  const corruptions: readonly [number, Component, string][] = [
    [actor, Burning, "whole"],
    [actor, Burning, "until"],
    [actor, Slowed, "until"],
    [headquarters, Disabled, "until"],
    [clock, WeaponState, "reloadAt"],
    [clock, WeaponState, "nextShot"],
  ];
  for (const [id, component, field] of corruptions) {
    const candidate = restoreCanonicalState(good, setup);
    candidate.world.set(id, component, field, 0xffffffff);
    expect(() => restoreCanonicalState(createMatchSnapshot(candidate, setup), setup)).toThrow(
      "Invalid canonical state",
    );
  }
});

test("required power and extraction attachments cannot disappear from otherwise valid actors", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    grants: initial.grants.map((grant) => ({
      ...grant,
      scopes: [...grant.scopes, "economy.build"],
    })),
    map: {
      ...initial.map,
      resources: [{ kind: "materials", position: [24 * 1024, 24 * 1024], amount: 100 }],
    },
    definitions: [
      { ...initial.definitions[0]!, power: 100 },
      initial.definitions[1]!,
      {
        id: "structure:snapshot/extractor",
        role: "extractor",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [2, 2],
        nodeKinds: ["materials"],
        power: 0,
        construction: { cost: { credits: 10 }, buildTicks: 1 },
        extraction: { materials: { resource: "materials", amountPerSecond: 1 } },
      },
    ],
  };
  const kernel = createMatch(setup);
  const headquarters = kernel.world.query(StructurePower)[0]!;
  kernel.world.remove(headquarters, StructurePower);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "lost its power attachment",
  );
  const other = createMatch(setup),
    origin = resourceNodeOrigin(setup.map.resources![0]!);
  const extractor = spawnEntity(other, 2, setup.definitions[2]!, {
    definition: setup.definitions[2]!.id,
    force: 0,
    x: origin.x * 1024,
    y: origin.y * 1024,
    facing: 16384,
  });
  expect(other.economy?.spend(1, 0, { credits: 10 }, "economy.build").ok).toBe(true);
  other.world.add(extractor, ConstructionPayment, { credits: 10 });
  step(other, []);
  const good = createMatchSnapshot(other, setup);
  expect(checkpointHash(restoreCanonicalState(good, setup))).toBe(good.hash);
  other.world.remove(extractor, Extraction);
  expect(() => restoreCanonicalState(createMatchSnapshot(other, setup), setup)).toThrow(
    "lost its extraction attachment",
  );
});

test("deployment cooldowns remain authored, including after a real accepted deployment", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    grants: initial.grants.map((grant) => ({
      ...grant,
      scopes: [...grant.scopes, "unit.abilities"],
    })),
    definitions: [
      initial.definitions[0]!,
      {
        ...initial.definitions[1]!,
        deployMode: {
          id: "deploy",
          cooldownTicks: 3,
          damagePerMille: 1000,
          armorPerMille: 1000,
          rangePerMille: 1000,
          rangeBonusSubcells: 0,
          cost: {},
        },
      },
    ],
  };
  const kernel = createMatch(setup),
    actor = kernel.world
      .query(Template)
      .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
  step(kernel, [
    { tick: 0, seat: 1, sequence: 0, type: "unit.deploy", payload: { entities: [actor] } },
  ]);
  expect(kernel.log[0]?.result).toBe("accepted");
  const good = createMatchSnapshot(kernel, setup);
  const restored = restoreCanonicalState(good, setup);
  for (let i = 0; i < 10; i++) {
    step(kernel, []);
    step(restored, []);
    expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
  }
  kernel.world.set(actor, UnitMode, "readyAt", 0xffffffff);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "deployment cooldown",
  );
});

test("canonical component coverage and exclusive row kinds reject omitted validators and aliased metadata", () => {
  const unknown = fixture();
  unknown.kernel.world.register(defineComponent("FutureFeature", {}));
  expect(() => prepareCanonicalValidation(unknown.kernel, unknown.setup)()).toThrow(
    "FutureFeature has no canonical validator",
  );
  const empty = fixture();
  empty.kernel.world.create();
  expect(() =>
    restoreCanonicalState(createMatchSnapshot(empty.kernel, empty.setup), empty.setup),
  ).toThrow("unclassified");
  const mixed = fixture(),
    row = mixed.kernel.world.query(ForceBank)[0]!;
  mixed.kernel.world.add(row, Remains, { definition: 0, force: 0, kind: 1 });
  mixed.kernel.world.add(row, Transform, { x: 20 * 1024, y: 20 * 1024 });
  expect(() =>
    restoreCanonicalState(createMatchSnapshot(mixed.kernel, mixed.setup), mixed.setup),
  ).toThrow("conflicting canonical row kinds");
});

test("statistics reject duplicate type keys and invalid sampling cadence independently of hashes", () => {
  const duplicate = fixture();
  for (let i = 0; i < 2; i++)
    duplicate.kernel.world.add(duplicate.kernel.world.create(), TypeStatistics, {
      force: 0,
      definition: 0,
    });
  expect(() =>
    restoreCanonicalState(createMatchSnapshot(duplicate.kernel, duplicate.setup), duplicate.setup),
  ).toThrow("type statistics");
  const cadence = fixture();
  cadence.kernel.world.set(
    cadence.kernel.world.query(StatisticsSeries)[0]!,
    StatisticsSeries,
    "interval",
    0,
  );
  expect(() =>
    restoreCanonicalState(createMatchSnapshot(cadence.kernel, cadence.setup), cadence.setup),
  ).toThrow("invalid interval");
});

test("ready-to-fire attack state restores rather than being mistaken for a boolean flag", () => {
  const initial = fixture().setup;
  const setup: MatchSetup = {
    ...initial,
    definitions: [
      initial.definitions[0]!,
      {
        ...initial.definitions[1]!,
        armor: "infantry",
        visionSubcells: 40 * 1024,
        weapons: [
          {
            id: "rifle",
            targets: ["ground"],
            rangeSubcells: [0, 50 * 1024],
            reloadTicks: 1000,
            projectile: { kind: "instant" },
            warheads: [{ type: "damage", amount: 1, tags: [] }],
          },
        ],
      },
    ],
  };
  const kernel = createMatch(setup);
  const actor = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, Template, "definition") === 1 &&
        kernel.world.get(id, OwnerForce, "force") === 0,
    )!;
  const target = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, Template, "definition") === 0 &&
        kernel.world.get(id, OwnerForce, "force") === 1,
    )!;
  step(kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.attack",
      payload: { entities: [actor], entity: target },
    },
  ]);
  expect(kernel.log[0]?.result).toBe("accepted");
  expect(kernel.world.get(actor, AttackOrder, "planned")).toBe(2);
  const saved = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(saved, setup))).toBe(saved.hash);
  kernel.world.set(actor, AttackOrder, "planned", 3);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "attack order",
  );
});

test("initialization markers belong only to surviving installed kit entities", () => {
  const missing = fixture(),
    headquarters = missing.kernel.world.query(KitStructure)[0]!;
  missing.kernel.world.remove(headquarters, KitStructure);
  expect(() =>
    restoreCanonicalState(createMatchSnapshot(missing.kernel, missing.setup), missing.setup),
  ).toThrow("lost its initialization marker");
  const forged = fixture();
  const actor = spawnEntity(forged.kernel, 0, forged.setup.definitions[0]!, {
    definition: forged.setup.definitions[0]!.id,
    force: 0,
    x: 20 * 1024,
    y: 20 * 1024,
    facing: 16384,
  });
  forged.kernel.world.add(actor, KitStructure);
  expect(() =>
    restoreCanonicalState(createMatchSnapshot(forged.kernel, forged.setup), forged.setup),
  ).toThrow("forged an initialization marker");
});

test("terminal survivor sets cannot be resumed as a running match", () => {
  const { setup, kernel } = fixture();
  step(kernel, [{ tick: 0, seat: 1, sequence: 0, type: "match.surrender", payload: { force: 0 } }]);
  expect(kernel.victory?.ended).toBe(true);
  const good = createMatchSnapshot(kernel, setup);
  expect(checkpointHash(restoreCanonicalState(good, setup))).toBe(good.hash);
  const result = kernel.world.query(MatchOutcome)[0]!;
  kernel.world.set(result, MatchOutcome, "ended", 0);
  kernel.world.set(result, MatchOutcome, "winner", 0xffffffff);
  kernel.world.set(result, MatchOutcome, "tick", 0);
  expect(() => restoreCanonicalState(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "survivor set",
  );
});
