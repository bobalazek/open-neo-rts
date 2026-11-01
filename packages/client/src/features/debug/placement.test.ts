import { expect, test } from "bun:test";
import type { DebugSpawn } from "@open-neo-rts/sim";
import type { PlacementDiagnostic } from "../../worker";
import { createPlacementQueries } from "./placement";

test("placement coalesces rotation/tick changes and discards stale or disposed replies", async () => {
  const requests: { spawn: DebugSpawn; resolve: (result: PlacementDiagnostic) => void }[] = [];
  const painted: PlacementDiagnostic[] = [];
  let cleared = 0;
  const queries = createPlacementQueries(
    (spawn) => new Promise((resolve) => requests.push({ spawn, resolve })),
    () => {
      cleared++;
    },
    (_spawn, result) => painted.push(result),
    (error) => {
      throw error;
    },
  );
  const spawn = {
    definition: "core.structure:eastern-collective/shipyard",
    force: 0,
    x: 8192,
    y: 8192,
    facing: 16384,
  };
  const firstRun = queries.update(spawn, 0);
  void queries.update({ ...spawn, facing: 32768 }, 1);
  const first = requests[0];
  if (!first) throw new Error("No first query");
  first.resolve({ tick: 0, ok: true, cells: [{ x: 8, y: 8, rule: "land" }] });
  await Promise.resolve();
  const latest = requests[1];
  if (!latest) throw new Error("No coalesced query");
  const authoritative: PlacementDiagnostic = {
    tick: 1,
    ok: false,
    cells: [{ x: 8, y: 8, rule: "water", failure: "not_deep_water" }],
  };
  latest.resolve(authoritative);
  await firstRun;
  expect(requests.map((request) => request.spawn.facing)).toEqual([16384, 32768]);
  expect(painted).toEqual([authoritative]);
  const refreshed = queries.update(latest.spawn, 2);
  const occupancy = requests[2];
  if (!occupancy) throw new Error("No occupancy refresh");
  queries.dispose();
  occupancy.resolve({ tick: 2, ok: true, cells: [] });
  await refreshed;
  expect(painted).toEqual([authoritative]);
  expect(cleared).toBe(4);
});
