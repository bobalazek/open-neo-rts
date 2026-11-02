import { expect, test } from "bun:test";
import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { createControlGroups } from "./groups";
import { affordable, footprintCells, idleBuilder, recipeLock, selectedEntities } from "./hud-model";

const definition: GameplayDefinition = {
  id: "core.structure:fixture/producer",
  kind: "structure",
  health: 100,
  speed: 0,
  turnRate: 0,
  tags: [],
  construction: { cost: { credits: 100, materials: 20 }, buildTicks: 40 },
  requires: ["core.structure:fixture/hq"],
  producedBy: [],
  produces: [],
  builds: [],
  spawnsWith: [],
  weapons: [],
  abilities: [],
  research: [],
  adjacency: [],
  footprint: [3, 2],
};
const entity: PresentedEntity = {
  handle: "e1",
  definition: "core.structure:fixture/hq",
  force: 0,
  x: 1024,
  y: 1024,
  facing: 0,
  health: 100,
  maxHealth: 100,
  order: null,
};
const snapshot = (entities: PresentedEntity[] = [entity]): SeatSnapshot => ({
  tick: 0,
  mode: "controlled",
  entities,
  banks: [
    {
      force: 0,
      resources: { credits: 100, materials: 20, "industrial-capacity": 0, "salvage-points": 0 },
    },
  ],
});

test("HUD recipe advice requires completed owned structures and every stock; missing prices stay unavailable", () => {
  expect(recipeLock(definition, snapshot(), 0)).toBeUndefined();
  expect(affordable(definition, snapshot(), 0)).toBe(true);
  for (const changed of [{ constructionSite: true as const }, { force: 1 }, { health: 0 }])
    expect(recipeLock(definition, snapshot([{ ...entity, ...changed }]), 0)).toBe("requirements");
  expect(recipeLock({ ...definition, construction: null }, snapshot(), 0)).toBe("unpriced");
  expect(affordable(definition, { ...snapshot(), banks: [] }, 0)).toBe(false);
  const missingMaterials = snapshot();
  missingMaterials.banks = [
    {
      force: 0,
      resources: { credits: 100, materials: 19, "industrial-capacity": 0, "salvage-points": 0 },
    },
  ];
  expect(affordable(definition, missingMaterials, 0)).toBe(false);
  expect(
    affordable(
      { ...definition, construction: { cost: { credits: 0 }, buildTicks: 0 } },
      snapshot(),
      0,
    ),
  ).toBe(true);
});

test("HUD selection never recovers absent handles and assigned builders are not idle", () => {
  expect(selectedEntities(snapshot(), ["e1", "hidden-enemy", "e1"])).toEqual([entity]);
  const builder = { ...definition, kind: "unit" as const, role: "builder" };
  expect(idleBuilder(entity, builder)).toBe(true);
  expect(
    idleBuilder({ ...entity, constructionOrder: { site: "e2", state: "blocked" } }, builder),
  ).toBe(false);
  expect(
    idleBuilder(
      { ...entity, repairOrder: { target: "e2", state: "funds", workRemainder: 0 } },
      builder,
    ),
  ).toBe(false);
  expect(idleBuilder({ ...entity, health: 0 }, builder)).toBe(false);
});

test("advisory non-square footprints rotate at the same selected origin", () => {
  expect(footprintCells(definition, 10, 20, 0)).toEqual([
    { x: 10, y: 20 },
    { x: 11, y: 20 },
    { x: 12, y: 20 },
    { x: 10, y: 21 },
    { x: 11, y: 21 },
    { x: 12, y: 21 },
  ]);
  expect(footprintCells(definition, 10, 20, 1)).toEqual([
    { x: 10, y: 20 },
    { x: 11, y: 20 },
    { x: 10, y: 21 },
    { x: 11, y: 21 },
    { x: 10, y: 22 },
    { x: 11, y: 22 },
  ]);
});

test("control groups copy, add, replace and drop dead or no-longer-owned handles", () => {
  const groups = createControlGroups();
  const selected = ["e1", "e2"];
  groups.set(1, selected);
  selected.push("e3");
  groups.set(1, ["e2", "e4"], true);
  expect(groups.get(1)).toEqual(["e1", "e2", "e4"]);
  const copied = groups.get(1);
  copied.length = 0;
  expect(groups.get(1)).toHaveLength(3);
  groups.prune(new Set(["e2"]));
  expect(groups.get(1)).toEqual(["e2"]);
  groups.set(1, ["e5"]);
  expect(groups.get(1)).toEqual(["e5"]);
  groups.set(-1, ["invalid"]);
  expect(groups.get(-1)).toEqual([]);
});
