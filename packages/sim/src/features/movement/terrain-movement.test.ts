import { expect, test } from "bun:test";
import { checkpointHash, step } from "../../kernel";
import { createMatch, type MatchSetup } from "../../match";
import { createCommandLog, flatMap, terrainMap } from "../../testing";
import { Transform, toDefinition } from "../entities";
import { perimeterPoint } from "../entities/perimeter";
import { MoveIntent } from ".";
import { compileNavigation } from "./navigation";
import { clearSegment, smoothPath } from "./segment";

const unit = toDefinition({
  id: "unit:fixture",
  health: 100,
  radius: 0.25,
  movement: { domain: "foot", speed: 5 },
});
const block = toDefinition({ id: "structure:block", health: 100, footprint: [3, 3] });
const setup = (map = flatMap(16)): MatchSetup => ({
  map,
  seed: 1,
  debug: true,
  forces: [
    { index: 1, faction: "faction:fixture" },
    { index: 2, faction: "faction:fixture" },
  ],
  seats: [1, 2],
  grants: [1, 2].map((seat) => ({ seat, force: seat, scopes: ["unit.orders"], grantedAtTick: 0 })),
  definitions: [unit, block],
});
const point = (kernel: ReturnType<typeof createMatch>, id = 1) => ({
  x: kernel.world.get(id, Transform, "x"),
  y: kernel.world.get(id, Transform, "y"),
});
const run = (kernel: ReturnType<typeof createMatch>, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(kernel, []);
};

test("movement restores cached terrain and active continuations without replaying elapsed ticks", () => {
  const original = setup(flatMap(64)),
    source = createMatch(original),
    c = createCommandLog();
  const commands = [c.spawn(0, 0, block.id, 1, 25 * 1024, 25 * 1024)];
  for (let i = 0; i < 80; i++)
    commands.push(
      c.spawn(0, 0, unit.id, 1, (3 + (i % 10)) * 1024 + 512, (3 + Math.floor(i / 10)) * 1024 + 512),
    );
  commands.push(
    c.move(
      0,
      1,
      Array.from({ length: 80 }, (_, i) => i + 2),
      55 * 1024 + 512,
      55 * 1024 + 512,
    ),
  );
  step(source, commands);
  const dock = perimeterPoint(
    block,
    { x: 25 * 1024, y: 25 * 1024, facing: 0x4000 },
    { side: "north", cell: [1, 0] },
    unit.radiusSubcells!,
  );
  source.movement!.cancel(2);
  source.world.remove(2, MoveIntent);
  source.movement!.order(2, dock);
  const capture = source.movement!.snapshot();
  expect(capture.routes.find((route) => route.entity === 2)?.requested).toMatchObject({
    facing: dock.facing,
  });
  expect(capture.routes.length).toBeGreaterThan(0);
  expect(
    capture.scheduler.queues.flat().length + capture.scheduler.anchors.flat().length,
  ).toBeGreaterThan(0);
  const restored = createMatch(original);
  restored.world.load(source.world.serialize());
  restored.tick = source.tick;
  restored.movement!.load(capture);
  expect(restored.movement!.snapshot()).toEqual(capture);
  expect(checkpointHash(restored)).toBe(checkpointHash(source));
  for (let i = 0; i < 40; i++) {
    step(source, []);
    step(restored, []);
    expect(checkpointHash(restored)).toBe(checkpointHash(source));
  }
  source.world.destroy(1);
  restored.world.destroy(1);
  step(source, []);
  step(restored, []);
  expect(checkpointHash(restored)).toBe(checkpointHash(source));
  expect(restored.movement!.snapshot()).toEqual(source.movement!.snapshot());
  const before = restored.movement!.snapshot();
  for (const invalid of [
    { ...before, extra: 1 },
    { ...before, scheduler: { ...before.scheduler, budget: 1 } },
    { ...before, routes: [{ ...before.routes[0]!, entity: 999999 }] },
  ]) {
    expect(() => restored.movement!.load(invalid)).toThrow();
    expect(restored.movement!.snapshot()).toEqual(before);
  }
});

test("map setup rejects missing original movement metadata before simulation starts", () => {
  const { domain: _domain, ...missingDomain } = unit;
  const { radiusSubcells: _radius, ...missingRadius } = unit;
  expect(() => createMatch({ ...setup(), definitions: [missingDomain] })).toThrow(
    "$.setup.definitions[0].domain",
  );
  expect(() => createMatch({ ...setup(), definitions: [missingRadius] })).toThrow(
    "$.setup.definitions[0].radiusSubcells",
  );
});

test("map spawning refuses undeclared Forces before a path request can reference them", () => {
  const kernel = createMatch(setup());
  const c = createCommandLog();
  expect(
    step(kernel, [c.spawn(0, 0, unit.id, 99, 1536, 1536), c.move(0, 0, [1], 6656, 6656)]).map(
      (entry) => entry.result,
    ),
  ).toEqual(["bad_payload", "accepted"]);
  expect(kernel.world.query(Transform)).toEqual([]);
});

test("a move to the current position completes without turning, including a zero turn rate", () => {
  for (const turnRate of [0, 65536]) {
    const kernel = createMatch({ ...setup(), definitions: [{ ...unit, turnRate }] });
    const c = createCommandLog();
    step(kernel, [c.spawn(0, 0, unit.id, 1, 1536, 1536, 16384), c.move(0, 1, [1], 1536, 1536)]);
    expect(kernel.world.has(1, MoveIntent)).toBe(false);
    expect(kernel.world.get(1, Transform, "facing")).toBe(16384);
    expect(kernel.movement?.snapshot().routes).toEqual([]);
  }
});

