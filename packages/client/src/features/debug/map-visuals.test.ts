import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { parseTerrain } from "@open-neo-rts/content";
import { resourceInstances } from "@open-neo-rts/render";
import { mapDecorations, resolveMapModel } from "./map-visuals";
import { MAPS } from "./maps";

afterEach(() => mock.restore());

test("authored decorations retain original references/transforms; authoritative objects are omitted", () => {
  const original = {
    definition: "core.prop:temperate/bush",
    position: [10.5, 8],
    rotation: 270,
    owner: "neutral",
  };
  const objects = [
    original,
    { ...original, definition: "core.prop:temperate/broadleaf-tree" },
    { ...original, definition: "core.structure:neutral/oil-derrick" },
  ];
  const before = JSON.stringify(objects);
  const [decoration] = mapDecorations(objects);
  expect(decoration).toEqual({ ...original, footprint: [1, 1] });
  expect(decoration?.position).toBe(original.position);
  const local = { ...original, definition: "prop:temperate/bush" };
  expect(mapDecorations([local])[0]).toEqual({ ...local, footprint: [1, 1] });
  expect(mapDecorations(objects)).toHaveLength(1);
  expect(JSON.stringify(objects)).toBe(before);
  expect(() =>
    mapDecorations([{ ...original, definition: "core.prop:temperate/missing" }]),
  ).toThrow("core.prop:temperate/missing");
});

test("actual resource sandbox and Training fields stay at their authored coordinates", () => {
  for (const [id, materials] of [
    [
      "map:sandbox-resources",
      [
        [32, 32],
        [32, 44],
      ],
    ],
    [
      "map:training-grounds",
      [
        [64, 24],
        [64, 104],
      ],
    ],
  ] as const) {
    const definition = MAPS.find((map) => map.definition.id === id)?.definition;
    expect(definition).toBeDefined();
    if (!definition) throw new Error("Missing fixture map");
    const { width, height } = definition.size;
    const art = resourceInstances(definition, parseTerrain(width, height, {}));
    expect(
      art
        .filter(({ definition }) => definition === "material-node")
        .map(({ position }) => position),
    ).toEqual([...materials]);
    for (const field of definition.resources.filter((field) => field.kind === "ore")) {
      expect(
        art.some(
          ({ definition, position: [x = 0, y = 0] }) =>
            definition === "ore-cell" &&
            Math.abs(x - (field.position[0] ?? 0)) < 1 &&
            Math.abs(y - (field.position[1] ?? 0)) < 1,
        ),
      ).toBe(true);
    }
  }
});

test("model fetches use only catalogued original URLs and identify failed assets", async () => {
  const fetch = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  expect(await resolveMapModel("ore-cell")).toEqual(new Uint8Array([1, 2, 3]));
  expect(String(fetch.mock.calls[0]?.[0])).toContain("ore-cell");
  await resolveMapModel("prop:temperate/bush");
  expect(String(fetch.mock.calls[1]?.[0])).toContain("bush");
  fetch.mockResolvedValue(new Response(null, { status: 404 }));
  await expect(resolveMapModel("core.prop:urban/bench")).rejects.toThrow(
    "core.prop:urban/bench: HTTP 404",
  );
  await expect(resolveMapModel("toString")).rejects.toThrow("No map model");
  const count = fetch.mock.calls.length;
  await expect(resolveMapModel("../../private.glb")).rejects.toThrow("No map model");
  expect(fetch.mock.calls.length).toBe(count);
});
