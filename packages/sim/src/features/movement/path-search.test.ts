import { describe, expect, test } from "bun:test";
import { NAV_DIRECTIONS, type NavGrid, PathSearch } from ".";

function grid(width: number, height: number, costs?: number[]): NavGrid {
  return {
    width,
    height,
    cost: costs ? Uint16Array.from(costs) : new Uint16Array(width * height).fill(1),
    connections: new Uint8Array(width * height).fill(255),
  };
}

describe("PathSearch", () => {
  test("golden open and weighted routes use 10/14 entry costs and canonical ties", () => {
    expect(new PathSearch(grid(5, 5), 0, 24).step(25)).toEqual({
      status: "found",
      path: [0, 6, 12, 18, 24],
      cost: 56,
      expansions: 5,
    });
    const weighted = grid(5, 3, [1, 1, 1, 1, 1, 1, 100, 100, 100, 1, 1, 1, 1, 1, 1]);
    expect(new PathSearch(weighted, 5, 9).step(15)).toEqual({
      status: "found",
      path: [5, 1, 2, 3, 9],
      cost: 48,
      expansions: 5,
    });
  });

  test("a fixed budget continues the same search and yields a deterministic partial path", () => {
    const search = new PathSearch(grid(5, 5), 0, 24);
    expect(search.step(0)).toEqual({ status: "searching", path: [0], cost: 0, expansions: 0 });
    expect(search.step(1)).toEqual({ status: "searching", path: [0, 6], cost: 14, expansions: 1 });
    expect(search.step(1)).toEqual({
      status: "searching",
      path: [0, 6, 12],
      cost: 28,
      expansions: 1,
    });
    expect(search.step(3)).toEqual({
      status: "found",
      path: [0, 6, 12, 18, 24],
      cost: 56,
      expansions: 3,
    });
    expect(search.step(10).expansions).toBe(0);
  });

  test("never cuts blocked corners or missing cliff connections", () => {
    expect(new PathSearch(grid(2, 2, [1, 0, 0, 1]), 0, 3).step(4)).toEqual({
      status: "unreachable",
      path: [0],
      cost: 0,
      expansions: 1,
    });
    const cliff = grid(2, 2);
    cliff.connections[0] = 255 & ~(1 << 4); // East edge blocked; southeast alone cannot bypass it.
    expect(new PathSearch(cliff, 0, 3).step(4)).toEqual({
      status: "found",
      path: [0, 2, 3],
      cost: 20,
      expansions: 3,
    });
    cliff.connections[2] = 0; // Directed outgoing edges are respected as supplied.
    expect(new PathSearch(cliff, 0, 3).step(4).status).toBe("unreachable");
  });

  test("blocked and disconnected goals finish at the nearest reachable cell", () => {
    expect(new PathSearch(grid(3, 1, [1, 1, 0]), 0, 2).step(3)).toEqual({
      status: "unreachable",
      path: [0, 1],
      cost: 10,
      expansions: 2,
    });
    expect(new PathSearch(grid(3, 3, [1, 0, 1, 1, 0, 1, 1, 0, 1]), 0, 8).step(9)).toEqual({
      status: "unreachable",
      path: [0, 3, 6],
      cost: 20,
      expansions: 3,
    });
    expect(new PathSearch(grid(3, 3, [1, 1, 1, 1, 0, 1, 1, 1, 1]), 0, 4).step(9).path).toEqual([
      0, 1,
    ]);
    expect(new PathSearch(grid(3, 3, [1, 4, 1, 1, 0, 1, 1, 1, 1]), 0, 4).step(9).path).toEqual([
      0, 3,
    ]);
  });

  test("same-cell requests finish and separate requests never share search data", () => {
    const nav = grid(3, 3);
    const a = new PathSearch(nav, 0, 8);
    const b = new PathSearch(nav, 8, 0);
    a.step(1);
    b.step(1);
    expect(a.step(9).path).toEqual([0, 4, 8]);
    expect(b.step(9).path).toEqual([8, 4, 0]);
    expect(new PathSearch(nav, 4, 4).step(1)).toEqual({
      status: "found",
      path: [4],
      cost: 0,
      expansions: 1,
    });
  });

  test("small incremental budgets give exactly the single-run result on varied weighted grids", () => {
    for (let fixture = 0; fixture < 40; fixture++) {
      const costs = Array.from({ length: 64 }, (_, cell) =>
        cell === 0 ? 1 : (cell * 17 + fixture * 13 + Math.floor(cell / 8)) % 7,
      );
      const nav = grid(8, 8, costs);
      const expected = new PathSearch(nav, 0, 63).step(64);
      for (const budget of [1, 2, 7]) {
        const search = new PathSearch(nav, 0, 63);
        let result = search.step(0);
        let expansions = 0;
        while (result.status === "searching") {
          result = search.step(budget);
          expect(result.expansions).toBeLessThanOrEqual(budget);
          expansions += result.expansions;
          expect(expansions).toBeLessThanOrEqual(64);
        }
        expect({ ...result, expansions }).toEqual(expected);
      }
    }
  });

  test("maximum cell costs stay exact integers", () => {
    const nav = grid(3, 1, [65535, 65535, 65535]);
    expect(new PathSearch(nav, 0, 2).step(3).cost).toBe(1310700);
  });

  test("JSON search state preserves heap order and continuation, including terminal states", () => {
    for (let fixture = 0; fixture < 10; fixture++) {
      const nav = grid(
        8,
        8,
        Array.from({ length: 64 }, (_, cell) => (cell === 0 ? 1 : (cell * 17 + fixture * 13) % 7)),
      );
      const search = new PathSearch(nav, 0, 63);
      for (let step = 0; step < 12; step++) {
        const serialized = JSON.stringify(search.snapshot());
        const restored = PathSearch.restore(nav, JSON.parse(serialized));
        expect(JSON.stringify(restored.snapshot())).toBe(serialized);
        expect(restored.result()).toEqual(search.result());
        expect(restored.step(7)).toEqual(search.step(7));
        expect(restored.snapshot()).toEqual(search.snapshot());
      }
    }
    const nav = grid(1, 1);
    const found = new PathSearch(nav, 0, 0);
    found.advance(1);
    expect(PathSearch.restore(nav, found.snapshot()).step(10)).toEqual(found.step(10));
  });

  test("weighted routes match an independent exhaustive shortest-cost search", () => {
    for (let fixture = 0; fixture < 20; fixture++) {
      const nav = grid(
        8,
        8,
        Array.from({ length: 64 }, (_, cell) => 1 + ((cell * 17 + fixture * 13) % 9)),
      );
      const costs = new Array<number>(64).fill(Number.MAX_SAFE_INTEGER);
      const visited = new Set<number>();
      costs[0] = 0;
      while (visited.size < 64) {
        let cell = -1;
        for (let i = 0; i < 64; i++)
          if (!visited.has(i) && (cell === -1 || (costs[i] as number) < (costs[cell] as number)))
            cell = i;
        visited.add(cell);
        for (const [dx, dy] of NAV_DIRECTIONS) {
          const x = (cell % 8) + dx;
          const y = Math.floor(cell / 8) + dy;
          if (x < 0 || y < 0 || x >= 8 || y >= 8) continue;
          const next = y * 8 + x;
          costs[next] = Math.min(
            costs[next] as number,
            (costs[cell] as number) + (dx === 0 || dy === 0 ? 10 : 14) * (nav.cost[next] as number),
          );
        }
      }
      expect(new PathSearch(nav, 0, 63).step(64).cost).toBe(costs[63] as number);
    }
  });

  test("rejects invalid grids, blocked starts, endpoints and budgets", () => {
    for (const width of [0, -1, 1.5, 513, Number.NaN])
      expect(() => new PathSearch(grid(width, 0), 0, 0)).toThrow(RangeError);
    expect(() => new PathSearch({ ...grid(1, 1), cost: new Uint16Array(2) }, 0, 0)).toThrow(
      RangeError,
    );
    expect(() => new PathSearch({ ...grid(1, 1), connections: new Uint8Array() }, 0, 0)).toThrow(
      RangeError,
    );
    expect(() => new PathSearch(grid(1, 1, [0]), 0, 0)).toThrow(RangeError);
    for (const index of [-1, 1, 0.5, Number.NaN]) {
      expect(() => new PathSearch(grid(1, 1), index, 0)).toThrow(RangeError);
      expect(() => new PathSearch(grid(1, 1), 0, index)).toThrow(RangeError);
    }
    for (const budget of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => new PathSearch(grid(1, 1), 0, 0).step(budget)).toThrow(RangeError);
  });
});
