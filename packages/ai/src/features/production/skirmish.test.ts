import { expect, test } from "bun:test";
import { createStream } from "@open-neo-rts/deterministic";
import { type DecisionState, runDecision } from "../..";
import type {
  PolicyCommand,
  PolicyEntity,
  PolicyObservation,
  SkirmishMemory,
  SkirmishPolicy,
} from "../economy";
import { basicSkirmishProgram, initialSkirmishMemory } from ".";

const policy: SkirmishPolicy = {
  force: 1,
  allies: [1, 2],
  buildOrder: ["reactor", "depot", "barracks", "factory"],
  builder: "builder",
  truck: "truck",
  soldier: "soldier",
  tank: "tank",
  extractor: "extractor",
  definitions: [
    { id: "hq", role: "headquarters", footprint: [1, 1], produces: ["builder"] },
    {
      id: "builder",
      role: "builder",
      builds: ["reactor"],
      construction: { cost: { credits: 10 }, buildTicks: 1 },
    },
    {
      id: "reactor",
      role: "power",
      footprint: [1, 1],
      construction: { cost: { credits: 10 }, buildTicks: 1 },
    },
    {
      id: "soldier",
      role: "combat",
      domain: "foot",
      weapons: [{ targets: ["ground"], rangeSubcells: [0, 5 * 1024] }],
    },
  ],
};
const entity = (handle: string, definition: string, force = 1, x = 5 * 1024): PolicyEntity => ({
  handle,
  definition,
  force,
  x,
  y: 5 * 1024,
  facing: 0x4000,
  health: 100,
  maxHealth: 100,
  order: null,
});
const observation = (entities: PolicyEntity[]): PolicyObservation => ({
  tick: 0,
  entities,
  banks: [{ force: 1, resources: { credits: 100 } }],
  fog: [{ width: 16, height: 16, cells: new Uint8Array(256).fill(2) }],
  ghosts: [],
});
const state = (): DecisionState<PolicyCommand, SkirmishMemory> => ({
  cursor: 0,
  target: null,
  pending: [],
});
test("a one-work-unit policy resumes candidate/placement stages and emits a real builder command", () => {
  const decide = basicSkirmishProgram(policy);
  const view = observation([entity("e1", "hq"), entity("e2", "builder", 1, 7 * 1024)]);
  let saved = state(),
    random = createStream(7, "ai:1");
  let build: PolicyCommand | undefined;
  let resumed = false;
  for (let tick = 0; tick < 400 && !build; tick++) {
    const result = runDecision(decide, { ...view, tick }, saved, random, 1);
    expect(result.used).toBeLessThanOrEqual(1);
    resumed ||= result.state.cursor > 0;
    saved = result.state;
    random = result.random;
    build = result.commands.find((command) => command.type === "economy.build");
  }
  expect(resumed).toBe(true);
  expect(build).toMatchObject({
    type: "economy.build",
    payload: { force: 1, builders: ["e2"], definition: "reactor" },
  });
});
test("current hostile opaque targets attack while allied targets are excluded and damaged troops retreat", () => {
  const decide = basicSkirmishProgram(policy),
    random = createStream(9, "ai:1");
  const entities = [
    entity("e1", "hq"),
    entity("e2", "soldier"),
    entity("e3", "soldier", 2, 6 * 1024),
    entity("e4", "soldier", 3, 7 * 1024),
  ];
  const healthy = runDecision(decide, observation(entities), state(), random, 64);
  expect(healthy.commands).toContainEqual({
    type: "unit.attack",
    payload: { entities: ["e2"], entity: "e4" },
  });
  const damaged = runDecision(
    decide,
    observation(entities.map((row) => (row.handle === "e2" ? { ...row, health: 20 } : row))),
    state(),
    random,
    64,
  );
  expect(damaged.commands.some((command) => command.type === "unit.move")).toBe(true);
  expect(damaged.commands.some((command) => command.type === "unit.attack")).toBe(false);
});
test("structure range uses its rotated footprint centre with inclusive minimum and maximum boundaries", () => {
  const cases: {
    name: string;
    footprint: [number, number];
    facing: number;
    x: number;
    y: number;
    min: number;
    type: "unit.attack" | "unit.attackMove";
    stale?: boolean;
  }[] = [
    {
      name: "square origin is close but centre is outside",
      footprint: [3, 3],
      facing: 0x4000,
      x: 10 * 1024 + 512,
      y: 10 * 1024 + 512,
      min: 0,
      type: "unit.attackMove",
    },
    {
      name: "square maximum boundary",
      footprint: [3, 3],
      facing: 0x4000,
      x: 10 * 1024 + 512,
      y: 11 * 1024 + 512,
      min: 0,
      type: "unit.attack",
    },
    {
      name: "one subcell outside with a stale attack lock",
      footprint: [3, 3],
      facing: 0x4000,
      x: 10 * 1024 + 511,
      y: 11 * 1024 + 512,
      min: 0,
      type: "unit.attackMove",
      stale: true,
    },
    {
      name: "unrotated rectangle maximum boundary",
      footprint: [2, 4],
      facing: 0x4000,
      x: 10 * 1024,
      y: 12 * 1024,
      min: 0,
      type: "unit.attack",
    },
    {
      name: "quarter turn moves rectangle centre outside range",
      footprint: [2, 4],
      facing: 0x8000,
      x: 10 * 1024,
      y: 12 * 1024,
      min: 0,
      type: "unit.attackMove",
    },
    {
      name: "rotated rectangle maximum boundary",
      footprint: [2, 4],
      facing: 0x8000,
      x: 11 * 1024,
      y: 11 * 1024,
      min: 0,
      type: "unit.attack",
    },
    {
      name: "rotated rectangle minimum boundary",
      footprint: [2, 4],
      facing: 0x8000,
      x: 13 * 1024,
      y: 11 * 1024,
      min: 3 * 1024,
      type: "unit.attack",
    },
    {
      name: "one subcell inside minimum range",
      footprint: [2, 4],
      facing: 0x8000,
      x: 13 * 1024 + 1,
      y: 11 * 1024,
      min: 3 * 1024,
      type: "unit.attackMove",
    },
  ];
  for (const row of cases) {
    const decide = basicSkirmishProgram({
      ...policy,
      definitions: [
        ...policy.definitions.filter((definition) => definition.id !== "soldier"),
        {
          id: "soldier",
          role: "combat",
          domain: "foot",
          weapons: [{ targets: ["ground"], rangeSubcells: [row.min, 5 * 1024] }],
        },
        { id: "enemy-base", role: "headquarters", footprint: row.footprint },
      ],
    });
    const view = {
      ...observation([
        entity("e1", "hq"),
        {
          ...entity("e2", "soldier"),
          x: row.x,
          y: row.y,
          ...(row.stale && { attackTarget: "e3" }),
        },
        { ...entity("e3", "enemy-base", 3), x: 14 * 1024, y: 10 * 1024, facing: row.facing },
      ]),
      fog: [{ width: 32, height: 32, cells: new Uint8Array(32 * 32).fill(2) }],
    };
    const result = runDecision(decide, view, state(), createStream(9, "ai:1"), 64);
    expect({ name: row.name, type: result.commands[0]?.type }).toEqual({
      name: row.name,
      type: row.type,
    });
  }
});
test("waves use permitted structure ghosts only as positions, and dropped ghost goals are forgotten", () => {
  const decide = basicSkirmishProgram(policy);
  const own = [
    entity("e1", "hq"),
    ...Array.from({ length: 6 }, (_, i) => entity(`e${i + 2}`, "soldier")),
  ];
  const view = {
    ...observation(own),
    ghosts: [{ handle: "g1", force: 3, x: 10 * 1024, y: 10 * 1024 }],
  };
  const result = runDecision(decide, view, state(), createStream(1, "ai:1"), 64);
  expect(result.commands.filter((command) => command.type === "unit.attackMove")).toHaveLength(6);
  expect(result.commands.some((command) => command.type === "unit.attack")).toBe(false);
  expect(result.state.target).toBe("g1");
  const next = runDecision(
    decide,
    { ...view, tick: 20, ghosts: [] },
    result.state,
    result.random,
    64,
  );
  expect(next.state.target).not.toBe("g1");
});
test("a retreating first survivor cannot prevent healthy reinforcements from scouting below wave size", () => {
  const decide = basicSkirmishProgram(policy);
  const memory = initialSkirmishMemory();
  memory.orders = [{ handle: "e2", x: 0, y: 0, until: 0, retreat: true }];
  const view = {
    ...observation([
      entity("e1", "hq"),
      { ...entity("e2", "soldier"), health: 45 },
      entity("e3", "soldier"),
    ]),
    fog: [{ width: 16, height: 16, cells: new Uint8Array(256).fill(1) }],
    ghosts: [{ handle: "g1", force: 3, x: 14 * 1024, y: 14 * 1024 }],
  };
  const result = runDecision(decide, view, { ...state(), memory }, createStream(1, "ai:1"), 64);
  expect(result.commands).toContainEqual({
    type: "unit.attackMove",
    payload: { entities: ["e3"], x: 14 * 1024 + 512, y: 14 * 1024 + 512 },
  });
  expect(
    result.commands.some(
      (command) => command.type === "unit.move" && command.payload.entities[0] === "e2",
    ),
  ).toBe(true);
});
test("failed placements advance finite candidate history and unknown terrain is never queried", () => {
  const decide = basicSkirmishProgram(policy);
  const view = observation([entity("e1", "hq"), entity("e2", "builder")]);
  let saved = state(),
    random = createStream(1, "ai:1");
  const builds: PolicyCommand[] = [];
  for (let tick = 0; tick < 300 && builds.length < 2; tick += 10) {
    const result = runDecision(decide, { ...view, tick }, saved, random, 64);
    saved = result.state;
    random = result.random;
    builds.push(...result.commands.filter((command) => command.type === "economy.build"));
  }
  const [a, b] = builds;
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  expect(a).not.toEqual(b);
  const shrouded = { ...view, fog: [{ width: 16, height: 16, cells: new Uint8Array(256) }] };
  expect(runDecision(decide, shrouded, state(), createStream(1, "ai:1"), 64).commands).toEqual([]);
});

