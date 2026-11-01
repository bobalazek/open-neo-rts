import { expect, test } from "bun:test";
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
