import { expect, test } from "bun:test";
import { TILES, textures } from "./generate-textures";

const TILE = 128;
const all = textures();

/** Mean colour difference between line `a` and line `b` of a tile: columns, or rows when `rows` is set. */
function lineDiff(rgba: Uint8Array, a: number, b: number, rows: boolean): number {
  let sum = 0;
  for (let i = 0; i < TILE; i++) {
    const [p, q] = rows ? [a * TILE + i, b * TILE + i] : [i * TILE + a, i * TILE + b];
    for (let c = 0; c < 3; c++) sum += Math.abs((rgba[p * 4 + c] ?? 0) - (rgba[q * 4 + c] ?? 0));
  }
  return sum / (TILE * 3);
}

test("textures are deterministic", () => {
  for (const [name, [rgba]] of textures())
    expect([name, rgba]).toEqual([name, all.get(name)?.[0] ?? new Uint8Array()]);
});

for (const name of Object.keys(TILES)) {
  test(`${name} repeats without a seam harsher than any inside the tile`, () => {
    const [rgba] = all.get(name) ?? [new Uint8Array()];
    for (const rows of [false, true]) {
      let inside = 0;
      for (let i = 0; i < TILE - 1; i++) inside = Math.max(inside, lineDiff(rgba, i, i + 1, rows));
      expect(lineDiff(rgba, TILE - 1, 0, rows)).toBeLessThanOrEqual(inside);
    }
  });
}
