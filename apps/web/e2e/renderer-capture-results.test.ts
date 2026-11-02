import { expect, test } from "bun:test";
import dragon from "../../../content/core/factions/eastern-collective/units/dragon-tank/unit.json";
import { catalogEntry } from "../../../packages/client/src/features/debug/catalog";
import { spawnAtCell } from "../../../packages/client/src/features/debug/palette";
import {
  oppositeBase,
  performanceScene,
} from "../../../packages/client/src/features/debug/performance-scene";
import type { Command } from "../../../packages/sim/src/commands";
import {
  type CaptureSamples,
  originalSceneCommands,
  summarizeCapture,
} from "./renderer-capture-results";

test("original commands match real scene helpers, including UI-to-binary facing", () => {
  const spawns = performanceScene().spawns,
    entry = catalogEntry(dragon);
  const commands: Command[] = [
    ...spawns.map(
      (s, i): Command => ({
        tick: 0,
        seat: 1,
        sequence: i,
        type: "debug.spawn",
        payload: spawnAtCell(entry, s.force, s.x, s.y, s.rotation),
      }),
    ),
    ...spawns.map(
      (s, i): Command => ({
        tick: 1,
        seat: 1,
        sequence: 200 + i,
        type: "unit.move",
        payload: { entities: [i + 1], ...oppositeBase(s.x, s.y) },
      }),
    ),
  ];
  expect(originalSceneCommands(commands)).toBe(true);
  const first = commands[0];
  if (first?.type !== "debug.spawn") throw new Error("Missing spawn");
  first.payload.facing = 0;
  expect(originalSceneCommands(commands)).toBe(false);
  first.payload.facing = 16384;
  const move = commands[200];
  if (move?.type !== "unit.move") throw new Error("Missing move");
  move.payload.x++;
  expect(originalSceneCommands(commands)).toBe(false);
});

function samples(): CaptureSamples {
  const first = Array.from({ length: 200 }, (_, i) => ({ handle: `e${i}`, x: i, y: 0 }));
  return {
    begin: 100,
    nominalEnd: 160,
    firstTick: 2,
    lastTick: 3,
    first,
    last: first.map((p) => ({ ...p, y: 1 })),
    frames: [
      { at: 100, frameMs: 999, drawCalls: 1, tick: 2, focused: true },
      { at: 120, frameMs: 20, drawCalls: 250, tick: 2, focused: true },
      { at: 140, frameMs: 20, drawCalls: 250, tick: 3, focused: true },
      { at: 170, frameMs: 999, drawCalls: 1, tick: 999, focused: false },
    ],
    workers: [100, 130, 150].map((at, i) => ({
      at,
      tick: i + 2,
      tickMs: i + 1,
      count: 200,
      orders: 200,
      paused: false,
      speed: 1,
    })),
    frustums: [110, 150].map((at) => ({
      at,
      roots: 200,
      contained: 200,
      parts: 4400,
      maxClipXY: 0.5,
    })),
    focusLosses: [165],
  };
}
test("frame, worker and frustum observations share the final completed-frame window", () => {
  const result = summarizeCapture(samples());
  expect(result.reasons).toEqual([]);
  expect(result.window).toMatchObject({ begin: 100, end: 140, durationMs: 40 });
  expect(result.frame).toMatchObject({ samples: 2, mean: 20 });
  expect(result.workers.map((w) => w.at)).toEqual([100, 130]);
  expect(result.frustums.map((v) => v.at)).toEqual([110]);
  expect(result.workerHz).toBe(25);
  expect(result.displaced).toBe(200);
});
test("retained move orders cannot hide stalled units or a brief focus loss", () => {
  const data = samples();
  data.last = data.first.map((p) => ({ ...p }));
  data.focusLosses = [135];
  const result = summarizeCapture(data);
  expect(result.displaced).toBe(0);
  expect(result.reasons).toContain("Some units did not displace during the measured window");
  expect(result.reasons).toContain("The page lost foreground focus");
});
