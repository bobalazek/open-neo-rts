import { describe, expect, test } from "bun:test";
import { step } from "../kernel";
import { createMatch, SIM_VERSION } from "../match";
import { parseScenario, runScenario, SCENARIO_FORMAT, type Scenario } from ".";

function scenario(): Scenario {
  return {
    format: SCENARIO_FORMAT,
    simVersion: SIM_VERSION,
    setup: {
      seed: 1,
      debug: true,
      forces: [{ index: 2, faction: "faction:eastern-collective" }],
      seats: [1],
      grants: [{ seat: 1, force: 2, scopes: ["unit.orders"], grantedAtTick: 0 }],
      definitions: [
        { id: "unit:eastern-collective/dragon-tank", health: 900, speed: 92, turnRate: 728 },
      ],
    },
    commands: [
      {
        tick: 0,
        sequence: 0,
        seat: 0,
        type: "debug.spawn",
        payload: {
          definition: "unit:eastern-collective/dragon-tank",
          force: 2,
          x: 0,
          y: 0,
          facing: 0,
        },
      },
      {
        tick: 1,
        sequence: 0,
        seat: 1,
        type: "unit.move",
        payload: { entities: [1], x: 1024, y: 0 },
      },
    ],
  };
}

// JSON-path updates keep malformed cases concise without weakening the public types.
function replace(path: string, value: unknown): unknown {
  const input = structuredClone(scenario()) as unknown as Record<string, unknown>;
  const parts = path.split(".");
  let object = input;
  for (const part of parts.slice(0, -1)) object = object[part] as Record<string, unknown>;
  object[parts.at(-1) as string] = value;
  return input;
}