test("a distant remembered base stays the goal while a slow army is still travelling", () => {
  const decide = basicSkirmishProgram({
    ...policy,
    definitions: policy.definitions.map((definition) =>
      definition.id === "soldier" ? { ...definition, speed: 77 } : definition,
    ),
  });
  const own = [
    entity("e1", "hq"),
    ...Array.from({ length: 6 }, (_, index) => entity(`e${index + 2}`, "soldier")),
  ];
  const view = {
    ...observation(own),
    fog: [{ width: 128, height: 128, cells: new Uint8Array(128 * 128).fill(1) }],
    ghosts: [{ handle: "g1", force: 3, x: 110 * 1024, y: 110 * 1024 }],
  };
  const first = runDecision(decide, view, state(), createStream(1, "ai:1"), 64);
  expect(first.state.memory?.goal?.until).toBeGreaterThan(2000);
  const goal = structuredClone(first.state.memory!.goal!);
  const next = runDecision(
    decide,
    {
      ...view,
      tick: 800,
      entities: own.map((actor) =>
        actor.definition === "soldier"
          ? {
              ...actor,
              x: 30 * 1024,
              y: 30 * 1024,
              order: { type: "attackMove", x: goal.x, y: goal.y },
            }
          : actor,
      ),
    },
    first.state,
    first.random,
    64,
  );
  expect(next.state.memory?.goal).toEqual(goal);
  expect(next.commands.some((command) => command.type === "unit.attackMove")).toBe(false);
});

