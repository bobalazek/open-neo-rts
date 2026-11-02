import { expect, test } from "bun:test";
import { step } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { flatMap } from "../testing/maps";
import { createMatchRecord, parseMatchRecord, verifyMatchRecord } from "./match-record";

function fixture() {
  const setup: MatchSetup = {
    seed: 7,
    debug: false,
    map: {
      ...flatMap(32),
      spawns: [0, 1].map((i) => ({
        id: `s${i}`,
        position: [(6 + 12 * i) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    definitions: [
      {
        id: "structure:record/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:record/builder",
        role: "builder",
        health: 10,
        speed: 100,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
    ],
    forces: [0, 1].map((index) => ({ index, faction: "faction:record" })),
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
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `s${index}`,
        start: {
          structures: ["structure:record/headquarters"],
          units: [{ unit: "unit:record/builder", count: 1, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const finish = () => {
    step(kernel, []);
    step(kernel, [
      { tick: 1, seat: 1, sequence: 0, type: "match.surrender", payload: { force: 1 } },
      { tick: 1, seat: 1, sequence: 1, type: "match.surrender", payload: { force: 0 } },
    ]);
    return createMatchRecord(kernel, setup);
  };
  return { setup, kernel, finish };
}

test("terminal normal record excludes refusals, owns its inputs and reproduces the exact result", () => {
  const { setup, kernel, finish } = fixture();
  expect(() => createMatchRecord(kernel, setup)).toThrow("Finish");
  const record = finish();
  expect(record.scenario.commands).toHaveLength(1);
  expect(record.scenario.commands[0]?.sequence).toBe(1);
  setup.seed = 9;
  const result = verifyMatchRecord(JSON.parse(JSON.stringify(record)));
  expect(result.tick).toBe(2);
  expect(result.hash).toBe(record.hash);
  expect(result.victory.result?.winner).toBe(1);
});

test("record parser/verifier refuses corruption, wrong versions, duplicate hosted commands and false terminal claims", () => {
  const record = fixture().finish();
  for (const value of [
    null,
    { ...record, extra: true },
    { ...record, tick: 0 },
    { ...record, hash: "bad" },
    { ...record, scenario: { ...record.scenario, simVersion: 999 } },
    {
      ...record,
      scenario: { ...record.scenario, setup: { ...record.scenario.setup, debug: true } },
    },
  ])
    expect(() => parseMatchRecord(value)).toThrow();
  expect(() => verifyMatchRecord({ ...record, hash: "0000000000000000" })).toThrow(
    "terminal tick and hash",
  );
  expect(() => verifyMatchRecord({ ...record, tick: 3 })).toThrow("terminal tick and hash");
  expect(() =>
    verifyMatchRecord({
      ...record,
      scenario: {
        ...record.scenario,
        commands: [
          { tick: 1, seat: 1, sequence: 0, type: "match.surrender", payload: { force: 1 } },
          ...record.scenario.commands,
        ],
      },
    }),
  ).toThrow("refused external commands");
  const normal = record.scenario.setup.normal!;
  expect(() =>
    parseMatchRecord({
      ...record,
      scenario: {
        ...record.scenario,
        setup: {
          ...record.scenario.setup,
          normal: { ...normal, bots: [{ seat: 2, kind: "idle" }] },
        },
        commands: [
          { tick: 1, seat: 2, sequence: 0, type: "match.surrender", payload: { force: 1 } },
        ],
      },
    }),
  ).toThrow("regenerated");
});
