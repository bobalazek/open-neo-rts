import { expect, test } from "bun:test";
import dragon from "../../../../../content/core/factions/eastern-collective/units/dragon-tank/unit.json";
import { catalogEntry } from "./catalog";
import { debugLink, parseDebugLink } from "./links";

const maps = [{ id: "core.map:sandbox-flat", width: 64, height: 64 }];
const catalog = [catalogEntry(dragon)];
const definition = "core.unit:eastern-collective/dragon-tank";

test("initial debug links preserve full factions, colours, controller and spawns", () => {
  const initial = parseDebugLink(
    `?map=core.map:sandbox-flat&seed=4294967295&force=eastern-collective@123456;core.faction:phoenix-initiative@abcdef&controlled=1&spawn=${definition}@12,20,1,3;${definition}@30,31,0,0`,
    maps,
    catalog,
  );
  expect(initial.forces[1]).toEqual({
    index: 1,
    faction: "core.faction:phoenix-initiative",
    color: "#abcdef",
  });
  expect(initial.controlled).toBe(1);
  expect(initial.spawns[0]).toMatchObject({ x: 12, y: 20, force: 1, rotation: 3 });
  const link = debugLink("https://example.test/debug?unrelated=old#fragment", initial);
  expect(parseDebugLink(new URL(link).search, maps, catalog)).toEqual(initial);
  const short = parseDebugLink(
    `?force=eastern-collective&spawn=${definition}@40,12`,
    maps,
    catalog,
  );
  expect(short.spawns[0]).toMatchObject({ x: 40, y: 12, force: 0, rotation: 0 });
  expect(parseDebugLink("", maps, catalog).spawns).toEqual([]);
});

test("unknown, duplicate, malformed and out-of-bounds link inputs fail as a whole", () => {
  for (const search of [
    "?unknown=1",
    "?map=missing",
    "?seed=1&seed=2",
    "?force=eastern-collective&force=phoenix-initiative",
    "?seed=01",
    "?seed=4294967296",
    "?force=missing",
    "?force=eastern-collective@red",
    "?controlled=1",
    "?spawn=",
    "?spawn=missing@2,3",
    `?spawn=${definition}@64,1`,
    `?spawn=${definition}@1.5,2`,
    `?spawn=${definition}@1,2,1,0`,
    `?spawn=${definition}@1,2,0,4`,
    `?spawn=${definition}@1,2;${definition}@1,2`,
    `?spawn=${definition}@1,2&spawn=${definition}@3,4`,
  ])
    expect(() => parseDebugLink(search, maps, catalog)).toThrow();
});
