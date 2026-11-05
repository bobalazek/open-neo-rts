import { expect, test } from "bun:test";
import { SIM_VERSION } from "@open-neo-rts/sim";
import { defaultSkirmish } from "../skirmish/setup";
import { parseSavedReplay, replayCompatibility, replayConfig, replayTime } from "./storage";

function fixture() {
  const config = defaultSkirmish();
  return {
    format: 1,
    id: "replay-fixture",
    name: "Training Grounds",
    createdAt: 123,
    config,
    packs: [
      {
        id: "core",
        version: "0.1.0",
        gameplay: true,
        gameplayHash: "1234567890abcdef",
        cosmeticHash: "abcdef1234567890",
      },
    ],
    cosmeticHash: "abcdef1234567890",
    winner: 1,
    record: {
      format: 1,
      tick: 1251,
      hash: "1234567890abcdef",
      scenario: {
        format: 2,
        simVersion: SIM_VERSION,
        setup: {
          debug: false,
          seed: config.seed,
          normal: {
            forces: [
              { index: 0, spawn: config.yourSpawn },
              { index: 1, spawn: config.otherSpawn },
            ],
            settings: {
              startingCredits: config.startingCredits,
              popCap: config.popCap,
              structureCap: config.structureCap,
              veterancy: config.veterancy,
            },
          },
        },
        commands: [],
      },
    },
  };
}
test("replay metadata preserves legacy setup and detects versions/content independent of property order", () => {
  const value = fixture(),
    replay = parseSavedReplay(value);
  expect(replayConfig(replay.record)).toEqual(defaultSkirmish());
  expect(replayTime(1251)).toBe("1:02");
  expect(replayCompatibility(replay, value.packs, value.cosmeticHash)).toBeNull();
  const reordered = value.packs.map(({ id, version, gameplay, gameplayHash, cosmeticHash }) => ({
    cosmeticHash,
    gameplayHash,
    gameplay,
    version,
    id,
  }));
  expect(replayCompatibility(replay, reordered, value.cosmeticHash)).toBeNull();
  const future = parseSavedReplay({
    ...value,
    record: { ...value.record, scenario: { ...value.record.scenario, simVersion: 999 } },
  });
  expect(replayCompatibility(future, value.packs, value.cosmeticHash)).toContain("999");
  expect(replayCompatibility(replay, value.packs, "0000000000000000")).toContain(
    "different installed content",
  );
});
test("replay metadata rejects corrupt, excessive and unexpected fields before persistence", () => {
  const value = fixture();
  for (const input of [
    null,
    {},
    { ...value, name: "" },
    { ...value, id: "../bad" },
    { ...value, keyframes: [] },
    { ...value, createdAt: -1 },
    { ...value, winner: -1 },
    { ...value, config: { ...value.config, yourSpawn: "bad" } },
    { ...value, record: { ...value.record, tick: 144001 } },
    { ...value, record: { ...value.record, hash: "bad" } },
    {
      ...value,
      record: { ...value.record, scenario: { ...value.record.scenario, commands: null } },
    },
  ])
    expect(() => parseSavedReplay(input)).toThrow();
});

test("portable header requires its explicit map identity and matching bounded record version", () => {
  const legacy = fixture();
  const portable = {
    ...legacy,
    format: 2,
    mapHash: "abcdef1234567890",
    record: { ...legacy.record, format: 2, keyframes: [{ tick: 0 }, { tick: 1200 }] },
  };
  // Metadata stays cheap; full frame/checksum/history validation belongs to the worker.
  expect(parseSavedReplay(portable).format).toBe(2);
  for (const value of [
    { ...portable, mapHash: undefined },
    { ...portable, mapHash: "bad" },
    { ...portable, record: legacy.record },
    { ...legacy, record: portable.record },
    { ...legacy, mapHash: portable.mapHash },
    { ...portable, record: { ...portable.record, keyframes: [] } },
    { ...portable, record: { ...portable.record, keyframes: Array(122).fill({}) } },
  ])
    expect(() => parseSavedReplay(value)).toThrow();
});