test("observed damage keeps a distant assault active, but a non-progressing target still expires", () => {
  const decide = basicSkirmishProgram({
    ...policy,
    definitions: [
      ...policy.definitions.map((definition) =>
        definition.id === "soldier" ? { ...definition, speed: 77 } : definition,
      ),
      { id: "enemy-base", role: "headquarters", footprint: [1, 1] },
    ],
  });
  const own = [
    entity("e1", "hq"),
    ...Array.from({ length: 6 }, (_, index) => ({
      ...entity(`e${index + 2}`, "soldier", 1, 100 * 1024),
      y: 100 * 1024,
    })),
  ];
  const target = {
    ...entity("e20", "enemy-base", 3, 103 * 1024),
    y: 100 * 1024,
    health: 4500,
    maxHealth: 4500,
  };
  const view = {
    ...observation([...own, target]),
    fog: [{ width: 128, height: 128, cells: new Uint8Array(128 * 128).fill(2) }],
  };
  const first = runDecision(decide, view, state(), createStream(2, "ai:1"), 64);
  const damaged = { ...view, tick: 600, entities: [...own, { ...target, health: 4400 }] };
  const next = runDecision(decide, damaged, first.state, first.random, 64);
  expect(next.state.memory?.goal).toMatchObject({ handle: target.handle, health: 4400 });
  expect(next.state.memory?.goal?.until).toBeGreaterThan(600);
  expect(next.state.memory?.avoid?.handle).not.toBe(target.handle);
  const expired = runDecision(decide, { ...damaged, tick: 2000 }, next.state, next.random, 64);
  expect(expired.state.memory?.avoid?.handle).toBe(target.handle);
});

