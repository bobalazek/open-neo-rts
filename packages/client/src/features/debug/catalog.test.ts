import { expect, test } from "bun:test";
import command from "../../../../../content/core/factions/alliance-of-free-nations/structures/command-hub/structure.json";
import dragon from "../../../../../content/core/factions/eastern-collective/units/dragon-tank/unit.json";
import bush from "../../../../../content/core/props/temperate/bush/prop.json";
import { catalogEntry } from "./catalog";

test("catalog preserves original names and converts each object kind once", () => {
  const unit = catalogEntry(dragon);
  expect(unit.name).toBe("Dragon Tank");
  expect(unit.definition).toMatchObject({
    id: "core.unit:eastern-collective/dragon-tank",
    health: 900,
    speed: 92,
  });
  expect(unit.model).toBeUndefined();
  expect(Array.from(catalogEntry(command).definition.footprint ?? [])).toEqual(command.footprint);
  expect(catalogEntry(bush).definition.blocks).toBe("nothing");
});

test("raw metadata cannot bypass the original schema before conversion", () => {
  expect(() => catalogEntry({ ...dragon, radius: -1 })).toThrow("Invalid");
  expect(() => catalogEntry({ ...bush, presentation: { model: 12 } })).toThrow("Invalid");
  expect(() => catalogEntry({ id: "unit:made-up", health: 10 })).toThrow("Invalid");
});