test("map movement follows cleared smoothed waypoints around blockers and cancels reordered/stopped/removed work", () => {
  const kernel = createMatch(setup());
  const c = createCommandLog();
  step(kernel, [
    c.spawn(0, 0, block.id, 1, 5 * 1024, 5 * 1024),
    c.spawn(0, 0, unit.id, 1, 2 * 1024 + 512, 6 * 1024 + 512),
    c.move(0, 1, [2], 12 * 1024 + 512, 6 * 1024 + 512),
  ]);
  if (!kernel.map) throw new Error("Expected a map");
  const grid = compileNavigation(
    kernel.map,
    [unit, block],
    { domain: "foot", radiusSubcells: 256 },
    [{ definition: block.id, position: [5 * 1024, 5 * 1024], rotation: 270, owner: "neutral" }],
  );
  let previous = point(kernel, 2);
  for (let i = 0; i < 150; i++) {
    step(kernel, []);
    const next = point(kernel, 2);
    expect(clearSegment(grid, previous, next)).toBe(true);
    previous = next;
  }
  expect(point(kernel, 2)).toEqual({ x: 12 * 1024 + 512, y: 6 * 1024 + 512 });
  expect(kernel.world.has(2, MoveIntent)).toBe(false);
  step(kernel, [c.move(151, 1, [2], 2 * 1024, 2 * 1024)]);
  step(kernel, [c.move(152, 1, [2], 11 * 1024, 11 * 1024), c.stop(152, 1, [2])]);
  const stopped = point(kernel, 2);
  run(kernel, 10);
  expect(point(kernel, 2)).toEqual(stopped);
  expect(kernel.movement?.snapshot().scheduler.queues.flat()).toEqual([]);
  step(kernel, [c.move(163, 1, [2], 2 * 1024, 2 * 1024)]);
  step(kernel, [{ tick: 164, seat: 0, sequence: 0, type: "debug.remove", payload: { entity: 2 } }]);
  expect(kernel.movement?.snapshot().routes).toEqual([]);
});

test("ramp connections, unreachable destinations, bounds and aircraft use original profiles", () => {
  const air = toDefinition({
    id: "unit:air",
    health: 100,
    radius: 0.5,
    movement: { domain: "air", speed: 20 },
  });
  const match = setup(terrainMap());
  const kernel = createMatch({ ...match, definitions: [unit, block, air] });
  const c = createCommandLog();
  step(kernel, [
    c.spawn(0, 0, unit.id, 1, 2 * 1024 + 512, 1024 + 512),
    c.move(0, 1, [1], 5 * 1024 + 512, 1024 + 512),
    c.spawn(0, 0, air.id, 1, 1024, 1024),
    c.move(0, 1, [2], 524287, 524287),
  ]);
  run(kernel, 100);
  expect(point(kernel)).toEqual({ x: 5 * 1024 + 512, y: 1024 + 512 });
  expect(point(kernel, 2)).toEqual({ x: 8 * 1024 - 512, y: 8 * 1024 - 512 });
  step(kernel, [c.move(101, 1, [1], 7 * 1024, 7 * 1024)]);
  run(kernel, 150);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  const goal = point(kernel);
  expect(goal.x < 6 * 1024 || goal.y < 6 * 1024).toBe(true);
});

test("straight line smoothing has exact circular clearance, not centre-only visibility", () => {
  const map = {
    ...flatMap(8),
    objects: [
      {
        definition: block.id,
        position: [3 * 1024, 3 * 1024] as const,
        rotation: 0,
        owner: "neutral",
      },
    ],
  };
  const grid = compileNavigation(map, [block], { domain: "foot", radiusSubcells: 256 });
  const a = { x: 1536, y: 1536 };
  const b = { x: 6656, y: 2560 };
  expect(smoothPath(grid, a, [{ x: 2560, y: 1536 }, b])).toEqual([b]);
  expect(clearSegment(grid, { x: 2560, y: 2560 }, { x: 6656, y: 6656 })).toBe(false);
});

test("200 units share one quota across Forces and make deterministic progress on 128 cells", () => {
  const match = setup(flatMap(128));
  const a = createMatch(match);
  const b = createMatch(match);
  const c = createCommandLog();
  const commands = [
    ...c.spawnArmy(0, 0, 100, unit.id, 1, 4608, 4608),
    ...c.spawnArmy(0, 0, 100, unit.id, 2, 4608, 4608),
    c.move(
      0,
      1,
      Array.from({ length: 100 }, (_, i) => i + 1),
      123392,
      123392,
    ),
    c.move(
      0,
      2,
      Array.from({ length: 100 }, (_, i) => i + 101),
      123392,
      123392,
    ),
  ];
  step(a, commands);
  step(b, [...commands].reverse());
  expect(a.world.query(MoveIntent).every((id) => point(a, id).x > 4608)).toBe(true);
  run(a, 120);
  run(b, 120);
  expect(checkpointHash(a)).toBe(checkpointHash(b));
  expect(a.world.query(MoveIntent).every((id) => point(a, id).x > 4608)).toBe(true);
  expect(point(a, 200).x).toBeGreaterThan(4608);
  const snapshot = a.movement?.snapshot();
  expect(snapshot?.scheduler.budget).toBe(4096);
  expect(snapshot?.scheduler.queues.flat().length).toBeLessThan(200);
});