test("scouting spends its bounded sample on new shroud before revisiting explored fog", () => {
  const decide = basicSkirmishProgram(policy);
  const own = [
    entity("e1", "hq"),
    ...Array.from({ length: 6 }, (_, index) => entity(`e${index + 2}`, "soldier")),
  ];
  const cells = new Uint8Array(32 * 32).fill(1);
  cells[483] = 0; // The second candidate after the fixed cursor; the first is explored cell756.
  const memory = initialSkirmishMemory();
  memory.scout = 5;
  const result = runDecision(
    decide,
    { ...observation(own), fog: [{ width: 32, height: 32, cells }] },
    { ...state(), memory },
    createStream(3, "ai:1"),
    64,
  );
  expect(result.state.memory?.goal).toMatchObject({
    x: 3 * 1024 + 512,
    y: 15 * 1024 + 512,
    handle: null,
  });
  const fallback = initialSkirmishMemory();
  fallback.scout = 5;
  let saved: DecisionState<PolicyCommand, SkirmishMemory> = { ...state(), memory: fallback },
    random = createStream(3, "ai:1");
  for (let tick = 0; tick < 100 && !saved.memory?.goal; tick++) {
    const next = runDecision(
      decide,
      {
        ...observation(own),
        tick,
        fog: [{ width: 32, height: 32, cells: new Uint8Array(32 * 32).fill(1) }],
      },
      saved,
      random,
      1,
    );
    expect(next.used).toBeLessThanOrEqual(1);
    saved = next.state;
    random = next.random;
  }
  expect(saved.memory?.goal).toMatchObject({
    x: 29 * 1024 + 512,
    y: 27 * 1024 + 512,
    handle: null,
  });
});

test("scouts search the last observed headquarters perimeter before roaming after it disappears", () => {
  const decide = basicSkirmishProgram(policy);
  const own = [
    entity("e1", "hq"),
    ...Array.from({ length: 6 }, (_, i) => entity(`e${i + 2}`, "soldier")),
  ];
  const enemy = entity("e9", "hq", 3, 10 * 1024);
  const first = runDecision(
    decide,
    {
      ...observation([...own, enemy]),
      fog: [{ width: 32, height: 32, cells: new Uint8Array(1024).fill(2) }],
    },
    state(),
    createStream(3, "ai:1"),
    64,
  );
  expect(first.state.memory?.enemyBase).toEqual({
    x: 10 * 1024 + 512,
    y: 5 * 1024 + 512,
    radius: 6 * 1024 + 512,
  });
  const cells = new Uint8Array(1024).fill(2);
  cells[5 * 32 + 4] = 0;
  const next = runDecision(
    decide,
    { ...observation(own), tick: 20, fog: [{ width: 32, height: 32, cells }] },
    first.state,
    first.random,
    64,
  );
  expect(next.state.memory?.goal).toMatchObject({ x: 4 * 1024, y: 5 * 1024 + 512, handle: null });
  expect(next.state.memory?.baseScout).toBe(5);
  expect(next.commands).toContainEqual({
    type: "unit.attackMove",
    payload: { entities: ["e2"], x: 4 * 1024, y: 5 * 1024 + 512 },
  });
  expect(next.state.memory?.enemyBase).toEqual(first.state.memory?.enemyBase);
});

test("perimeter search resumes within a one-work budget, bounds corners and exhausts before global scouting", () => {
  const decide = basicSkirmishProgram(policy);
  const own = [
    entity("e1", "hq"),
    ...Array.from({ length: 6 }, (_, i) => entity(`e${i + 2}`, "soldier")),
  ];
  const memory = initialSkirmishMemory();
  memory.enemyBase = { x: 512, y: 512, radius: 8 * 1024 };
  let saved: DecisionState<PolicyCommand, SkirmishMemory> = { ...state(), memory };
  let random = createStream(3, "ai:1");
  const cells = new Uint8Array(256).fill(2);
  for (let tick = 0; tick < 200; tick++) {
    const next = runDecision(
      decide,
      { ...observation(own), tick, fog: [{ width: 16, height: 16, cells }] },
      saved,
      random,
      1,
    );
    expect(next.used).toBeLessThanOrEqual(1);
    saved = next.state;
    random = next.random;
    expect(saved.memory?.goal).toBeNull();
  }
  expect(saved.memory?.baseScout).toBe(8);
  expect(saved.memory?.scout).toBeGreaterThan(0);
  expect(saved.memory?.enemyBase).toEqual(memory.enemyBase);
});

test("after headquarters loss a completed structure anchors retreat instead of the first moving unit", () => {
  const decide = basicSkirmishProgram(policy);
  const view = observation([
    { ...entity("e1", "soldier"), health: 20 },
    entity("e2", "reactor", 1, 10 * 1024),
  ]);
  const result = runDecision(decide, view, state(), createStream(1, "ai:1"), 64);
  expect(result.commands).toContainEqual({
    type: "unit.move",
    payload: { entities: ["e1"], x: 7 * 1024, y: 9 * 1024 },
  });
});

