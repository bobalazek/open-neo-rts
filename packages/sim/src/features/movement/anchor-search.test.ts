import { expect, spyOn, test } from "bun:test";
import { createHasher, digest } from "@open-neo-rts/deterministic";
import { createMatch, step } from "../../index";
import { createCommandLog, flatMap, terrainMap } from "../../testing";
import { Transform, toDefinition } from "../entities";
import { MoveIntent, MovementFailure } from ".";
import { type AnchorGrid, type AnchorInput, AnchorSearch } from "./anchor-search";
import { compileNavigation } from "./navigation";
import { type AnchorRequest, PathScheduler } from "./path-scheduler";
import { labelReachability, nearestReachable, reachableStart } from "./reachability";
import { clearSegment, type Point, SegmentSweep } from "./segment";

const centre = (grid: AnchorGrid["grid"], cell: number): Point => ({
  x: (cell % grid.width) * 1024 + 512,
  y: Math.floor(cell / grid.width) * 1024 + 512,
});
const profile = (size = 16) => {
  const map = {
    ...flatMap(size),
    objects: [
      {
        definition: "structure:fixture",
        position: [5 * 1024, 5 * 1024] as const,
        rotation: 0,
        owner: "neutral",
      },
    ],
  };
  const grid = compileNavigation(map, [{ id: "structure:fixture", footprint: [3, 3] }], {
    domain: "tracked",
    radiusSubcells: 870,
  });
  return { grid, labels: labelReachability(grid) };
};
const input = (
  position = { x: 4 * 1024 + 100, y: 4 * 1024 + 100 },
  requested = { x: 10 * 1024 + 512, y: 4 * 1024 + 512 },
): AnchorInput => ({ position, requested, bounded: { ...requested }, uniform: true });
const finish = (search: AnchorSearch, limit = 2_000_000) => {
  let work = 0;
  while (!search.finished && work < limit) {
    search.advance();
    work++;
  }
  expect(search.finished).toBe(true);
  return { result: search.result(), work };
};
function reference(data: AnchorGrid, i: AnchorInput) {
  const requested = { x: Math.floor(i.requested.x / 1024), y: Math.floor(i.requested.y / 1024) };
  const start = reachableStart(data.grid, data.labels, i.position, requested);
  if (start === undefined) return undefined;
  const goal = nearestReachable(data.grid, data.labels, start, requested);
  if (goal === undefined) return undefined;
  const cell = Math.floor(i.bounded.y / 1024) * data.grid.width + Math.floor(i.bounded.x / 1024);
  const destination =
    goal === cell && clearSegment(data.grid, centre(data.grid, goal), i.bounded)
      ? i.bounded
      : centre(data.grid, goal);
  return {
    start,
    goal,
    destination,
    direct: i.uniform && clearSegment(data.grid, i.position, destination),
  };
}
const hash = (search: AnchorSearch) => {
  const h = createHasher();
  search.hashInto(h);
  return digest(h);
};

test("pre-inflation cardinal regions match radius-zero connectivity and every accepted physical join", () => {
  const map = terrainMap();
  for (const domain of ["foot", "wheeled", "hover"] as const) {
    const zero = compileNavigation(map, [], { domain, radiusSubcells: 0 });
    for (const radiusSubcells of [0, 256, 870, 1536]) {
      const grid = compileNavigation(map, [], { domain, radiusSubcells });
      expect([...grid.physicalRegions]).toEqual([...labelReachability(zero)]);
      for (const cell of [9, 18, 27, 36, 45, 54])
        for (const offset of [100, 512, 900]) {
          const p = { x: (cell % 8) * 1024 + offset, y: Math.floor(cell / 8) * 1024 + offset };
          for (let target = 0; target < 64; target++) {
            if (grid.cost[target] && clearSegment(grid, p, centre(grid, target)))
              expect(grid.physicalRegions[cell]).toBe(grid.physicalRegions[target]);
          }
        }
    }
  }
});

test("counted results preserve SIM7 goal component, distance, ties, fallback and distant-join semantics", () => {
  const normal = profile();
  const inputs = [
    input(),
    input({ x: 4608, y: 4608 }),
    input({ x: 4196, y: 4196 }, { x: 6 * 1024 + 512, y: 6 * 1024 + 512 }),
    input({ x: 5 * 1024 + 100, y: 5 * 1024 + 100 }),
  ];
  for (const i of inputs)
    expect(finish(new AnchorSearch(normal, i)).result).toEqual(reference(normal, i));
  const flat = flatMap(16),
    level = [...flat.terrain.level];
  for (let y = 0; y < 16; y++) level[y * 16 + 8] = 1;
  const wallGrid = compileNavigation({ ...flat, terrain: { ...flat.terrain, level } }, [], {
    domain: "tracked",
    radiusSubcells: 870,
  });
  const wall = { grid: wallGrid, labels: labelReachability(wallGrid) },
    i = input({ x: 7 * 1024 + 50, y: 8 * 1024 + 512 }, { x: 14 * 1024 + 512, y: 8 * 1024 + 512 });
  expect(finish(new AnchorSearch(wall, i)).result).toEqual(reference(wall, i));
  const farGrid = compileNavigation(flatMap(32), [], { domain: "foot", radiusSubcells: 0 });
  farGrid.cost.fill(0);
  farGrid.cost[340] = 1;
  const far = { grid: farGrid, labels: labelReachability(farGrid) },
    distant = input({ x: 2560, y: 10752 }, { x: 20992, y: 10752 });
  expect(finish(new AnchorSearch(far, distant)).result).toEqual(reference(far, distant));
});

