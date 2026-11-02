import { expect, test } from "bun:test";
import { createStream, nextU32 } from "@open-neo-rts/deterministic";
import { idleProgram, runDecision } from ".";

test("work is counted and bounded, and decisions use a copied random stream", () => {
  const random = createStream(1, "ai:1"),
    before = { ...random };
  const result = runDecision(
    ({ state, work, random }) => {
      let cursor = state.cursor;
      while (cursor < 10 && work.take()) cursor++;
      nextU32(random);
      return { state: { ...state, cursor }, commands: [] };
    },
    { entities: [] },
    { cursor: 0, target: null, pending: [] },
    random,
    3,
  );
  expect(result.used).toBe(3);
  expect(result.state.cursor).toBe(3);
  expect(random).toEqual(before);
  expect(result.random).not.toEqual(before);
  for (const budget of [0, -1, 0.5, 4097])
    expect(() =>
      runDecision(idleProgram(), {}, { cursor: 0, target: null, pending: [] }, random, budget),
    ).toThrow("work budget");
});

test("idle is an explicit hosting policy with no gameplay commands", () => {
  const result = runDecision(
    idleProgram(),
    {},
    { cursor: 0, target: null, pending: [] },
    createStream(1, "ai:1"),
    64,
  );
  expect(result.commands).toEqual([]);
  expect(result.used).toBe(1);
});
