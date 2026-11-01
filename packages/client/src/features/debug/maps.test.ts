import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { loadMap, MAPS } from "./maps";

afterEach(() => mock.restore());

test("flat map uses authored dimensions and no network layers", async () => {
  const fetch = spyOn(globalThis, "fetch");
  const { definition, grid } = await loadMap("core.map:sandbox-flat");
  expect(definition.name).toBe("Sandbox: Flat");
  expect([grid.width, grid.height]).toEqual([64, 64]);
  expect(grid.water).toEqual(new Uint8Array(4096));
  expect(fetch).not.toHaveBeenCalled();
  expect(new Set(MAPS.map(({ definition }) => definition.id)).size).toBe(6);
});

test("height data from the loaded map reaches the terrain grid", async () => {
  spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(new Uint8Array(96 * 96).fill(1)))
    .mockResolvedValueOnce(new Response(new Uint8Array(96 * 96)));
  const { grid } = await loadMap("core.map:sandbox-terrain");
  expect([grid.width, grid.height]).toEqual([96, 96]);
  expect(grid.level[4608]).toBe(1);
  expect(grid.ramp[4608]).toBe(0);
});

test("unknown map IDs never become fetch paths", async () => {
  const fetch = spyOn(globalThis, "fetch");
  await expect(loadMap("../../private")).rejects.toThrow("Unknown map");
  expect(fetch).not.toHaveBeenCalled();
});

test("failed or truncated layer downloads reject instead of showing an empty map", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
  await expect(loadMap("core.map:sandbox-water")).rejects.toThrow("404");
  fetch.mockResolvedValue(new Response(new Uint8Array(127)));
  await expect(loadMap("core.map:sandbox-water")).rejects.toThrow("expected");
});

test("invalid terrain values are rejected before rendering", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(96 * 96).fill(3)));
  await expect(loadMap("core.map:sandbox-water")).rejects.toThrow("unknown water value");
});
