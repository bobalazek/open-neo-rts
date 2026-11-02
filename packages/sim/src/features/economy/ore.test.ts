import { expect, test } from "bun:test";
import { World } from "../../ecs";
import { checkpointHash, createKernel, register, step } from "../../kernel";
import { checkMatchMap, compileOreCells, type MatchMap, serializeMatchMap } from "../../match-map";
import { flatMap } from "../../testing";
import {
  initializeOre,
  mineOreCell,
  ORE_REGROWTH_TICKS,
  OreCell,
  oreCells,
  oreFeature,
  readOreCell,
} from "./ore";

const field = (amount: number, x = 1024, y = x, radius = 1024) => ({
  kind: "ore" as const,
  position: [x, y] as const,
  radius,
  amount,
});
function fixture(resources: MatchMap["resources"] = [field(12)]) {
  const map = { ...flatMap(3), resources };
  const kernel = createKernel({ seed: 1, debug: false, map });
  initializeOre(kernel);
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) step(kernel, []);
  };
  const entity = (cell: number) =>
    kernel.world
      .query(OreCell)
      .find((entity) => kernel.world.get(entity, OreCell, "cell") === cell) as number;
  return { kernel, map, advance, entity };
}

test("field budgets split by quotient/remainder across row-major integer-disc cells", () => {
  const { map, kernel } = fixture();
  expect(compileOreCells(map)).toEqual([
    { cell: 1, cap: 3 },
    { cell: 3, cap: 3 },
    { cell: 4, cap: 2 },
    { cell: 5, cap: 2 },
    { cell: 7, cap: 2 },
  ]);
  expect(oreCells(kernel.world).reduce((sum, value) => sum + value.remaining, 0)).toBe(12);
  expect(compileOreCells(JSON.parse(serializeMatchMap(map)))).toEqual(compileOreCells(map));
  const tiny = fixture([field(3)]);
  expect(oreCells(tiny.kernel.world).map((value) => value.cap)).toEqual([1, 1, 1, 0, 0]);
});

test("overlaps add each field contribution once, clipping budgets to in-bounds geometry", () => {
  const { map } = fixture([
    field(12),
    field(3),
    { kind: "materials", position: [1024, 1024], amount: 100 },
  ]);
  expect(compileOreCells(map).map((value) => value.cap)).toEqual([4, 4, 3, 2, 2]);
  expect(compileOreCells({ ...map, resources: [...(map.resources ?? [])].reverse() })).toEqual(
    compileOreCells(map),
  );
  expect(compileOreCells({ ...map, resources: [field(5, 0, 0)] })).toEqual([
    { cell: 0, cap: 2 },
    { cell: 1, cap: 2 },
    { cell: 3, cap: 1 },
  ]);
  expect(
    compileOreCells({ ...map, resources: [field(7, 0, 0, 10 * 1024)] }).reduce(
      (sum, value) => sum + value.cap,
      0,
    ),
  ).toBe(7);
  expect(
    compileOreCells({ ...map, resources: [field(3, 512, 512)] }).map((value) => value.cell),
  ).toEqual([0, 1, 3, 4]);
});

test("unsupported empty discs and overlapping capacity overflow reject at the map boundary", () => {
  for (const resources of [
    [field(1, 512, 512, 0)],
    [field(0)],
    [field(0x7fffffff, 1024, 1024, 0), field(1, 1024, 1024, 0)],
  ]) {
    const map = { ...flatMap(3), resources };
    expect(() => compileOreCells(map)).toThrow();
    const issues: { path: string; message: string }[] = [];
    checkMatchMap(map, [], issues);
    expect(issues.some((issue) => issue.path === "$.setup.map.resources")).toBe(true);
  }
});

test("trusted mining returns bounded whole ore without changing caps, leaking references or accepting malformed requests", () => {
  const { kernel, advance } = fixture();
  const copied = readOreCell(kernel.world, 1);
  expect(mineOreCell(kernel.world, 1, 2)).toBe(2);
  expect(readOreCell(kernel.world, 1)).toEqual({ cell: 1, cap: 3, remaining: 1, regrowthTicks: 0 });
  for (const request of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 0x80000000])
    expect(mineOreCell(kernel.world, 1, request)).toBe(0);
  expect(mineOreCell(kernel.world, 1, 99)).toBe(1);
  expect(mineOreCell(kernel.world, 1, 1)).toBe(0);
  for (const cell of [-1, 0.5, 99, Number.NaN]) expect(mineOreCell(kernel.world, cell, 1)).toBe(0);
  Reflect.set(copied as object, "remaining", 999);
  expect(readOreCell(kernel.world, 1)?.remaining).toBe(0);
  advance(ORE_REGROWTH_TICKS);
  expect(readOreCell(kernel.world, 1)?.remaining).toBe(1);
  expect(kernel.economy).toBeUndefined();
});

