import { expect, test } from "bun:test";
import { toDefinition } from "@open-neo-rts/sim/definitions";
import { toMatchResources } from "@open-neo-rts/sim/maps";
import type { CatalogEntry } from "./catalog";
import { spawnAtCell } from "./palette";

test("spawn payload uses cell centres for units and aligned anchors for static footprints", () => {
  const entry = {
    kind: "structure",
    definition: { id: "core.structure:eastern-collective/command-center" },
  } as CatalogEntry;
  for (const rotation of [0, 1, 2, 3]) {
    expect(spawnAtCell(entry, 2, 10, 12, rotation)).toEqual({
      definition: entry.definition.id,
      force: 2,
      x: 10240,
      y: 12288,
      facing: ((rotation + 1) * 16384) & 65535,
    });
  }
  expect(spawnAtCell({ ...entry, kind: "unit" }, 0, 10, 12, 0)).toMatchObject({
    x: 10752,
    y: 12800,
  });
  expect(spawnAtCell({ ...entry, kind: "prop" }, 0, 10, 12, 0)).toMatchObject({
    x: 10240,
    y: 12288,
  });
});

test("node hover and commit use one snap rule for material and oil marker parity", () => {
  const entry: CatalogEntry = {
    kind: "structure",
    name: "Fixture extractor",
    movementDomain: null,
    model: undefined,
    wreck: undefined,
    definition: toDefinition({
      id: "structure:fixture/extractor",
      health: 100,
      footprint: [2, 2],
      nodeKinds: ["materials", "oil"],
    }),
  };
  const resources = toMatchResources([
    { kind: "materials", position: [10, 10], amount: 100 },
    { kind: "oil", position: [20.5, 20.5] },
  ]);
  for (const rotation of [0, 1, 2, 3]) {
    for (const [x, y] of [
      [9, 9],
      [9, 10],
      [10, 9],
      [10, 10],
    ] as const)
      expect(spawnAtCell(entry, 0, x, y, rotation, resources)).toMatchObject({ x: 9216, y: 9216 });
    expect(spawnAtCell(entry, 1, 20, 20, rotation, resources)).toMatchObject({
      x: 19456,
      y: 19456,
      force: 1,
    });
    expect(spawnAtCell(entry, 0, 15, 15, rotation, resources)).toMatchObject({
      x: 15360,
      y: 15360,
    });
  }
});
