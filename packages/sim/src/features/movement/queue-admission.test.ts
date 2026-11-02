import { expect, test } from "bun:test";
import { addString, createHasher, digest } from "@open-neo-rts/deterministic";
import { flatMap } from "../../testing/maps";
import { type AnchorInput, indexAnchors } from "./anchor-search";
import { compileNavigation } from "./navigation";
import {
  type AnchorRequest,
  type PathRequest,
  PathScheduler,
  type PathTickResult,
} from "./path-scheduler";
import { labelReachability } from "./reachability";

test("queue admission preserves pre-optimization snapshots, hashes, cursors and complete work results", () => {
  const map = flatMap(8),
    level = [...map.terrain.level];
  for (let y = 0; y < 8; y++) level[y * 8 + 4] = 1;
  const grid = compileNavigation({ ...map, terrain: { ...map.terrain, level } }, [], {
    domain: "foot",
    radiusSubcells: 256,
  });
  const data = indexAnchors(grid, labelReachability(grid));
  let scheduler = new PathScheduler(grid, [7, 0, 2], 5, () => data);
  const receipts: string[] = [];
  const path = (entity: number, force = 0, extra: Partial<PathRequest> = {}): PathRequest => ({
    entity,
    force,
    issueTick: 0,
    kind: "order",
    start: 18,
    goal: 27,
    ...extra,
  });
  const anchor = (
    entity: number,
    force = 0,
    extra: Partial<Omit<AnchorRequest, "input">> = {},
    input: Partial<AnchorInput> = {},
  ): AnchorRequest => ({
    entity,
    force,
    issueTick: 0,
    kind: "order",
    ...extra,
    input: {
      position: { x: 2048, y: 2048 },
      requested: { x: 3584, y: 3584 },
      bounded: { x: 3584, y: 3584 },
      uniform: false,
      ...input,
    },
  });
  const mark = (label: string, result: PathTickResult[] | null = null) => {
    const h = createHasher();
    scheduler.hashInto(h);
    const record = { label, state: scheduler.snapshot(), hash: digest(h).hex, result };
    const receipt = createHasher();
    addString(receipt, JSON.stringify(record));
    receipts.push(digest(receipt).hex);
  };
  scheduler.cancel(0);
  expect(() => scheduler.cancel(-1)).toThrow(RangeError);
  mark("empty cancellation keeps validation");
  scheduler.submitAnchors([
    anchor(30, 2, { kind: "repath", issueTick: 2 }),
    anchor(10, 0, { issueTick: 4 }),
    anchor(20, 2, { issueTick: 1 }),
    anchor(40, 7, { kind: "repath" }),
  ]);
  mark("mixed initial batch");
  mark("partial turns", [scheduler.tick(), scheduler.tick()]);
  scheduler.submitAnchors([anchor(9, 2)]);
  mark("singleton inserts ahead of cursor");
  scheduler.submitAnchors([
    anchor(20, 7, { issueTick: 3 }),
    anchor(8, 2, { kind: "repath" }),
    anchor(9, 2, { kind: "repath", issueTick: 4 }),
  ]);
  mark("batch replacement observes append-before-sort order");
  scheduler.submit([path(30, 0, { issueTick: 7 }), path(5, 7, { start: 0, goal: 7 })]);
  mark("anchor to path Force transfer");
  scheduler.cancel(999);
  scheduler.cancel(10);
  scheduler.cancel(8);
  mark("positive and negative cancellation");
  mark(
    "mixed partial work",
    Array.from({ length: 5 }, () => scheduler.tick()),
  );
  scheduler = PathScheduler.restore(
    grid,
    JSON.parse(JSON.stringify(scheduler.snapshot())),
    () => data,
  );
  mark("restored derived membership");
  scheduler.submitAnchors([
    anchor(100, 0, { issueTick: 2 }),
    anchor(101, 2, {}, { uniform: true }),
    anchor(102, 7, {}, { position: { x: 0, y: 0 } }),
  ]);
  scheduler.submit([path(99, 2, { start: 0, goal: 7 })]);
  mark("direct failure and Astar admissions");
  const completed: PathTickResult[] = [];
  for (let tick = 0; tick < 200; tick++) {
    const result = scheduler.tick();
    completed.push(result);
    if (!result.queued) break;
  }
  expect(completed.at(-1)?.queued).toBe(0);
  expect(completed.some((tick) => tick.prepared.some((entry) => entry.result === null))).toBe(true);
  expect(completed.some((tick) => tick.prepared.some((entry) => entry.result?.direct))).toBe(true);
  mark("all completion and conversion work", completed);
  for (const entity of [5, 9, 10, 20, 30, 40, 99, 100, 101, 102, 999]) scheduler.cancel(entity);
  mark("completed membership removed");
  scheduler = PathScheduler.restore(
    grid,
    JSON.parse(JSON.stringify(scheduler.snapshot())),
    () => data,
  );
  scheduler.submitAnchors([anchor(9, 7)]);
  scheduler.submit([path(101, 0)]);
  mark("reused IDs after empty restore");
  mark(
    "final mixed work",
    Array.from({ length: 12 }, () => scheduler.tick()),
  );
  // Frozen from main e641b8a before admission changes. Each receipt includes the
  // complete observable snapshot, scheduler hash and all returned per-tick arrays.
  expect(receipts).toEqual([
    "d53b8b4151004259",
    "88f088bc29d97c57",
    "7ecfed8b22be7c2c",
    "e37a595964af9cfd",
    "db15189d5d1da78b",
    "f086355e24e334f0",
    "d77aeac2f9cefd2e",
    "cfbaca124eedb2fb",
    "6c0d315b4cbe0e61",
    "b5cb4fb23c4fb24e",
    "44ec5e86ec04b698",
    "f7d35fc292c0a9a0",
    "ff2cfee6993c54a7",
    "8e737b0ac7567d74",
  ]);
});
