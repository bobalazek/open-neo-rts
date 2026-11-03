import { expect, test } from "bun:test";
import { initialSkirmishMemory } from "@open-neo-rts/ai";
import { nextU32 } from "@open-neo-rts/deterministic";
import type { ControllerCommand } from "../../kernel";
import { checkpointHash, registerController, step } from "../../kernel";
import { createMatch, type MatchSetup, SIM_VERSION } from "../../match";
import { createProjection } from "../../projection";
import { parseScenario, runScenario, SCENARIO_FORMAT } from "../../snapshots";
import { flatMap } from "../../testing/maps";
import { AttackOrder } from "../combat";
import { OwnerForce, Template } from "../entities";
import { ProductionItem } from "../production";
import { BOT_WORK_BUDGET, type BotSeatState, registerBotSeat, type SeatBotProgram } from "./bots";

function botSetup(idle = false): MatchSetup {
  const map = flatMap(32);
  return {
    seed: 17,
    debug: false,
    map: {
      ...map,
      spawns: [
        { id: "west", position: [8 * 1024, 8 * 1024], facing: 0x4000 },
        { id: "east", position: [24 * 1024, 24 * 1024], facing: 0x4000 },
      ],
    },
    forces: [1, 2].map((index) => ({ index, faction: "faction:test" })),
    seats: [1, 2, 3],
    grants: [
      { seat: 1, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
      { seat: 2, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 },
    ],
    definitions: [
      {
        id: "structure:test/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:test/builder",
        role: "builder",
        health: 10,
        speed: 1024,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150 },
      ...(idle && { bots: [{ seat: 1, kind: "idle" }] }),
      forces: [1, 2].map((index) => ({
        index,
        team: index,
        spawn: index === 1 ? "west" : "east",
        start: {
          structures: ["structure:test/headquarters"],
          units: [{ unit: "unit:test/builder", count: 3, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
}

/** Test policy only: counted scans of permitted candidates, then a saved stop decision next tick. */
const fixtureProgram: SeatBotProgram = ({ observation, state, random, work }) => {
  expect(observation.entities.every((entity) => entity.force === 1)).toBe(true);
  expect("world" in observation || "hash" in observation || "map" in observation).toBe(false);
  if (state.pending.length && work.take())
    return { state: { cursor: 0, target: null, pending: [] }, commands: state.pending };
  let cursor = state.cursor;
  while (cursor < observation.entities.length && work.take()) {
    const entity = observation.entities[cursor++];
    if (entity?.definition.includes("unit:")) {
      nextU32(random);
      const command: ControllerCommand = {
        type: "unit.stop",
        payload: { entities: [entity.handle] },
      };
      return { state: { cursor, target: entity.handle, pending: [command] }, commands: [] };
    }
  }
  return {
    state: { cursor: cursor < observation.entities.length ? cursor : 0, target: null, pending: [] },
    commands: [],
  };
};
function fixture() {
  const setup = botSetup(),
    kernel = createMatch(setup);
  const host = registerBotSeat(
    kernel,
    setup,
    { seat: 1, program: "fixture-stop", budget: 2 },
    fixtureProgram,
  );
  return { setup, kernel, host };
}

test("normal bot settings validate/copy unique granted seats, start passive hosts, and replay deterministically", () => {
  const setup = botSetup(true),
    kernel = createMatch(setup);
  expect(kernel.bots?.hasSeat(1)).toBe(true);
  expect(() => registerController(kernel, 1, () => [])).toThrow();
  step(kernel, []);
  expect(kernel.bots?.serialize().bots[0]).toMatchObject({
    seat: 1,
    budget: BOT_WORK_BUDGET,
    used: 1,
    state: { cursor: 0, pending: [] },
  });
  expect(kernel.queued).toEqual([]);
  expect([...kernel.streams.keys()]).toContain("ai:1");
  const normal = setup.normal;
  if (!normal) throw new Error("Missing normal fixture");
  for (const bots of [
    [{ seat: 0, kind: "idle" }],
    [{ seat: 99, kind: "idle" }],
    [{ seat: 3, kind: "idle" }],
    [{ seat: 1, kind: "unknown" }],
    [
      { seat: 1, kind: "idle" },
      { seat: 1, kind: "idle" },
    ],
  ])
    expect(() =>
      parseScenario({
        format: SCENARIO_FORMAT,
        simVersion: SIM_VERSION,
        setup: { ...setup, normal: { ...normal, bots } },
        commands: [],
      }),
    ).toThrow();
  const scenario = parseScenario({
    format: SCENARIO_FORMAT,
    simVersion: SIM_VERSION,
    setup,
    commands: [],
  });
  expect(runScenario(scenario, { ticks: 5 })).toEqual(runScenario(scenario, { ticks: 5 }));
  const first = kernel.world
    .query(Template, OwnerForce)
    .find((id) => kernel.world.get(id, OwnerForce, "force") === 1) as number;
  expect(
    step(kernel, [
      { tick: 1, seat: 1, sequence: 0, type: "unit.stop", payload: { entities: [first] } },
    ])[0]?.result,
  ).toBe("no_grant");
});

test("counted scanning saves target/cursor/pending state and only granted next-tick decisions execute", () => {
  const { kernel, host, setup } = fixture();
  expect(() =>
    registerBotSeat(kernel, setup, { seat: 1, program: "other" }, fixtureProgram),
  ).toThrow("duplicate");
  step(kernel, []);
  expect(host.serialize().bots[0]).toMatchObject({ used: 2, state: { cursor: 2 } });
  expect(host.serialize().bots[0]?.state.target).toMatch(/^e/);
  expect(host.serialize().bots[0]?.state.pending).toHaveLength(1);
  expect(kernel.queued).toEqual([]);
  step(kernel, []);
  expect(kernel.queued).toHaveLength(1);
  expect(kernel.queued[0]).toMatchObject({ tick: 2, seat: 1, type: "unit.stop" });
  step(kernel, []);
  expect(
    kernel.log
      .filter((entry) => entry.source === "controller")
      .map((entry) => [entry.tick, entry.result]),
  ).toEqual([[2, "accepted"]]);
});

test("bot projection allocator history is canonical and restores pending opaque targets, queues and stream without human polling effects", () => {
  const a = fixture(),
    b = fixture();
  step(a.kernel, []);
  step(b.kernel, []);
  const saved = a.host.serialize(),
    hash = checkpointHash(a.kernel);
  const human = createProjection(a.setup, 1, "controlled");
  for (let i = 0; i < 5; i++) human.snapshot(a.kernel);
  expect(checkpointHash(a.kernel)).toBe(hash);
  const projection = a.kernel.observationProjections?.get(1);
  if (!projection) throw new Error("Missing bot projection");
  const mapping = projection.serialize();
  projection.load(
    {
      ...mapping,
      nextHandle: mapping.nextHandle + 50,
      handles: mapping.handles.map(([id, handle]) => [id, Number(handle) + 50]),
    },
    a.kernel,
  );
  a.kernel.captureObservations?.();
  expect(checkpointHash(a.kernel)).not.toBe(hash);
  a.host.load(saved);
  expect(checkpointHash(a.kernel)).toBe(hash);
  expect(a.kernel.observe?.(1)).toEqual(b.kernel.observe?.(1));
  step(a.kernel, []);
  step(b.kernel, []);
  const queued = a.host.serialize();
  a.kernel.queued = [];
  a.host.load(queued);
  expect(a.kernel.queued).toEqual(b.kernel.queued);
  for (let i = 0; i < 5; i++) {
    step(a.kernel, []);
    step(b.kernel, []);
  }
  expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  expect(a.kernel.log).toEqual(b.kernel.log);
});

test("a one-unit budget resumes its cursor across ticks instead of restarting candidate evaluation", () => {
  const setup = botSetup(),
    kernel = createMatch(setup);
  const host = registerBotSeat(
    kernel,
    setup,
    { seat: 1, program: "fixture-stop", budget: 1 },
    fixtureProgram,
  );
  step(kernel, []);
  expect(host.serialize().bots[0]?.state).toMatchObject({ cursor: 1, pending: [] });
  step(kernel, []);
  expect(host.serialize().bots[0]?.state.cursor).toBe(2);
  expect(host.serialize().bots[0]?.state.pending).toHaveLength(1);
  step(kernel, []);
  expect(kernel.queued[0]).toMatchObject({ tick: 3, seat: 1 });
  step(kernel, []);
  expect(
    kernel.log.filter((entry) => entry.source === "controller").map((entry) => entry.result),
  ).toEqual(["accepted"]);
});

test("malformed bot restores are rejected atomically before replacing decisions, mapping, queue or stream", () => {
  const { kernel, host } = fixture();
  step(kernel, []);
  const saved = host.serialize(),
    hash = checkpointHash(kernel);
  const changes: ((value: BotSeatState) => void)[] = [
    (value) => {
      value.used = 3;
    },
    (value) => {
      value.program = "other";
    },
    (value) => {
      value.state.cursor = 0.5;
    },
    (value) => {
      value.random.a = 0.5;
    },
    (value) => {
      value.state.pending = [{ type: "unit.stop", payload: { entities: [1] } }];
    },
    (value) => {
      value.projection.handles.push(value.projection.handles[0] as number[]);
    },
  ];
  for (const change of changes) {
    const bad = structuredClone(saved);
    const first = bad.bots[0];
    if (!first) throw new Error("Missing saved bot");
    change(first);
    expect(() => host.load(bad)).toThrow();
    expect(checkpointHash(kernel)).toBe(hash);
    expect(host.serialize()).toEqual(saved);
  }
  expect(() =>
    host.load({
      ...saved,
      queued: [
        { tick: kernel.tick, seat: 2, sequence: 0, type: "unit.stop", payload: { entities: [1] } },
      ],
    }),
  ).toThrow();
  expect(checkpointHash(kernel)).toBe(hash);
});

test("remembered base-search state is canonical and malformed restores are atomic", () => {
  const { kernel, host } = fixture();
  step(kernel, []);
  const saved = host.serialize();
  const first = saved.bots[0]!;
  // Synthetic restore values exercise strict memory bounds, not hidden-knowledge acquisition.
  first.state.memory = {
    ...initialSkirmishMemory(),
    enemyBase: { x: 24 * 1024 + 512, y: 24 * 1024 + 512, radius: 6 * 1024 + 512 },
    baseScout: 4,
  };
  host.load(saved);
  expect(host.serialize()).toEqual(saved);
  const hash = checkpointHash(kernel);
  expect(hash).toBe("473a32529ede8f18");
  for (const change of [
    (memory: NonNullable<typeof first.state.memory>) => {
      memory.baseScout = 9;
    },
    (memory: NonNullable<typeof first.state.memory>) => {
      memory.baseScout = -1;
    },
    (memory: NonNullable<typeof first.state.memory>) => {
      memory.enemyBase!.radius = 0.5;
    },
    (memory: NonNullable<typeof first.state.memory>) => {
      memory.enemyBase!.x = 1 << 19;
    },
  ]) {
    const bad = structuredClone(saved);
    change(bad.bots[0]!.state.memory!);
    expect(() => host.load(bad)).toThrow();
    expect(checkpointHash(kernel)).toBe(hash);
    expect(host.serialize()).toEqual(saved);
  }
});

test("expired grants pause work, and a decision that expires before execution is never queued", () => {
  const setup = botSetup();
  setup.grants = setup.grants.map((grant) =>
    grant.seat === 1 ? { ...grant, expiresAtTick: 2 } : grant,
  );
  const kernel = createMatch(setup);
  const host = registerBotSeat(
    kernel,
    setup,
    { seat: 1, program: "fixture-stop", budget: 2 },
    fixtureProgram,
  );
  step(kernel, []);
  step(kernel, []);
  expect(kernel.queued).toEqual([]);
  step(kernel, []);
  expect(host.serialize().bots[0]?.used).toBe(0);
  expect(kernel.log.filter((entry) => entry.source === "controller")).toEqual([]);
  const saved = host.serialize();
  saved.queued = [
    { tick: kernel.tick, seat: 1, sequence: 0, type: "unit.stop", payload: { entities: [3] } },
  ];
  expect(() => host.load(saved)).toThrow("grant");
});

test("seat order is stable regardless of registration order", () => {
  const setup = botSetup(),
    a = createMatch(setup),
    b = createMatch(setup);
  const policy: SeatBotProgram = ({ state, work, observation }) => {
    work.take();
    const entity = observation.entities.find((entity) => entity.definition.includes("unit:"));
    return {
      state,
      commands: entity ? [{ type: "unit.stop", payload: { entities: [entity.handle] } }] : [],
    };
  };
  for (const seat of [2, 1]) registerBotSeat(a, setup, { seat, program: "fixture-order" }, policy);
  for (const seat of [1, 2]) registerBotSeat(b, setup, { seat, program: "fixture-order" }, policy);
  step(a, []);
  step(b, []);
  expect(a.queued).toEqual(b.queued);
  expect(a.queued.map((entry) => (entry as { seat: number }).seat)).toEqual([1, 2]);
  expect(checkpointHash(a)).toBe(checkpointHash(b));
});

test("shared sight never authorizes commands to another Force, and malformed policy results do not change host state", () => {
  const setup = botSetup(),
    normal = setup.normal;
  if (!normal) throw new Error("Missing normal setup");
  setup.normal = { ...normal, forces: normal.forces.map((force) => ({ ...force, team: 1 })) };
  const kernel = createMatch(setup);
  registerBotSeat(
    kernel,
    setup,
    { seat: 1, program: "fixture-foreign" },
    ({ state, work, observation }) => {
      work.take();
      const foreign = observation.entities.find((entity) => entity.force === 2);
      expect(foreign).toBeDefined();
      return {
        state,
        commands: [{ type: "unit.stop", payload: { entities: [foreign?.handle as string] } }],
      };
    },
  );
  step(kernel, []);
  expect(kernel.queued).toEqual([]);
  const other = createMatch(botSetup());
  const host = registerBotSeat(
    other,
    botSetup(),
    { seat: 1, program: "fixture-invalid" },
    ({ state, random }) => {
      nextU32(random);
      return { state: { ...state, cursor: 0.5 }, commands: [] };
    },
  );
  const saved = host.serialize();
  expect(() => step(other, [])).toThrow("decision state");
  expect(host.serialize()).toEqual(saved);
});

test("a bot can order an opaque visible enemy target without control grants on the enemy Force", () => {
  const setup = botSetup();
  setup.definitions = setup.definitions.map((definition) =>
    definition.role === "builder"
      ? {
          ...definition,
          armor: "infantry",
          visionSubcells: 32 * 1024,
          weapons: [
            {
              id: "fixture-gun",
              targets: ["ground"],
              rangeSubcells: [0, 32 * 1024],
              reloadTicks: 1,
              projectile: { kind: "instant" },
              warheads: [{ type: "damage", amount: 1, tags: [] }],
            },
          ],
        }
      : definition,
  );
  const kernel = createMatch(setup);
  registerBotSeat(
    kernel,
    setup,
    { seat: 1, program: "fixture-attack" },
    ({ observation, state, work }) => {
      if (state.cursor || !work.take()) return { state, commands: [] };
      const actor = observation.entities.find(
        (entity) => entity.force === 1 && entity.definition.startsWith("unit:"),
      );
      const enemy = observation.entities.find(
        (entity) => entity.force === 2 && entity.definition.startsWith("unit:"),
      );
      expect(actor?.handle).toMatch(/^e[1-9][0-9]*$/);
      expect(enemy?.handle).toMatch(/^e[1-9][0-9]*$/);
      return {
        state: { ...state, cursor: 1 },
        commands: [
          {
            type: "unit.attack",
            payload: { entities: [actor?.handle as string], entity: enemy?.handle as string },
          },
        ],
      };
    },
  );
  step(kernel, []);
  expect(kernel.queued).toHaveLength(1);
  const command = kernel.queued[0] as {
    type: string;
    payload: { entities: number[]; entity: number };
  };
  expect(command.type).toBe("unit.attack");
  const actor = command.payload.entities[0] as number,
    enemy = command.payload.entity;
  expect(kernel.world.get(actor, OwnerForce, "force")).toBe(1);
  expect(kernel.world.get(enemy, OwnerForce, "force")).toBe(2);
  expect(kernel.visibility?.permits(1, 2, "unit.orders")).toBe(false);
  expect(step(kernel, [])[0]?.result).toBe("accepted");
  expect(kernel.world.get(actor, AttackOrder, "target")).toBe(enemy);
  expect(
    kernel.combatEvents?.some((event) => event.type === "launch" && event.entity === actor),
  ).toBe(true);
});

test("queued bot cancellation survives item completion later in the same tick and restores twin continuation", () => {
  const setup = botSetup();
  setup.grants = setup.grants.map((grant) => ({
    ...grant,
    scopes: [...grant.scopes, "production.queue"],
  }));
  setup.definitions = setup.definitions.map((definition) =>
    definition.role === "headquarters"
      ? {
          ...definition,
          power: 20,
          productionSlots: 1,
          produces: ["unit:test/builder"],
          exits: [{ side: "south", cell: [0, 0] }],
        }
      : { ...definition, pop: 1, construction: { cost: { credits: 1 }, buildTicks: 2 } },
  );
  const policy: SeatBotProgram = ({ observation, state, work }) => {
    if (state.cursor === 2 || !work.take()) return { state, commands: [] };
    const producer = observation.entities.find((entity) => entity.force === 1 && entity.production);
    if (state.cursor === 0)
      return {
        state: { ...state, cursor: 1 },
        commands: [
          {
            type: "production.enqueue",
            payload: { entity: producer?.handle as string, definition: "unit:test/builder" },
          },
        ],
      };
    const item = producer?.production?.queue[0];
    return item
      ? {
          state: { ...state, cursor: 2 },
          commands: [{ type: "production.cancel", payload: { item: item.handle } }],
        }
      : { state, commands: [] };
  };
  const make = () => {
    const kernel = createMatch(setup);
    const host = registerBotSeat(kernel, setup, { seat: 1, program: "fixture-cancel" }, policy);
    return { kernel, host };
  };
  const a = make(),
    b = make();
  for (let i = 0; i < 3; i++) {
    step(a.kernel, []);
    step(b.kernel, []);
  }
  const saved = a.host.serialize();
  expect(saved.queued).toHaveLength(1);
  const command = saved.queued[0];
  if (command?.type !== "production.cancel") throw new Error("Expected queued cancellation");
  expect(a.kernel.world.isAlive(command.payload.item)).toBe(false);
  expect(a.kernel.world.query(ProductionItem)).toEqual([]);
  const hash = checkpointHash(a.kernel);
  a.kernel.queued = [];
  a.host.load(saved);
  expect(a.host.serialize()).toEqual(saved);
  expect(checkpointHash(a.kernel)).toBe(hash);
  for (let i = 0; i < 3; i++) {
    const actual = step(a.kernel, []),
      twin = step(b.kernel, []);
    expect(actual).toEqual(twin);
    if (i === 0) expect(actual[0]?.result).toBe("bad_payload");
    expect(checkpointHash(a.kernel)).toBe(checkpointHash(b.kernel));
  }
  expect(a.kernel.log).toEqual(b.kernel.log);
});

test("restored canonical bot references still cannot control another Force at dispatch", () => {
  const { kernel, host } = fixture();
  const foreign = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, OwnerForce, "force") === 2 &&
        kernel.world.get(id, Template, "definition") === 1,
    ) as number;
  const saved = host.serialize();
  saved.queued = [
    {
      tick: kernel.tick,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [foreign], x: 1024, y: 1024 },
    },
  ];
  host.load(saved);
  expect(step(kernel, [])[0]?.result).toBe("no_grant");
});

test("bot host restore excludes cosmetic combat events from policy observations while human snapshots retain them", () => {
  const setup = botSetup(true);
  setup.definitions = setup.definitions.map((definition) =>
    definition.role === "builder"
      ? {
          ...definition,
          armor: "infantry",
          visionSubcells: 32 * 1024,
          weapons: [
            {
              id: "fixture-gun",
              targets: ["ground"],
              rangeSubcells: [0, 32 * 1024],
              reloadTicks: 1,
              projectile: { kind: "instant" },
              warheads: [{ type: "damage", amount: 1, tags: [] }],
            },
          ],
        }
      : definition,
  );
  const source = createMatch(setup),
    restored = createMatch(setup);
  step(source, []);
  step(restored, []);
  expect(source.combatEvents?.length).toBeGreaterThan(0);
  const saved = source.bots?.serialize();
  // Restoring canonical bot state does not restore transient presentation events or pN allocators.
  restored.combatEvents = undefined;
  restored.bots?.load(saved);
  expect(checkpointHash(restored)).toBe(checkpointHash(source));
  expect(Object.hasOwn(source.observe?.(1) ?? {}, "combatEvents")).toBe(false);
  expect(restored.observe?.(1)).toEqual(source.observe?.(1));
  expect(
    createProjection(setup, 1, "controlled").snapshot(source).combatEvents?.length,
  ).toBeGreaterThan(0);
  for (let tick = 0; tick < 3; tick++) {
    step(source, []);
    step(restored, []);
    expect(restored.observe?.(1)).toEqual(source.observe?.(1));
    expect(checkpointHash(restored)).toBe(checkpointHash(source));
  }
});