test("regrowth uses elapsed canonical work, stops at initial cap, and resets while full", () => {
  const { kernel, advance } = fixture();
  mineOreCell(kernel.world, 1, 1);
  advance(ORE_REGROWTH_TICKS - 1);
  expect(readOreCell(kernel.world, 1)).toEqual({
    cell: 1,
    cap: 3,
    remaining: 2,
    regrowthTicks: 199,
  });
  advance(1);
  expect(readOreCell(kernel.world, 1)).toEqual({ cell: 1, cap: 3, remaining: 3, regrowthTicks: 0 });
  advance(1000);
  expect(readOreCell(kernel.world, 1)?.remaining).toBe(3);
  mineOreCell(kernel.world, 1, 1);
  advance(10);
  mineOreCell(kernel.world, 1, 1);
  expect(readOreCell(kernel.world, 1)?.regrowthTicks).toBe(10);
});

test("empty cells need orthogonal pre-step neighbours, do not wrap map edges, and preserve paused work", () => {
  const { kernel, advance, entity } = fixture([
    field(2, 0, 0, 0),
    field(2, 1024, 0, 0),
    field(2, 2048, 0, 0),
    field(2, 0, 1024, 0),
  ]);
  mineOreCell(kernel.world, 0, 2);
  mineOreCell(kernel.world, 1, 2);
  mineOreCell(kernel.world, 3, 2);
  kernel.world.set(entity(0), OreCell, "regrowthTicks", 199);
  kernel.world.set(entity(1), OreCell, "regrowthTicks", 199);
  kernel.world.set(entity(3), OreCell, "regrowthTicks", 199);
  advance(1);
  expect(readOreCell(kernel.world, 1)?.remaining).toBe(1);
  expect(readOreCell(kernel.world, 0)).toMatchObject({ remaining: 0, regrowthTicks: 199 });
  expect(readOreCell(kernel.world, 3)).toMatchObject({ remaining: 0, regrowthTicks: 199 });
  advance(1);
  expect(readOreCell(kernel.world, 0)?.remaining).toBe(1);
  expect(readOreCell(kernel.world, 3)?.remaining).toBe(0);
  advance(1);
  expect(readOreCell(kernel.world, 3)?.remaining).toBe(1);
  const diagonal = fixture([field(2, 0, 0, 0), field(2, 1024, 1024, 0)]);
  mineOreCell(diagonal.kernel.world, 0, 2);
  diagonal.advance(200);
  expect(readOreCell(diagonal.kernel.world, 0)?.remaining).toBe(0);
});

test("fully depleted isolated deposits cannot regenerate without a nonempty neighbour", () => {
  const { kernel, advance } = fixture([field(2, 1024, 1024, 0)]);
  mineOreCell(kernel.world, 4, 2);
  advance(1000);
  expect(readOreCell(kernel.world, 4)).toEqual({ cell: 4, cap: 2, remaining: 0, regrowthTicks: 0 });
});

test("depletion and fractional schedule serialize, hash and continue identically after restore", () => {
  const { kernel, map, advance } = fixture();
  mineOreCell(kernel.world, 1, 1);
  advance(77);
  const restored = createKernel({ seed: 1, debug: false, map });
  register(restored, oreFeature);
  restored.world.load(kernel.world.serialize());
  restored.tick = kernel.tick;
  expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
  expect(readOreCell(restored.world, 1)?.regrowthTicks).toBe(77);
  const before = checkpointHash(restored);
  mineOreCell(restored.world, 1, 1);
  expect(checkpointHash(restored)).not.toBe(before);
  mineOreCell(kernel.world, 1, 1);
  for (let i = 0; i < 400; i++) {
    step(restored, []);
    step(kernel, []);
  }
  expect(restored.world.serialize()).toEqual(kernel.world.serialize());
  expect(checkpointHash(restored)).toBe(checkpointHash(kernel));
});

test("invalid canonical rows cannot supply ore or regenerate through duplicate cell identities", () => {
  const { kernel, advance } = fixture();
  const duplicate = kernel.world.create();
  kernel.world.add(duplicate, OreCell, { cell: 1, cap: -1, remaining: 1 });
  expect(readOreCell(kernel.world, 1)).toBeUndefined();
  expect(mineOreCell(kernel.world, 1, 1)).toBe(0);
  expect(oreCells(kernel.world).some((value) => value.cell === 1)).toBe(false);
  advance(200);
  expect(kernel.world.get(duplicate, OreCell, "cap")).toBe(-1);
  expect(() => initializeOre(kernel)).toThrow("already initialized");
  const empty = fixture([]);
  expect(() => initializeOre(empty.kernel)).toThrow("already initialized");
  const independent = new World();
  independent.register(OreCell);
  expect(oreCells(independent)).toEqual([]);
});
