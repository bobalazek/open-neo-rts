import { expect, test } from "bun:test";
import { isWorkerReply } from "./protocol";

const grid = () => ({ group: 1, width: 8, height: 8, cells: new Uint8Array(64).fill(1) });
const ghost = {
  handle: "g1",
  group: 1,
  definition: "structure:test/factory",
  force: 2,
  x: 4096,
  y: 4096,
  facing: 0x4000,
  health: 10,
  maxHealth: 20,
  seen: 1,
};
const reply = (fog: unknown = [grid()], ghosts: unknown = [ghost], mode = "controlled") => ({
  id: 1,
  state: { paused: true, speed: 1, snapshot: { tick: 2, mode, entities: [], fog, ghosts } },
});

test("worker accepts copied typed fog grids and remembered structures, without requiring renderer support", () => {
  expect(isWorkerReply(reply())).toBe(true);
  expect(isWorkerReply(reply([], []))).toBe(true);
  expect(isWorkerReply(reply([grid()], [{ ...ghost, constructionSite: true }]))).toBe(true);
  expect(
    isWorkerReply(reply([grid()], [{ ...ghost, constructionSite: true, constructionStage: 32 }])),
  ).toBe(true);
  for (const constructionStage of [-1, 101, 0.5, NaN, null, "32"])
    expect(
      isWorkerReply(reply([grid()], [{ ...ghost, constructionSite: true, constructionStage }])),
    ).toBe(false);
  expect(isWorkerReply(reply([grid()], [{ ...ghost, constructionStage: 32 }]))).toBe(false);
  expect(isWorkerReply(reply([grid(), { ...grid(), group: 2 }], [ghost]))).toBe(true);
  expect(isWorkerReply(reply(undefined, undefined, "debug-no-fog"))).toBe(false);
});

test("worker rejects malformed, aliased, sparse and inconsistent vision-group layouts", () => {
  const invalidCell = grid();
  invalidCell.cells[3] = 3;
  const expando = grid();
  Reflect.set(expando.cells, "secret", 1);
  for (const fog of [
    null,
    {},
    Array(1),
    [null],
    [{ ...grid(), group: -1 }],
    [{ ...grid(), group: 0.5 }],
    [{ ...grid(), group: 0x80000000 }],
    [{ ...grid(), width: 0 }],
    [{ ...grid(), height: 513 }],
    [{ ...grid(), cells: Array(64).fill(1) }],
    [{ ...grid(), cells: new Uint8Array(63) }],
    [invalidCell],
    [expando],
    [{ ...grid(), entity: 123 }],
    [Object.assign(Object.create(grid()), grid())],
    [grid(), grid()],
    [{ ...grid(), group: 2 }, grid()],
    [grid(), { ...grid(), group: 2, width: 4, height: 16 }],
    Array.from({ length: 9 }, (_, group) => ({ ...grid(), group })),
  ])
    expect(isWorkerReply(reply(fog, []))).toBe(false);
  expect(isWorkerReply(reply([grid()], [], "debug-no-fog"))).toBe(false);
});

test("worker rejects forged ghost state, hidden IDs, invalid indices and live/ghost handle collisions", () => {
  for (const value of [
    null,
    {},
    { ...ghost, handle: "e1" },
    { ...ghost, group: 2 },
    { ...ghost, definition: "unit:test/scout" },
    { ...ghost, force: -1 },
    { ...ghost, x: 8192 },
    { ...ghost, y: 0.5 },
    { ...ghost, facing: 1 },
    { ...ghost, health: 0 },
    { ...ghost, health: 0.5 },
    { ...ghost, seen: 3 },
    { ...ghost, entity: 123 },
    { ...ghost, order: null },
    { ...ghost, power: {} },
    { ...ghost, constructionSite: false },
    Object.assign(Object.create(ghost), ghost),
  ])
    expect(isWorkerReply(reply([grid()], [value]))).toBe(false);
  expect(isWorkerReply(reply([grid()], Array(1)))).toBe(false);
  expect(isWorkerReply(reply([grid()], [ghost, ghost]))).toBe(false);
  const packet = reply();
  Object.assign(packet.state.snapshot, { entities: [{ handle: "g1" }] });
  expect(isWorkerReply(packet)).toBe(false);
});

test("controlled worker packets reject full hashes and unknown raw entity fields", () => {
  expect(isWorkerReply({ ...reply(), state: { ...reply().state, hash: "1234567890abcdef" } })).toBe(
    false,
  );
  const entity = {
    handle: "e1",
    definition: "unit:test/scout",
    force: 1,
    x: 4096,
    y: 4096,
    facing: 0,
    health: 10,
    maxHealth: 10,
    order: null,
  };
  for (const entities of [
    [{ ...entity, entity: 1 }],
    [{ ...entity, x: -1 }],
    [entity, entity],
    Array(1),
  ]) {
    const packet = reply([], []);
    Object.assign(packet.state.snapshot, { entities });
    expect(isWorkerReply(packet)).toBe(false);
  }
});
