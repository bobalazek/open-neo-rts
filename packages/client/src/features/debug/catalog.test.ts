import { expect, spyOn, test } from "bun:test";
import command from "../../../../../content/core/factions/alliance-of-free-nations/structures/command-hub/structure.json";
import dragon from "../../../../../content/core/factions/eastern-collective/units/dragon-tank/unit.json";
import bush from "../../../../../content/core/props/temperate/bush/prop.json";
import { catalogEntry, resolveEntityModel } from "./catalog";

test("authored remains request their own catalog URL and never gain a live structure foundation", async () => {
  const fakeFetch = Object.assign(
    async (_input: unknown) => new Response(new Uint8Array([1, 2, 3])),
    { preconnect: globalThis.fetch.preconnect },
  );
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
  try {
    const entry = catalogEntry(command, "/command.glb", "/command.rubble.glb");
    expect((await resolveEntityModel(entry)).foundation).toBe(true);
    const rubble = await resolveEntityModel(entry, "wreck");
    expect(rubble.foundation).toBe(false);
    expect(Array.from(rubble.footprint ?? [])).toEqual(command.footprint);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/command.glb",
      "/command.rubble.glb",
    ]);
    await expect(resolveEntityModel(catalogEntry(dragon, "/dragon.glb"), "wreck")).rejects.toThrow(
      "wreck",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    fetcher.mockRestore();
  }
});

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

test("validated material mappings are copied into model metadata for live and wreck imports", async () => {
  const materials = { team: "team_dark" };
  const entry = catalogEntry(
    { ...dragon, presentation: { ...dragon.presentation, materials } },
    "/dragon.glb",
    "/wreck.glb",
  );
  materials.team = "metal";
  expect(entry.materials).toEqual({ team: "team_dark" });
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => new Response(new Uint8Array([1])), {
      preconnect: globalThis.fetch.preconnect,
    }),
  );
  try {
    expect((await resolveEntityModel(entry)).materials).toEqual({ team: "team_dark" });
    expect((await resolveEntityModel(entry, "wreck")).materials).toEqual({ team: "team_dark" });
  } finally {
    fetcher.mockRestore();
  }
});

test("raw metadata cannot bypass the original schema before conversion", () => {
  expect(() => catalogEntry({ ...dragon, radius: -1 })).toThrow("Invalid");
  expect(() => catalogEntry({ ...bush, presentation: { model: 12 } })).toThrow("Invalid");
  expect(() => catalogEntry({ id: "unit:made-up", health: 10 })).toThrow("Invalid");
});
