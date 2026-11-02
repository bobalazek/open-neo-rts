import { expect, test } from "bun:test";
import type {
  GameplayDefinition,
  PresentedEntity,
  PresentedGhost,
  SeatSnapshot,
} from "@open-neo-rts/sim";
import { minimapMarkers, minimapPoint, minimapVision, ownBase } from "./minimap-model";

const unit: GameplayDefinition = {
  id: "core.unit:fixture/soldier",
  kind: "unit",
  role: "combat",
  health: 100,
  speed: 10,
  turnRate: 1,
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
};
const base: GameplayDefinition = {
  ...unit,
  id: "core.structure:fixture/base",
  kind: "structure",
  role: "headquarters",
  footprint: [2, 3],
};
const definitions = new Map([
  [unit.id, unit],
  [base.id, base],
]);
const live = (
  handle: string,
  definition: string,
  force: number,
  x: number,
  y: number,
): PresentedEntity => ({
  handle,
  definition,
  force,
  x: x * 1024,
  y: y * 1024,
  facing: 0x4000,
  health: 100,
  maxHealth: 100,
  order: null,
});
const snapshot = (): SeatSnapshot => ({
  tick: 0,
  mode: "controlled",
  entities: [],
  ghosts: [],
  fog: [{ group: 0, width: 8, height: 8, cells: new Uint8Array(64) }],
});

test("minimap fog is copied, unioned and fails closed for absent or mismatched grids", () => {
  const value = snapshot();
  const first = value.fog?.[0];
  if (first) first.cells[9] = 1;
  value.fog?.push({
    group: 1,
    width: 8,
    height: 8,
    cells: Uint8Array.from({ length: 64 }, (_, i) => (i === 9 ? 2 : 0)),
  });
  const union = minimapVision(value, 8, 8);
  expect(union[9]).toBe(2);
  union[9] = 0;
  expect(first?.cells[9]).toBe(1);
  expect(minimapVision(value, 4, 4).every((cell) => cell === 0)).toBe(true);
  expect(minimapVision({ ...value, fog: undefined }, 8, 8).every((cell) => cell === 0)).toBe(true);
  expect(minimapVision({ ...value, mode: "debug-no-fog" }, 8, 8).every((cell) => cell === 0)).toBe(
    true,
  );
});

test("minimap exposes only permitted visible enemies, own units and explicit explored structure ghosts", () => {
  const value = snapshot();
  if (value.fog?.[0]) {
    value.fog[0].cells[9] = 2;
    value.fog[0].cells[27] = 1;
  }
  value.entities = [
    live("own", unit.id, 0, 7, 7),
    live("seen", unit.id, 1, 1, 1),
    live("hidden", unit.id, 1, 2, 2),
    live("fog-unit", unit.id, 1, 3, 3),
    { ...live("dead", unit.id, 0, 1, 1), health: 0 },
  ];
  const ghost = (
    handle: string,
    definition: string,
    group: number,
    x: number,
    y: number,
  ): PresentedGhost => ({ ...live(handle, definition, 1, x, y), group, seen: 0 });
  value.ghosts = [
    ghost("remembered", base.id, 0, 3, 3),
    ghost("unit-memory", unit.id, 0, 3, 3),
    ghost("unexplored", base.id, 0, 5, 5),
    ghost("foreign-group", base.id, 2, 3, 3),
  ];
  expect(minimapMarkers(value, definitions, 8, 8, 0).map((marker) => marker.handle)).toEqual([
    "remembered",
    "own",
    "seen",
  ]);
  expect(minimapMarkers(value, definitions, 8, 8, 0)[0]).toMatchObject({
    kind: "ghost",
    x: 4,
    y: 4.5,
  });
  expect(minimapMarkers({ ...value, mode: "debug-no-fog" }, definitions, 8, 8, 0)).toEqual([]);
});

test("minimap input maps rectangular/scaled bounds and clamps captured drags to legal map cells", () => {
  const bounds = { left: 100, top: 50, width: 220, height: 110 };
  expect(minimapPoint(210, 105, bounds, 128, 64)).toEqual({ x: 64, y: 32 });
  expect(minimapPoint(999, -100, bounds, 128, 64)).toEqual({ x: 127, y: 0 });
  expect(minimapPoint(210, 105, { ...bounds, width: 0 }, 128, 64)).toBeNull();
  expect(minimapPoint(Number.NaN, 105, bounds, 128, 64)).toBeNull();
});

test("Home chooses current living completed own HQ, rotates its centre, and never uses another Force or ghost", () => {
  const value = snapshot();
  value.entities = [
    live("enemy", base.id, 1, 6, 6),
    { ...live("site", base.id, 0, 1, 1), constructionSite: true },
    { ...live("hq", base.id, 0, 2, 2), facing: 0x8000 },
  ];
  expect(ownBase(value, definitions, 0)).toEqual({ x: 3.5, y: 3 });
  value.entities = value.entities.map((entity) =>
    entity.handle === "hq" ? { ...entity, health: 0 } : entity,
  );
  expect(ownBase(value, definitions, 0)).toBeNull();
});
