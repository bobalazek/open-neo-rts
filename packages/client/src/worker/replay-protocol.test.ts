import { expect, test } from "bun:test";
import { SIM_VERSION } from "@open-neo-rts/sim";
import { isReplayReply, type ReplayState } from "./replay-protocol";

const ready: ReplayState = {
  phase: "ready",
  tick: 2,
  duration: 4,
  epoch: 1,
  paused: true,
  speed: 1,
  vision: "all",
  winner: 0,
  snapshot: { tick: 2, mode: "controlled", entities: [] },
};
test("replay replies validate copied display state and bounded progress without raw host state", () => {
  expect(isReplayReply({ id: 1, state: ready })).toBe(true);
  expect(
    isReplayReply({
      id: 0,
      state: {
        phase: "preparing",
        tick: 0,
        duration: 4,
        epoch: 0,
        paused: true,
        speed: 1,
        vision: "all",
      },
    }),
  ).toBe(true);
  expect(isReplayReply({ id: 1, error: "Replay is read-only" })).toBe(true);
  for (const state of [
    { ...ready, phase: ["preparing"] },
    { ...ready, phase: "bad" },
    { ...ready, tick: 5 },
    { ...ready, duration: 144001 },
    { ...ready, epoch: -1 },
    { ...ready, epoch: 0x80000000 },
    { ...ready, paused: 1 },
    { ...ready, speed: 3 },
    { ...ready, vision: "1" },
    { ...ready, winner: -1 },
    { ...ready, winner: undefined },
    { ...ready, world: new Uint8Array([1]) },
    { ...ready, keyframes: [] },
    { ...ready, snapshot: { ...ready.snapshot, tick: 1 } },
    { ...ready, snapshot: { ...ready.snapshot, mode: "debug-no-fog" } },
    { ...ready, snapshot: { ...ready.snapshot, world: "secret" } },
    { ...ready, phase: "seeking" },
  ])
    expect(isReplayReply({ id: 0, state: structuredClone(state) })).toBe(false);
  expect(isReplayReply({ id: -1, state: ready })).toBe(false);
  expect(isReplayReply({ id: 1, state: ready, world: "secret" })).toBe(false);
});

test("only explicit portable-record replies can carry host captures outside display state", () => {
  const record = {
    format: 2,
    tick: 1,
    hash: "1234567890abcdef",
    keyframes: [{}],
    scenario: {
      format: 2,
      simVersion: SIM_VERSION,
      setup: { debug: false, normal: {} },
      commands: [],
    },
  };
  expect(isReplayReply({ id: 2, record })).toBe(true);
  expect(isReplayReply({ id: 2, record: { ...record, keyframes: [] } })).toBe(false);
  expect(isReplayReply({ id: 2, record: { ...record, format: 1 } })).toBe(false);
  expect(isReplayReply({ id: 0, state: { ...ready, record } })).toBe(false);
});

test("replay annotations are bounded ordered display data only on ready states", () => {
  const combat = { type: "combat", tick: 1, x: 1024, y: 2048 };
  const elimination = { type: "elimination", tick: 4, force: 0, reason: "surrendered" };
  expect(isReplayReply({ id: 1, state: { ...ready, markers: [combat, elimination] } })).toBe(true);
  for (const markers of [
    Array(1),
    Array(729).fill(combat),
    [null],
    [elimination, combat],
    [{ ...combat, tick: 0 }],
    [{ ...combat, tick: 5 }],
    [{ ...combat, x: -1 }],
    [{ ...combat, y: 0.5 }],
    [{ ...combat, entity: "e1" }],
    [{ ...elimination, reason: "active" }],
    [{ ...elimination, force: -1 }],
  ])
    expect(isReplayReply({ id: 1, state: { ...ready, markers } })).toBe(false);
  expect(isReplayReply({ id: 0, state: { ...ready, phase: "seeking", markers: [combat] } })).toBe(
    false,
  );
});