test("without a completed base wounded survivors leave old retreat orders and all pursue permitted goals", () => {
  const decide = basicSkirmishProgram({
    ...policy,
    definitions: policy.definitions.map((definition) =>
      definition.id === "soldier" ? { ...definition, speed: 77 } : definition,
    ),
  });
  const own = [10, 20, 30].map((health, i) => ({ ...entity(`e${i + 1}`, "soldier"), health }));
  const memory = initialSkirmishMemory();
  memory.orders = own.map((actor) => ({
    handle: actor.handle,
    x: 2 * 1024,
    y: 9 * 1024,
    until: 200,
    retreat: true,
  }));
  const view = {
    ...observation(own),
    fog: [{ width: 16, height: 16, cells: new Uint8Array(256) }],
    ghosts: [{ handle: "g1", force: 3, x: 10 * 1024, y: 10 * 1024 }],
  };
  const result = runDecision(decide, view, { ...state(), memory }, createStream(1, "ai:1"), 64);
  expect(result.commands.filter((command) => command.type === "unit.attackMove")).toHaveLength(3);
  expect(result.commands.some((command) => command.type === "unit.move")).toBe(false);
  expect(result.state.memory?.goal?.until).toBeGreaterThan(400);
  const engaged = runDecision(
    decide,
    { ...view, tick: 10, entities: [...own, entity("e9", "soldier", 3, 6 * 1024)] },
    result.state,
    result.random,
    64,
  );
  expect(engaged.commands.filter((command) => command.type === "unit.attack")).toHaveLength(3);
});

test("unfinished structures cannot anchor a retreat after loss of the completed base", () => {
  const decide = basicSkirmishProgram(policy);
  const view = {
    ...observation([
      { ...entity("e1", "soldier"), health: 20 },
      { ...entity("e2", "reactor"), constructionSite: true as const },
    ]),
    ghosts: [{ handle: "g1", force: 3, x: 10 * 1024, y: 10 * 1024 }],
  };
  const result = runDecision(decide, view, state(), createStream(1, "ai:1"), 64);
  expect(result.commands).toContainEqual({
    type: "unit.attackMove",
    payload: { entities: ["e1"], x: 10 * 1024 + 512, y: 10 * 1024 + 512 },
  });
});

test("reinforcement quota counts combat-ready troops and all queued combat output, not retreat reserves", () => {
  for (const row of [
    { count: 24, health: 100, retreat: false, queued: [], enqueue: false },
    { count: 24, health: 34, retreat: false, queued: [], enqueue: true },
    { count: 24, health: 35, retreat: false, queued: [], enqueue: false },
    { count: 24, health: 54, retreat: true, queued: [], enqueue: true },
    { count: 24, health: 55, retreat: true, queued: [], enqueue: false },
    { count: 23, health: 100, retreat: false, queued: [], enqueue: true },
    { count: 23, health: 100, retreat: false, queued: ["soldier"], enqueue: false },
    { count: 22, health: 100, retreat: false, queued: ["soldier", "tank"], enqueue: false },
    { count: 23, health: 100, retreat: false, queued: ["builder"], enqueue: true },
  ]) {
    const decide = basicSkirmishProgram({
      ...policy,
      buildOrder: [],
      definitions: [
        ...policy.definitions.map((definition) =>
          definition.id === "soldier"
            ? { ...definition, construction: { cost: { credits: 10 }, buildTicks: 1 } }
            : definition,
        ),
        { id: "tank", role: "combat" },
        { id: "barracks", role: "production", footprint: [1, 1], produces: ["soldier"] },
      ],
    });
    const troops = Array.from({ length: row.count }, (_, i) => ({
      ...entity(`e${i + 10}`, "soldier"),
      health: row.health,
    }));
    const memory = initialSkirmishMemory();
    memory.orders = troops.map((troop) => ({
      handle: troop.handle,
      x: 0,
      y: 0,
      until: 0,
      retreat: row.retreat,
    }));
    const result = runDecision(
      decide,
      observation([
        entity("e1", "hq"),
        { ...entity("e2", "barracks"), production: { slots: 2, queue: [] } },
        {
          ...entity("e3", "barracks"),
          production: {
            slots: 2,
            queue: row.queued.map((definition, i) => ({ definition, handle: `q${i + 1}` })),
          },
        },
        ...troops,
      ]),
      { ...state(), memory },
      createStream(1, "ai:1"),
      64,
    );
    expect({
      ...row,
      enqueue: result.commands.some((c) => c.type === "production.enqueue"),
    }).toEqual(row);
    expect(result.used).toBeLessThanOrEqual(64);
  }
});
