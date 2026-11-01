import { expect, test } from "bun:test";
import { TILES, textures } from "./generate-textures";

const TILE = 128;
/** Mean colour difference between two columns of a tile. */
function columnDiff(rgba: Uint8Array, a: number, b: number): number {
  let sum = 0;
  for (let y = 0; y < TILE; y++)
    for (let c = 0; c < 3; c++)
      sum += Math.abs((rgba[(y * TILE + a) * 4 + c] ?? 0) - (rgba[(y * TILE + b) * 4 + c] ?? 0));
  return sum / (TILE * 3);
}

test("textures are deterministic", () => {
  const [first, second] = [textures(), textures()];
  for (const [name, [rgba]] of first) expect([name, Bun.hash(rgba)]).toEqual([name, Bun.hash(second.get(name)?.[0] ?? new Uint8Array())]);
});

for (const name of Object.keys(TILES)) {
  test(`${name} tiles: the wrap seam is no harsher than the tile's own columns`, () => {
    const [rgba] = textures().get(name) ?? [new Uint8Array(), 0];
    let interior = 0;
    for (let x = 0; x < TILE - 1; x++) interior += columnDiff(rgba, x, x + 1);
    expect(columnDiff(rgba, TILE - 1, 0)).toBeLessThanOrEqual((interior / (TILE - 1)) * 2.5);
  });
}
