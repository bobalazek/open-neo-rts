import { describe, expect, spyOn, test } from "bun:test";
import { type NavGrid, type PathRequest, PathScheduler, PathSearch } from ".";

function grid(width = 32, height = 1): NavGrid {
  return {
    width,
    height,
    cost: new Uint16Array(width * height).fill(1),
    connections: new Uint8Array(width * height).fill(255),
  };
}

function request(entity: number, force = 0, extra: Partial<PathRequest> = {}): PathRequest {
  return { force, entity, issueTick: 0, kind: "order", start: 0, goal: 31, ...extra };
}

describe("PathScheduler", () => {
  test("one expansion per turn persists its cursor across ticks and skips idle Forces", () => {
    const scheduler = new PathScheduler(grid(), [9, 2, 0, 7], 1);
    scheduler.submit([request(10, 9), request(11, 0), request(12, 2)]);
    const served: number[] = [];
    for (let tick = 0; tick < 9; tick++) {
      const result = scheduler.tick();
      served.push(result.results[0]?.request.force as number);
      expect(result.expansions).toBe(1);
      expect(result.queued).toBe(3);
      expect(result.forces.reduce((sum, force) => sum + force.expansions, 0)).toBe(1);
    }
    expect(served).toEqual([0, 2, 9, 0, 2, 9, 0, 2, 9]);
  });

  test("orders precede repaths, then issue tick and entity break ties", () => {
    const scheduler = new PathScheduler(grid(), [0], 1);
    scheduler.submit([
      request(5, 0, { kind: "repath", goal: 0 }),
      request(2, 0, { issueTick: 5, goal: 0 }),
      request(1, 0, { issueTick: 5, goal: 0 }),
      request(3, 0, { issueTick: 2, goal: 0 }),
    ]);
    expect(Array.from({ length: 4 }, () => scheduler.tick().results[0]?.request.entity)).toEqual([
      3, 1, 2, 5,
    ]);
    expect(scheduler.tick()).toEqual({
      results: [],
      expansions: 0,
      queued: 0,
      forces: [{ force: 0, expansions: 0, completed: 0, queued: 0 }],
    });
  });

  test("an arriving order preempts an active repath without discarding its work", () => {
    const scheduler = new PathScheduler(grid(), [0], 1);
    scheduler.submit([request(1, 0, { kind: "repath" })]);
    expect(scheduler.tick().results[0]?.path).toEqual([0, 1]);
    scheduler.submit([request(2, 0, { goal: 0, issueTick: 1 })]);
    expect(scheduler.tick().results[0]?.request.entity).toBe(2);
    expect(scheduler.tick().results[0]?.path).toEqual([0, 1, 2]);
  });

  test("shuffled same-tick arrival produces identical canonical state, work and results", () => {
    const a = new PathScheduler(grid(), [7, 0, 2], 5);
    const b = new PathScheduler(grid(), [2, 7, 0], 5);
    const requests = [request(4, 7), request(3, 2), request(8), request(2), request(1, 2)];
    a.submit(requests);
    // Separate submissions and object property order must not leak into canonical serialization.
    for (const r of [...requests].reverse())
      b.submit([
        {
          goal: r.goal,
          start: r.start,
          kind: r.kind,
          issueTick: r.issueTick,
          entity: r.entity,
          force: r.force,
        },
      ]);
    for (let tick = 0; tick < 40; tick++) {
      expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
      expect(a.tick()).toEqual(b.tick());
    }
  });

  test("replacement and removal cancel active/queued work across Force transfers", () => {
    const scheduler = new PathScheduler(grid(), [0, 1], 2);
    scheduler.submit([request(1), request(2), request(3, 1)]);
    scheduler.tick();
    scheduler.submit([request(1, 1, { start: 31, goal: 30, issueTick: 1 })]);
    scheduler.cancel(2);
    scheduler.cancel(3);
    scheduler.cancel(99);
    const result = scheduler.tick();
    expect(result.results).toEqual([
      {
        request: request(1, 1, { start: 31, goal: 30, issueTick: 1 }),
        status: "found",
        path: [31, 30],
        cost: 10,
        expansions: 2,
      },
    ]);
    expect(result.queued).toBe(0);
    expect(result.forces).toEqual([
      { force: 0, expansions: 0, completed: 0, queued: 0 },
      { force: 1, expansions: 2, completed: 1, queued: 0 },
    ]);
    expect(scheduler.tick().results).toEqual([]);
  });

  test("the fixed budget bounds actual expansions and constructs each served path only once", () => {
    const scheduler = new PathScheduler(grid(64, 64), [0, 1], 37);
    scheduler.submit([request(1, 0, { goal: 4095 }), request(2, 1, { goal: 4095 })]);
    const advance = spyOn(PathSearch.prototype, "advance");
    const result = spyOn(PathSearch.prototype, "result");
    try {
      const tick = scheduler.tick();
      expect(tick.expansions).toBe(37);
      expect(advance.mock.calls.length).toBe(37);
      expect(advance.mock.results.reduce((sum, call) => sum + (call.value as number), 0)).toBe(37);
      expect(result.mock.calls.length).toBe(2);
      expect(tick.results.map((r) => r.expansions)).toEqual([19, 18]);
      expect(tick.forces.map((f) => f.expansions)).toEqual([19, 18]);
      const snapshot = scheduler.snapshot();
      expect(snapshot.queues.map((q) => q[0]?.search?.closed.reduce((a, b) => a + b, 0))).toEqual([
        19, 18,
      ]);
    } finally {
      advance.mockRestore();
      result.mockRestore();
    }
  });

  test("a depleted queue yields unused budget to other Forces and terminal failures leave the queue", () => {
    const nav = grid(4);
    nav.cost[2] = 0;
    const scheduler = new PathScheduler(nav, [0, 1], 10);
    scheduler.submit([request(1, 0, { goal: 0 }), request(2, 1, { goal: 3 })]);
    const tick = scheduler.tick();
    expect(tick.expansions).toBe(3);
    expect(tick.results.map((r) => [r.status, r.expansions, r.path])).toEqual([
      ["found", 1, [0]],
      ["unreachable", 2, [0, 1]],
    ]);
    expect(tick.queued).toBe(0);
    expect(tick.forces.map((f) => f.completed)).toEqual([1, 1]);
  });

  test("JSON round-trip preserves queued work, every active search and the next Force", () => {
    const nav = grid(8, 8);
    for (let cell = 0; cell < 64; cell++) nav.cost[cell] = 1 + ((cell * 7) % 11);
    const scheduler = new PathScheduler(nav, [0, 1, 2], 7);
    scheduler.submit([
      request(1, 0, { goal: 63 }),
      request(2, 1, { goal: 63 }),
      request(3, 2, { goal: 63 }),
      request(4, 0, { goal: 62 }),
    ]);
    scheduler.tick();
    scheduler.tick();
    const serialized = JSON.stringify(scheduler.snapshot());
    const restored = PathScheduler.restore(nav, JSON.parse(serialized));
    expect(JSON.stringify(restored.snapshot())).toBe(serialized);
    let queued = 4;
    for (let tick = 0; queued > 0 && tick < 100; tick++) {
      const actual = restored.tick();
      expect(actual).toEqual(scheduler.tick());
      expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(scheduler.snapshot()));
      queued = actual.queued;
    }
    expect(queued).toBe(0);
    expect(PathScheduler.restore(nav, scheduler.snapshot()).tick()).toEqual(scheduler.tick());
  });

  test("zero budget and no Forces perform no work and preserve state", () => {
    const scheduler = new PathScheduler(grid(), [1, 0], 0);
    scheduler.submit([request(1)]);
    const before = JSON.stringify(scheduler.snapshot());
    expect(scheduler.tick().expansions).toBe(0);
    expect(JSON.stringify(scheduler.snapshot())).toBe(before);
    const empty = new PathScheduler(grid(), [], 10);
    expect(PathScheduler.restore(grid(), empty.snapshot()).tick()).toEqual({
      results: [],
      expansions: 0,
      queued: 0,
      forces: [],
    });
  });

  test("rejects malformed requests atomically, unknown Forces, duplicate entities and invalid budgets", () => {
    for (const budget of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => new PathScheduler(grid(), [0], budget)).toThrow(RangeError);
    for (const forces of [[0, 0], [-1], [0.5], [0x80000000], [Number.NaN]])
      expect(() => new PathScheduler(grid(), forces, 1)).toThrow(RangeError);
    const scheduler = new PathScheduler(grid(), [0], 1);
    scheduler.submit([request(1)]);
    const before = scheduler.snapshot();
    for (const invalid of [
      request(2, 1),
      request(-1),
      request(1.5),
      request(2, 0, { issueTick: -1 }),
      request(2, 0, { kind: "invalid" as "order" }),
      request(2, 0, { start: 32 }),
      request(2, 0, { goal: -1 }),
    ]) {
      expect(() => scheduler.submit([request(3), invalid])).toThrow(RangeError);
      expect(scheduler.snapshot()).toEqual(before);
    }
    expect(() => scheduler.submit([request(2), request(2)])).toThrow(RangeError);
    expect(() => scheduler.cancel(-1)).toThrow(RangeError);
    expect(scheduler.snapshot()).toEqual(before);
  });

  test("snapshots and caller requests cannot mutate scheduler state", () => {
    const scheduler = new PathScheduler(grid(), [0], 1);
    const r = request(1);
    scheduler.submit([r]);
    r.goal = 0;
    scheduler.tick();
    const state = scheduler.snapshot();
    (state.queues[0]?.[0]?.request as PathRequest).goal = 0;
    expect(scheduler.tick().results[0]?.path).toEqual([0, 1, 2]);
  });

  test("rejects corrupted queue/cursor/search state", () => {
    const nav = grid();
    const scheduler = new PathScheduler(nav, [0, 1], 1);
    scheduler.submit([request(1)]);
    scheduler.tick();
    const state = scheduler.snapshot();
    expect(() => PathScheduler.restore(nav, { ...state, cursor: 2 })).toThrow(RangeError);
    expect(() => PathScheduler.restore(nav, { ...state, forces: [1, 0] })).toThrow(RangeError);
    const pending = state.queues[0]?.[0];
    if (!pending?.search) throw new Error("Missing active search fixture");
    for (const search of [
      { ...pending.search, parent: pending.search.parent.map(() => 0) },
      { ...pending.search, heap: [1, 1] },
      { ...pending.search, cost: [] },
      { ...pending.search, goal: 30 },
      { ...pending.search, status: "found" as const },
    ]) {
      expect(() =>
        PathScheduler.restore(nav, {
          ...state,
          queues: [[{ request: pending.request, search }], []],
        }),
      ).toThrow(RangeError);
    }
  });
});
