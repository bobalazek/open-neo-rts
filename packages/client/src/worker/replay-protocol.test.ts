import { expect, test } from "bun:test";
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
