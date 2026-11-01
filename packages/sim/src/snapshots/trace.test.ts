import { expect, test } from "bun:test";
import fixture from "../../../../apps/cli/scenarios/smoke.json";
import { defineComponent, World } from "../ecs";
import { parseScenario, runScenario } from ".";
import { diffWorlds } from "./diff";
import { compareTraces, parseTrace, traceScenario } from "./trace";

const scenario = parseScenario(fixture);

function changed() {
  return parseScenario({
    ...fixture,
    commands: fixture.commands.map((command) =>
      command.type === "unit.move"
        ? { ...command, payload: { entities: [1], x: 0, y: 1024 } }
        : command,
    ),
  });
}

test("trace includes initial state, every tick, all kernel events, and the effective replay setup", () => {
  const trace = traceScenario(scenario, { ticks: 201, seed: 42 });
  expect(parseTrace(JSON.parse(JSON.stringify(trace)))).toEqual(trace);
  expect(trace.scenario.setup.seed).toBe(42);
  expect(scenario.setup.seed).toBe(1);
  expect(trace.hashes.map(({ tick }) => tick)).toEqual(Array.from({ length: 202 }, (_, i) => i));
  expect(trace.hashes.filter(({ tick }) => tick === 100 || tick === 200 || tick === 201)).toEqual(
    runScenario(scenario, { ticks: 201, seed: 42 }),
  );
  expect(trace.events.map(({ tick, result }) => [tick, result])).toEqual([
    [0, "accepted"],
    [1, "accepted"],
    [199, "accepted"],
  ]);
  expect(compareTraces(trace, traceScenario(scenario, { ticks: 201, seed: 42 }))).toBeNull();
});

test("validates JSON command content independently of object key order", () => {
  const trace = traceScenario(scenario);
  const event = trace.events[0];
  if (!event) throw new Error("Expected a spawn event");
  const command = event.command as Record<string, unknown>;
  event.command = Object.fromEntries(Object.entries(command).reverse());
  expect(parseTrace(trace)).toBe(trace);
});

test("different command logs locate the first tick, producing events, entity and component", () => {
  const a = traceScenario(scenario);
  const b = traceScenario(changed());
  const report = compareTraces(a, b);
  expect(report?.tick).toBe(2);
  expect(report?.events.a.map(({ tick, command }) => [tick, command])).toEqual([
    [1, scenario.commands[1]],
  ]);
  expect(report?.events.b.map(({ tick, command }) => [tick, command])).toEqual([
    [1, changed().commands[1]],
  ]);
  expect(report?.state).toContainEqual({
    entity: 1,
    component: "Transform",
    field: "x",
    a: 92,
    b: 0,
  });
  expect(report?.hashes).toEqual(report?.replayHashes);
});

test("canonical diff covers signed values, all widths, absent entities and empty components", () => {
  const component = defineComponent("Example", {
    signed: "i32",
    wide: "u32",
    short: "u16",
    byte: "u8",
  });
  const empty = defineComponent("Empty", {});
  const a = new World();
  const b = new World();
  for (const world of [a, b]) {
    world.register(component);
    world.register(empty);
    world.create();
  }
  a.add(1, component, { signed: -42, wide: 0xffffffff, short: 0xffff, byte: 255 });
  a.add(1, empty);
  b.add(1, component);
  expect(diffWorlds(a, b)).toContainEqual({
    entity: 1,
    component: "Example",
    field: "signed",
    a: -42,
    b: 0,
  });
  expect(diffWorlds(a, b)).toContainEqual({
    entity: 1,
    component: "Example",
    field: "wide",
    a: 0xffffffff,
    b: 0,
  });
  expect(diffWorlds(a, b)).toContainEqual({
    entity: 1,
    component: "Empty",
    field: "$present",
    a: 1,
    b: null,
  });
  b.destroy(1);
  expect(diffWorlds(a, b)).toContainEqual({
    entity: 1,
    component: "$entity",
    field: "present",
    a: 1,
    b: null,
  });
});

test("zero-step traces and different trace lengths are explicit", () => {
  const empty = { ...scenario, commands: [] };
  expect(traceScenario(empty).hashes).toHaveLength(1);
  expect(compareTraces(traceScenario(empty), traceScenario(empty, { ticks: 1 }))?.tick).toBe(1);
});

const valid = traceScenario(scenario);
for (const [field, value] of [
  ["$.format", { ...valid, format: 99 }],
  ["$.simVersion", { ...valid, simVersion: 99 }],
  ["$.unknown", { ...valid, unknown: true }],
  ["$.hashes", { ...valid, hashes: [] }],
  ["$.hashes[0].tick", { ...valid, hashes: [{ tick: 2, hash: valid.hashes[0]?.hash }] }],
  ["$.hashes[0].hash", { ...valid, hashes: [{ tick: 0, hash: "bad" }] }],
  ["$.events", { ...valid, events: valid.events.slice(1) }],
  [
    "$.events[0]",
    { ...valid, events: valid.events.map((entry, i) => (i ? entry : { ...entry, tick: 1 })) },
  ],
  ["$.events[0].result", { ...valid, events: [{ ...valid.events[0], result: "bad" }] }],
  [
    "$.commands[0].payload",
    {
      ...valid,
      events: [{ ...valid.events[0], command: { ...scenario.commands[0], payload: null } }],
    },
  ],
  ["$.setup.seed", { ...valid, scenario: { ...scenario, setup: { ...scenario.setup, seed: -1 } } }],
] as const) {
  test(`rejects malformed or incompatible trace ${field}`, () => {
    expect(() => parseTrace(value)).toThrow(field);
  });
}