describe("parseScenario", () => {
  test("accepts a canonical log without changing table or command order", () => {
    const input = scenario();
    expect(parseScenario(input)).toBe(input);
    expect(parseScenario(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  for (const [path, value, error] of [
    ["format", 2, "$.format"],
    ["simVersion", 2, "$.simVersion"],
    ["format", "1", "$.format"],
    ["setup.seed", -1, "$.setup.seed"],
    ["setup.seed", 0x100000000, "$.setup.seed"],
    ["setup.seed", 0.5, "$.setup.seed"],
    ["setup.debug", "true", "$.setup.debug"],
    ["setup.map", {}, "$.setup.map"],
    ["setup.constructor", 1, "$.setup.constructor"],
    ["setup.$schema", "editor.json", "$.setup.$schema"],
    [
      "setup.forces",
      [{ index: 1.5, faction: "faction:eastern-collective" }],
      "$.setup.forces[0].index",
    ],
    ["setup.forces.0.faction", "Eastern Collective", "$.setup.forces[0].faction"],
    ["setup.seats", [0], "$.setup.seats[0]"],
    ["setup.seats", [1, 1], "$.setup.seats[1]: duplicate ID"],
    [
      "setup.forces",
      [scenario().setup.forces[0], scenario().setup.forces[0]],
      "$.setup.forces[1].index: duplicate ID",
    ],
    [
      "setup.definitions",
      [scenario().setup.definitions[0], scenario().setup.definitions[0]],
      "$.setup.definitions[1].id: duplicate ID",
    ],
    ["setup.definitions.0.speed", 1.2, "$.setup.definitions[0].speed"],
    ["setup.definitions.0.health", 0x80000000, "$.setup.definitions[0].health"],
    ["setup.definitions.0.turnRate", 0x10001, "$.setup.definitions[0].turnRate"],
    ["setup.definitions.0.id", "bad", "$.setup.definitions[0].id"],
    ["setup.grants.0.seat", 3, "$.setup.grants[0].seat: undeclared"],
    ["setup.grants.0.force", 3, "$.setup.grants[0].force: undeclared"],
    ["setup.grants.0.scopes", ["full"], "$.setup.grants[0].scopes[0]"],
    ["setup.grants.0.expiresAtTick", -1, "$.setup.grants[0].expiresAtTick"],
    ["commands", {}, "$.commands"],
    ["commands.0.tick", -1, "$.commands[0].tick"],
    ["commands.0.extra", 1, "$.commands[0].extra"],
    ["commands.0.type", "unknown", "$.commands[0].type"],
    ["commands.0.seat", 3, "$.commands[0].seat: undeclared"],
    ["commands.0.payload.force", 3, "$.commands[0].payload.force: undeclared"],
    [
      "commands.0.payload.definition",
      "unit:eastern-collective/missing",
      "$.commands[0].payload.definition: undeclared",
    ],
    ["commands.0.payload.x", 0.1, "$.commands[0].payload"],
    ["commands.0.payload.facing", 0x10000, "$.commands[0].payload"],
    ["commands.1.payload.entities", [], "$.commands[1].payload"],
    ["commands", [scenario().commands[0], scenario().commands[0]], "$.commands[0].sequence"],
  ] as const) {
    test(`rejects malformed ${path}: ${JSON.stringify(value)} with its path`, () => {
      expect(() => parseScenario(replace(path, value))).toThrow(error);
    });
  }

  test("rejects missing fields and nonobjects", () => {
    expect(() => parseScenario(null)).toThrow("$: must be an object");
    expect(() => parseScenario({})).toThrow("$.setup: is required");
  });

  test("leaves debug gating, grants and live-entity checks to the kernel", () => {
    const input = scenario();
    input.setup.debug = false;
    input.commands = [input.commands[0] as Scenario["commands"][number]];
    const parsed = parseScenario(input);
    expect(step(createMatch(parsed.setup), parsed.commands)[0]?.result).toBe("debug_only");
    input.setup.debug = true;
    input.setup.grants = [];
    input.commands = scenario().commands;
    const kernel = createMatch(parseScenario(input).setup);
    step(kernel, [input.commands[0]]);
    expect(step(kernel, [input.commands[1]])[0]?.result).toBe("no_grant");
    const dead = {
      tick: 2,
      sequence: 0,
      seat: 0,
      type: "debug.remove",
      payload: { entity: 999 },
    } as const;
    expect(parseScenario({ ...input, commands: [dead] }).commands).toEqual([dead]);
    expect(step(kernel, [dead])[0]?.result).toBe("bad_payload");
  });
});

describe("runScenario", () => {
  test("repeats a fresh world, handles unsorted commands, and includes the last command tick", () => {
    const input = scenario();
    const expected = runScenario(input);
    expect(expected.map(({ tick }) => tick)).toEqual([2]);
    expect(runScenario(input)).toEqual(expected);
    expect(runScenario({ ...input, commands: [...input.commands].reverse() })).toEqual(expected);
  });

  test("prints every checkpoint and the final state once, including exact checkpoint endings", () => {
    expect(runScenario(scenario(), { ticks: 201 }).map(({ tick }) => tick)).toEqual([
      100, 200, 201,
    ]);
    expect(runScenario(scenario(), { ticks: 200 }).map(({ tick }) => tick)).toEqual([100, 200]);
  });

  test("empty logs can end at tick zero; a tick-zero command requires a step", () => {
    expect(runScenario({ ...scenario(), commands: [] }).map(({ tick }) => tick)).toEqual([0]);
    const input = {
      ...scenario(),
      commands: [scenario().commands[0] as Scenario["commands"][number]],
    };
    expect(runScenario(input).map(({ tick }) => tick)).toEqual([1]);
    expect(() => runScenario(input, { ticks: 0 })).toThrow("all logged commands must execute");
  });

  test("rejects truncation and noninteger final bounds", () => {
    for (const ticks of [-1, 0, 1, 1.5, 0x80000001, Number.NaN])
      expect(() => runScenario(scenario(), { ticks })).toThrow("ticks must be an integer");
  });

  test("seed overrides leave the supplied setup unchanged and enforce u32 bounds", () => {
    const input = scenario();
    runScenario(input, { seed: 0xffffffff });
    expect(input.setup.seed).toBe(1);
    expect(() => runScenario(input, { seed: 0x100000000 })).toThrow("Match seed must be a u32");
  });
});
