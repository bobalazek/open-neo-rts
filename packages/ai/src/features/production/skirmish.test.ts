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
import { basicSkirmishProgram } from ".";

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
