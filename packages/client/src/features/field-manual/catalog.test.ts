import { expect, test } from "bun:test";
import type { GameplayWeapon } from "@open-neo-rts/sim";
import { damageModifiers, type ManualEntry, searchManual } from "./catalog";

function entry(name: string, kind: "unit" | "structure", description: string): ManualEntry {
  return {
    name,
    description,
    gameplay: {
      id: `core.${kind}:eastern-collective/${name.toLowerCase().replaceAll(" ", "-")}`,
      kind,
      health: 100,
      speed: 64,
      turnRate: 0,
      role: kind === "unit" ? "combat" : "production",
      tags: [],
      construction: null,
      requires: [],
      producedBy: [],
      produces: [],
      builds: [],
      spawnsWith: [],
      weapons: [],
      abilities: [],
      research: [],
      adjacency: [],
    },
  };
}

test("manual search combines authored names, descriptions and role terms with category filtering", () => {
  const rows = [
    entry("Dragon Tank", "unit", "Heavy siege vehicle"),
    entry("War Factory", "structure", "Produces vehicles"),
  ];
  expect(searchManual(rows, "  DRAGON  siege ")).toEqual([rows[0]!]);
  expect(searchManual(rows, "combat", "unit")).toEqual([rows[0]!]);
  expect(searchManual(rows, "vehicle", "structure")).toEqual([rows[1]!]);
  expect(searchManual(rows, "dragon", "structure")).toEqual([]);
  expect(searchManual(rows, "unmatched")).toEqual([]);
  expect(searchManual(rows, "")).toEqual(rows);
});

test("manual armour modifiers preserve explicit zero, per-component defaults and non-damage exclusions", () => {
  const weapon: GameplayWeapon = {
    id: "test",
    targets: ["ground"],
    rangeSubcells: [0, 5120],
    reloadTicks: 20,
    projectile: { kind: "bullet" },
    warheads: [
      {
        type: "damage",
        amount: 90,
        versusPerMille: { heavy: 0, light: 1500, default: 500 },
        tags: [],
      },
      { type: "disable", tags: [] },
      { type: "damage", amount: 10, tags: [] },
    ],
  };
  const rows = damageModifiers(weapon);
  expect(rows.find((row) => row.warhead === 1 && row.armor === "heavy")?.percent).toBe(0);
  expect(rows.find((row) => row.warhead === 1 && row.armor === "light")?.percent).toBe(150);
  expect(rows.find((row) => row.warhead === 1 && row.armor === "structure")?.percent).toBe(50);
  expect(rows.some((row) => row.warhead === 2)).toBe(false);
  expect(rows.filter((row) => row.warhead === 3).every((row) => row.percent === 100)).toBe(true);
});