test("partial sweeps and anchor scans restore exact continuation/hash and reject corrupted state", () => {
  const data = profile(),
    i = input();
  for (const steps of [1, 3, 9, 25, 70]) {
    const a = new AnchorSearch(data, i);
    for (let n = 0; n < steps && !a.finished; n++) a.advance();
    const state = a.snapshot(),
      b = AnchorSearch.restore(data, i, JSON.parse(JSON.stringify(state)));
    expect(b.snapshot()).toEqual(state);
    expect(hash(b)).toBe(hash(a));
    while (!a.finished) {
      a.advance();
      b.advance();
      expect(b.snapshot()).toEqual(a.snapshot());
      expect(hash(b)).toBe(hash(a));
    }
    for (const corrupt of [
      { ...state, phase: 99 },
      { ...state, scan: -1 },
      { ...state, preferred: -1 },
      { ...state, goalDistance: -1 },
      { ...state, offset: 999999 },
    ])
      expect(() => AnchorSearch.restore(data, i, corrupt)).toThrow();
  }
  const sweep = new SegmentSweep(data.grid, i.position, { x: 1536, y: 1536 });
  sweep.advance();
  const s = sweep.snapshot();
  const restored = SegmentSweep.restore(data.grid, JSON.parse(JSON.stringify(s)));
  while (sweep.result === "searching") {
    sweep.advance();
    restored.advance();
    expect(restored.snapshot()).toEqual(sweep.snapshot());
  }
  expect(sweep.result).toBe(
    clearSegment(data.grid, i.position, { x: 1536, y: 1536 }) ? "clear" : "blocked",
  );
  expect(() =>
    SegmentSweep.restore(data.grid, { ...s, cursor: data.grid.barriers.length + 1 }),
  ).toThrow();
});

test("shared credits cover partial geometry and allow ready paths beside long anchor jobs", () => {
  const data = profile();
  data.grid.barriers = Array.from({ length: 80 }, () => data.grid.barriers).flat();
  const scheduler = new PathScheduler(data.grid, [0, 2], 37, () => data);
  const request = (entity: number, force: number): AnchorRequest => ({
    entity,
    force,
    issueTick: 0,
    kind: "order",
    input: input(),
  });
  scheduler.submitAnchors([request(1, 0), request(3, 2)]);
  scheduler.submit([{ entity: 2, force: 0, issueTick: 0, kind: "order", start: 17, goal: 18 }]);
  let pathDone = false,
    anchorsDone = 0,
    ticks = 0;
  const advance = spyOn(SegmentSweep.prototype, "advance");
  try {
    while (ticks++ < 2000) {
      advance.mockClear();
      const result = scheduler.tick();
      expect(result.work).toBeLessThanOrEqual(37);
      expect(result.forces.reduce((n, f) => n + f.work, 0)).toBe(result.work);
      expect(advance.mock.calls.length).toBeLessThanOrEqual(result.work);
      if (ticks <= 10)
        expect(
          Math.abs((result.forces[0]?.work ?? 0) - (result.forces[1]?.work ?? 0)),
        ).toBeLessThanOrEqual(1);
      if (result.results.some((r) => r.request.entity === 2 && r.status === "found")) {
        pathDone = true;
        expect(anchorsDone).toBe(0);
      }
      anchorsDone += result.prepared.length;
      if (ticks === 3) {
        const state = scheduler.snapshot(),
          restored = PathScheduler.restore(
            data.grid,
            JSON.parse(JSON.stringify(state)),
            () => data,
          );
        expect(restored.snapshot()).toEqual(state);
        expect(restored.tick()).toEqual(scheduler.tick());
      }
      if (!result.queued) break;
    }
  } finally {
    advance.mockRestore();
  }
  expect(pathDone).toBe(true);
  expect(anchorsDone).toBe(2);
  expect(ticks).toBeLessThan(2000);
});

