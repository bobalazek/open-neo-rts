import type { Definition } from "./definitions";

/** Radius-aware exterior cell centre for one authored footprint-side exit. */
export function perimeterPoint(
  building: Definition,
  origin: { x: number; y: number; facing: number },
  exit: NonNullable<Definition["exits"]>[number],
  radius: number,
) {
  const [w = 0, d = 0] = building.footprint ?? [];
  const r = ((origin.facing >>> 14) + 3) & 3;
  const [x, y] = exit.cell;
  const [cx, cy]: readonly [number, number] =
    r === 0 ? [x, y] : r === 1 ? [d - 1 - y, x] : r === 2 ? [w - 1 - x, d - 1 - y] : [y, w - 1 - x];
  const sides = ["north", "east", "south", "west"];
  const directions = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  const side = (sides.indexOf(exit.side) + r) & 3;
  const [dx, dy] = directions[side] as readonly [number, number];
  const offset = Math.max(1, Math.floor((radius + 1535) / 1024));
  return {
    x: (Math.floor(origin.x / 1024) + cx + dx * offset) * 1024 + 512,
    y: (Math.floor(origin.y / 1024) + cy + dy * offset) * 1024 + 512,
    facing: ((side + 3) & 3) * 0x4000,
  };
}
