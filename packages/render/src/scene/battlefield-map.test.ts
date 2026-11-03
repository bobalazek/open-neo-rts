import { expect, test } from "bun:test";
import { circularMapPoint } from "./battlefield-map";

test("the circular minimap keeps the entire rotated square reachable", () => {
  const diameter = 220,
    side = (diameter - 4) / Math.SQRT2;
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0.2, 0.8],
    [0.5, 0.5],
  ]) {
    const x = (u! - 0.5) * side,
      y = (v! - 0.5) * side;
    const point = circularMapPoint(
      diameter / 2 + (x - y) / Math.SQRT2,
      diameter / 2 + (x + y) / Math.SQRT2,
      diameter,
    );
    expect(point?.x).toBeCloseTo(u!, 6);
    expect(point?.y).toBeCloseTo(v!, 6);
  }
  expect(circularMapPoint(0, 0, diameter)).toBeNull();
  expect(circularMapPoint(diameter / 2, -10, diameter)).toBeNull();
});