test("anchor replacement/stop/removal and Force transfer leave no stale preparation result", () => {
  const data = profile(),
    scheduler = new PathScheduler(data.grid, [0, 1], 1, () => data);
  scheduler.submitAnchors([{ force: 0, entity: 1, issueTick: 0, kind: "repath", input: input() }]);
  scheduler.tick();
  const state = scheduler.snapshot();
  expect(state.anchors[0]?.length).toBe(1);
  scheduler.submit([{ force: 1, entity: 1, issueTick: 1, kind: "order", start: 17, goal: 17 }]);
  expect(scheduler.tick().prepared).toEqual([]);
  expect(scheduler.tick().queued).toBe(0);
  scheduler.submitAnchors([{ force: 0, entity: 2, issueTick: 2, kind: "order", input: input() }]);
  scheduler.tick();
  scheduler.cancel(2);
  expect(scheduler.tick().queued).toBe(0);
  expect(scheduler.snapshot().anchors.flat()).toEqual([]);
});

test("occupancy changes restart pending preparation; replacement, stop and removal cancel it", () => {
  const flat = flatMap(64),
    level = [...flat.terrain.level];
  for (let y = 0; y < 64; y++) level[y * 64 + 32] = 1;
  const unit = toDefinition({
      id: "unit:fixture",
      health: 10,
      radius: 0.85,
      movement: { domain: "tracked", speed: 1.8 },
    }),
    block = toDefinition({ id: "structure:fixture", health: 10, footprint: [1, 1] });
  const kernel = createMatch({
    map: { ...flat, terrain: { ...flat.terrain, level } },
    seed: 1,
    debug: true,
    definitions: [unit, block],
    forces: [{ index: 0, faction: "faction:fixture" }],
    seats: [1],
    grants: [{ seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 }],
  });
  const c = createCommandLog(),
    p = { x: 31 * 1024 + 50, y: 32 * 1024 + 512 },
    goal = { x: 60 * 1024 + 512, y: p.y };
  step(kernel, [c.spawn(0, 0, unit.id, 0, p.x, p.y), c.move(0, 1, [1], goal.x, goal.y)]);
  expect(kernel.movement?.snapshot().scheduler.anchors[0]?.length).toBe(1);
  expect(kernel.world.get(1, Transform, "x")).toBe(p.x);
  step(kernel, [c.move(1, 1, [1], 5 * 1024 + 512, p.y)]);
  expect(kernel.movement?.snapshot().routes[0]?.requested.x).toBe(5 * 1024 + 512);
  expect(kernel.world.get(1, Transform, "x")).toBeLessThan(p.x);
  step(kernel, [c.move(2, 1, [1], goal.x, goal.y)]);
  expect(kernel.movement?.snapshot().scheduler.anchors[0]?.length).toBe(1);
  step(kernel, [c.spawn(3, 0, block.id, 0, 10 * 1024, 10 * 1024)]);
  const pending = kernel.movement?.snapshot().scheduler.anchors[0]?.[0];
  expect(pending?.request.kind).toBe("repath");
  expect(pending?.request.issueTick).toBe(3);
  expect(pending?.request.input.requested).toEqual(goal);
  step(kernel, [c.stop(4, 1, [1])]);
  expect(kernel.world.has(1, MoveIntent)).toBe(false);
  expect(kernel.movement?.snapshot().scheduler.anchors.flat()).toEqual([]);
  step(kernel, [c.move(5, 1, [1], goal.x, goal.y)]);
  step(kernel, [{ tick: 6, seat: 0, sequence: 0, type: "debug.remove", payload: { entity: 1 } }]);
  expect(kernel.world.isAlive(1)).toBe(false);
  expect(kernel.movement?.snapshot().scheduler.anchors.flat()).toEqual([]);
  expect(kernel.world.query(MovementFailure)).toEqual([]);
});

test("shuffled anchor admission and mid-sweep scheduler restore keep canonical work and hashes", () => {
  const data = profile(),
    a = new PathScheduler(data.grid, [0, 2], 7, () => data),
    b = new PathScheduler(data.grid, [2, 0], 7, () => data);
  const requests: AnchorRequest[] = [1, 2, 3, 4].map((entity) => ({
    entity,
    force: entity % 2 ? 0 : 2,
    issueTick: 0,
    kind: "order",
    input: input(),
  }));
  a.submitAnchors(requests);
  for (const request of [...requests].reverse()) b.submitAnchors([request]);
  const hashScheduler = (scheduler: PathScheduler) => {
    const h = createHasher();
    scheduler.hashInto(h);
    return digest(h);
  };
  for (let tick = 0; tick < 10; tick++) {
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(hashScheduler(a)).toBe(hashScheduler(b));
    expect(a.tick()).toEqual(b.tick());
  }
  const restored = PathScheduler.restore(
    data.grid,
    JSON.parse(JSON.stringify(a.snapshot())),
    () => data,
  );
  expect(hashScheduler(restored)).toBe(hashScheduler(a));
  for (let tick = 0; tick < 200; tick++) {
    expect(restored.tick()).toEqual(a.tick());
    expect(restored.snapshot()).toEqual(a.snapshot());
  }
  const state = b.snapshot();
  expect(() =>
    PathScheduler.restore(data.grid, { ...state, anchorCursors: [999, 0] }, () => data),
  ).toThrow();
});
