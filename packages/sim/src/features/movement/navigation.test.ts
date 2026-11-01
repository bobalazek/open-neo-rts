import { describe, expect, test } from "bun:test";
import { DOMAINS, type GroundDomain, RAMP, SURFACES, WATER } from "@open-neo-rts/content";
import tree from "../../../../../content/core/props/temperate/conifer-tree/prop.json";
import rubble from "../../../../../content/core/props/urban/rubble-pile/prop.json";
import type { MatchMap } from "../../match-map";
import { flatMap, terrainMap } from "../../testing/maps";
import { navigationProof } from "../../testing/navigation";
import { compileNavigation, type NavigationDefinition } from "./navigation";
import { canTraverse, NAV_DIRECTIONS, PathSearch } from "./path-search";

const DOMAINS_GROUND = DOMAINS.filter((d): d is GroundDomain => d !== "air");
const compile = (map: MatchMap, radiusSubcells = 0, domain: GroundDomain = "foot") =>
  compileNavigation(map, [], { domain, radiusSubcells });
const direction = (dx: number, dy: number) =>
  NAV_DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);

function ramps(): MatchMap {
  const map = flatMap();
  return {
    ...map,
    terrain: {
      ...map.terrain,
      level: map.terrain.level.map((_, i) => (i % 8 >= 4 ? 1 : 0)),
      ramp: map.terrain.ramp.map((_, i) => (i === 19 || i === 27 ? RAMP.east : 0)),
    },
  };
}

function rotate(map: MatchMap): MatchMap {
  const width = map.terrain.width;
  const layer = (values: readonly number[], ramp = false) =>
    values.map((_, i) => {
      const value = values[(width - 1 - (i % width)) * width + Math.floor(i / width)] as number;
      return ramp && value ? (value % 4) + 1 : value;
    });
  return {
    ...map,
    terrain: {
      ...map.terrain,
      level: layer(map.terrain.level),
      ramp: layer(map.terrain.ramp, true),
    },
  };
}

describe("navigation compilation", () => {
  test("implements every approved water domain, with independent route costs and speed", () => {
    const map = flatMap(6, 3);
    const water = map.terrain.water.map((_, i) => Math.floor((i % 6) / 2));
    const wet = { ...map, terrain: { ...map.terrain, water } };
    const expected = {
      foot: [2, 2, 0],
      wheeled: [2, 4, 0],
      tracked: [2, 0, 0],
      hover: [2, 2, 2],
      amphibious: [2, 2, 2],
      naval: [0, 0, 2],
    };
    for (const domain of DOMAINS_GROUND) {
      const grid = compile(wet, 0, domain);
      expect([grid.cost[0], grid.cost[2], grid.cost[4]]).toEqual(expected[domain]);
      expect([grid.speedPercent[0], grid.speedPercent[2], grid.speedPercent[4]]).toEqual(
        expected[domain].map((cost, depth) =>
          !cost ? 0 : domain === "wheeled" && depth === WATER.shallow ? 50 : 100,
        ),
      );
    }
    expect(() =>
      compileNavigation(wet, [], { domain: "air" as GroundDomain, radiusSubcells: 0 }),
    ).toThrow();
  });

  test("only road and rubble change the first-pass surface route preference", () => {
    const map = flatMap(8, 1);
    const surface = SURFACES.map((_, i) => i);
    expect([...compile({ ...map, terrain: { ...map.terrain, surface } }).cost]).toEqual([
      2, 2, 2, 2, 2, 2, 1, 3,
    ]);
  });

  test("ramp planes join both ends and parallel lanes, but never jump a side discontinuity in all orientations", () => {
    let map = ramps();
    for (let turn = 0; turn < 4; turn++) {
      const grid = compile(map);
      const [dx, dy] = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ][turn] as [number, number];
      const along = direction(dx, dy);
      const back = direction(-dx, -dy);
      const rampCells = map.terrain.ramp.flatMap((r, i) => (r ? [i] : []));
      for (const cell of rampCells) {
        expect((grid.connections[cell] as number) & (1 << along)).not.toBe(0);
        expect((grid.connections[cell] as number) & (1 << back)).not.toBe(0);
        for (const side of [direction(-dy, dx), direction(dy, -dx)]) {
          const [sx, sy] = NAV_DIRECTIONS[side] as [number, number];
          const neighbour = cell + sx + sy * 8;
          expect(Boolean((grid.connections[cell] as number) & (1 << side))).toBe(
            rampCells.includes(neighbour),
          );
        }
      }
      map = rotate(map);
    }
  });

  test("honours original prop domains, decoration and rotated structure/live footprints", () => {
    const structure: NavigationDefinition = { id: "structure:fixture", footprint: [2, 1] };
    const decoration: NavigationDefinition = {
      id: "prop:decoration",
      footprint: [1, 1],
      blocks: "nothing",
      domains: ["foot"],
    };
    const definitions = [
      tree as NavigationDefinition,
      rubble as NavigationDefinition,
      structure,
      decoration,
    ];
    const object = (definition: string, x: number, y: number, rotation = 0) => ({
      definition,
      position: [x * 1024, y * 1024] as const,
      rotation,
      owner: "neutral",
    });
    const map = {
      ...flatMap(),
      objects: [object(tree.id, 1, 1), object(rubble.id, 2, 1), object(decoration.id, 3, 1)],
    };
    for (const domain of DOMAINS_GROUND) {
      const grid = compileNavigation(map, definitions, { domain, radiusSubcells: 0 });
      if (grid.cost[8]) {
        expect(grid.cost[9] === 0).toBe(tree.domains.includes(domain));
        expect(grid.cost[10] === 0).toBe(rubble.domains.includes(domain));
        expect(grid.cost[11]).toBeGreaterThan(0);
      }
      for (const rotation of [0, 90, 180, 270]) {
        const result = compileNavigation(
          flatMap(),
          definitions,
          { domain: "foot", radiusSubcells: 0 },
          [object(structure.id, 4, 4, rotation)],
        );
        const blocked = [...result.cost].flatMap((cost, i) => (cost === 0 ? [i] : []));
        expect(blocked).toEqual(rotation % 180 ? [36, 44] : [36, 37]);
      }
    }
  });

  test("circle clearance fits exact-width gaps, blocks larger units and includes borders/cliffs", () => {
    const map = flatMap(9);
    const wall: NavigationDefinition = { id: "prop:wall", footprint: [1, 1], blocks: "movement" };
    const objects = Array.from({ length: 9 }, (_, y) =>
      [2, 6].map((x) => ({
        definition: wall.id,
        position: [x * 1024, y * 1024] as const,
        rotation: 0,
        owner: "neutral",
      })),
    ).flat();
    const at = 4 * 9 + 4;
    for (const radiusSubcells of [0, 512, 1536, 1537, 8192]) {
      const grid = compileNavigation({ ...map, objects }, [wall], {
        domain: "foot",
        radiusSubcells,
      });
      expect(grid.clearanceSubcells[at]).toBe(1536);
      expect(grid.cost[at] !== 0).toBe(radiusSubcells <= 1536);
      if (radiusSubcells <= 1536)
        expect(new PathSearch(grid, at, at + 9).step(100).status).toBe("found");
    }
    const flat = compile(flatMap(), 513);
    expect(flat.cost[0]).toBe(0);
    expect(flat.clearanceSubcells[0]).toBe(512);
    const cliffMap = flatMap();
    const level = cliffMap.terrain.level.map((_, i) => (i % 8 >= 4 ? 1 : 0));
    const cliff = compile({ ...cliffMap, terrain: { ...cliffMap.terrain, level } }, 513);
    expect(cliff.clearanceSubcells[3 + 3 * 8]).toBe(512);
    expect(cliff.cost[3 + 3 * 8]).toBe(0);
  });

  test("clearance checks the swept edge, and shared traversal rejects every diagonal corner cut", () => {
    const map = flatMap();
    const definition: NavigationDefinition = {
      id: "prop:wall",
      footprint: [1, 1],
      blocks: "movement",
    };
    const objects = [
      {
        definition: definition.id,
        position: [3 * 1024, 3 * 1024] as const,
        rotation: 0,
        owner: "neutral",
      },
    ];
    const grid = compileNavigation({ ...map, objects }, [definition], {
      domain: "foot",
      radiusSubcells: 513,
    });
    const a = 2 + 2 * 8;
    const b = 3 + 2 * 8;
    expect(grid.cost[a]).toBeGreaterThan(0);
    expect(grid.cost[b]).toBe(0);
    for (let i = 0; i < grid.cost.length; i++)
      for (const [d, [dx, dy]] of NAV_DIRECTIONS.entries()) {
        const x = (i % 8) + dx;
        const y = Math.floor(i / 8) + dy;
        if (x < 0 || y < 0 || x >= 8 || y >= 8) continue;
        if ((grid.connections[i] as number) & (1 << d))
          expect(canTraverse(grid, i, y * 8 + x, d)).toBe(true);
      }
    const small = compileNavigation({ ...map, objects }, [definition], {
      domain: "foot",
      radiusSubcells: 0,
    });
    expect(canTraverse(small, 2 + 3 * 8, 3 + 2 * 8, direction(1, -1))).toBe(false);
  });

  test("compilation is repeatable and does not mutate any input", () => {
    const map = terrainMap();
    const before = JSON.stringify(map);
    for (const domain of DOMAINS_GROUND)
      for (const radiusSubcells of [0, 256, 512, 1024, 8192])
        expect(compile(map, radiusSubcells, domain)).toEqual(compile(map, radiusSubcells, domain));
    expect(JSON.stringify(map)).toBe(before);
    expect(navigationProof()).toEqual(navigationProof());
  });

  test("matches an exhaustive rectangle/edge oracle across domains, radii, ramps and blockers", () => {
    // Reference geometry scans every barrier; it does not use compiler clearance or traversal helpers.
    type Box = readonly [number, number, number, number];
    const squaredDistance = (a: Box, b: Box) => {
      const x = a[2] < b[0] ? b[0] - a[2] : b[2] < a[0] ? a[0] - b[2] : 0;
      const y = a[3] < b[1] ? b[1] - a[3] : b[3] < a[1] ? a[1] - b[3] : 0;
      return x * x + y * y;
    };
    const allowed: Record<GroundDomain, number[]> = {
      foot: [0, 1],
      wheeled: [0, 1],
      tracked: [0],
      hover: [0, 1, 2],
      amphibious: [0, 1, 2],
      naval: [2],
    };
    const definition: NavigationDefinition = {
      id: "prop:oracle",
      footprint: [2, 1],
      blocks: "movement",
      domains: ["wheeled", "hover"],
    };
    let map = terrainMap();
    for (let turn = 0; turn < 4; turn++, map = rotate(map)) {
      const object = {
        definition: definition.id,
        position: [1024, 4096] as const,
        rotation: turn * 90,
        owner: "neutral",
      };
      const input = { ...map, objects: [object] };
      const corners = map.terrain.ramp.map((r, i) => {
        const offsets = [
          [0, 0, 0, 0],
          [1, 1, 0, 0],
          [0, 1, 0, 1],
          [0, 0, 1, 1],
          [1, 0, 1, 0],
        ][r] as number[];
        return offsets.map((n) => n + (map.terrain.level[i] as number));
      });
      for (const domain of DOMAINS_GROUND) {
        const costs = map.terrain.water.map((water, i) => {
          const x = i % 8;
          const y = Math.floor(i / 8);
          const occupied =
            (definition.domains as readonly string[]).includes(domain) &&
            x >= 1 &&
            x < (turn % 2 ? 2 : 3) &&
            y >= 4 &&
            y < (turn % 2 ? 6 : 5);
          if (!allowed[domain].includes(water) || occupied) return 0;
          const surface = map.terrain.surface[i];
          const route = surface === 6 ? 1 : surface === 7 ? 3 : 2;
          return route * (domain === "wheeled" && water === 1 ? 2 : 1);
        });
        const barriers: Box[] = [
          [-8192, -8192, 0, 16384],
          [8192, -8192, 16384, 16384],
          [-8192, -8192, 16384, 0],
          [-8192, 8192, 16384, 16384],
        ];
        const cliffs = new Set<string>();
        for (let i = 0; i < 64; i++) {
          const x = i % 8;
          const y = Math.floor(i / 8);
          if (costs[i] === 0) barriers.push([x * 1024, y * 1024, (x + 1) * 1024, (y + 1) * 1024]);
          const a = corners[i] as number[];
          if (x < 7) {
            const b = corners[i + 1] as number[];
            if (a[1] !== b[0] || a[3] !== b[2]) {
              barriers.push([(x + 1) * 1024, y * 1024, (x + 1) * 1024, (y + 1) * 1024]);
              cliffs.add(`${i},${i + 1}`);
              cliffs.add(`${i + 1},${i}`);
            }
          }
          if (y < 7) {
            const b = corners[i + 8] as number[];
            if (a[2] !== b[0] || a[3] !== b[1]) {
              barriers.push([x * 1024, (y + 1) * 1024, (x + 1) * 1024, (y + 1) * 1024]);
              cliffs.add(`${i},${i + 8}`);
              cliffs.add(`${i + 8},${i}`);
            }
          }
        }
        const centre = (i: number): Box => {
          const x = (i % 8) * 1024 + 512;
          const y = Math.floor(i / 8) * 1024 + 512;
          return [x, y, x, y];
        };
        const nearest = (segment: Box) =>
          Math.min(8192 * 8192, ...barriers.map((box) => squaredDistance(segment, box)));
        const distances = costs.map((_, i) => nearest(centre(i)));
        for (const radiusSubcells of [0, 256, 512, 513, 724, 1024, 1536, 8192]) {
          const grid = compileNavigation(input, [definition], { domain, radiusSubcells });
          const r2 = radiusSubcells * radiusSubcells;
          const passable = costs.map((cost, i) => Boolean(cost) && (distances[i] as number) >= r2);
          const cardinal = (a: number, b: number) => {
            if (!passable[a] || !passable[b] || cliffs.has(`${a},${b}`)) return false;
            const start = centre(a);
            const end = centre(b);
            return (
              nearest([
                Math.min(start[0], end[0]),
                Math.min(start[1], end[1]),
                Math.max(start[0], end[0]),
                Math.max(start[1], end[1]),
              ]) >= r2
            );
          };
          for (let i = 0; i < 64; i++) {
            expect(grid.cost[i]).toBe(passable[i] ? (costs[i] as number) : 0);
            const clearance = grid.clearanceSubcells[i] as number;
            if (!costs[i]) expect(clearance).toBe(0);
            else {
              expect(clearance * clearance).toBeLessThanOrEqual(distances[i] as number);
              expect((clearance + 1) * (clearance + 1)).toBeGreaterThan(distances[i] as number);
            }
            let expected = 0;
            for (const [d, [dx, dy]] of NAV_DIRECTIONS.entries()) {
              const x = (i % 8) + dx;
              const y = Math.floor(i / 8) + dy;
              if (x < 0 || y < 0 || x > 7 || y > 7) continue;
              const next = y * 8 + x;
              const ok =
                dx && dy
                  ? cardinal(i, i + dx) &&
                    cardinal(i, i + dy * 8) &&
                    cardinal(i + dx, next) &&
                    cardinal(i + dy * 8, next)
                  : cardinal(i, next);
              if (ok) expected |= 1 << d;
            }
            expect(grid.connections[i]).toBe(expected);
          }
        }
      }
    }
  });

  test("supports the 512 bound and rejects malformed grids, profiles, definitions and objects", () => {
    const grid = compile(flatMap(512));
    expect(grid.cost.length).toBe(512 * 512);
    expect(grid.clearanceSubcells[256 * 512 + 256]).toBe(8192);
    for (const radius of [-1, 0.5, NaN, Infinity, 8193])
      expect(() => compile(flatMap(), radius)).toThrow();
    expect(() => compile(flatMap(513, 1))).toThrow();
    const map = flatMap();
    for (const terrain of [
      { ...map.terrain, width: 0 },
      { ...map.terrain, surface: [0] },
      { ...map.terrain, level: Array(64).fill(8) },
      { ...map.terrain, water: [2, ...map.terrain.water.slice(1)] },
      { ...map.terrain, ramp: [1, ...map.terrain.ramp.slice(1)] },
    ])
      expect(() => compile({ ...map, terrain })).toThrow();
    const def: NavigationDefinition = { id: "prop:wall", footprint: [2, 1], blocks: "movement" };
    for (const definitions of [
      [def, def],
      [{ ...def, footprint: [0, 1] }],
      [{ ...def, domains: ["oops" as GroundDomain] }],
    ])
      expect(() =>
        compileNavigation(map, definitions, { domain: "foot", radiusSubcells: 0 }),
      ).toThrow();
    for (const object of [
      { definition: def.id, position: [1025, 1024] as const, rotation: 0, owner: "neutral" },
      { definition: def.id, position: [1024, 1024] as const, rotation: 1, owner: "neutral" },
      { definition: def.id, position: [7168, 1024] as const, rotation: 0, owner: "neutral" },
      {
        definition: "prop:unknown",
        position: [1024, 1024] as const,
        rotation: 0,
        owner: "neutral",
      },
    ])
      expect(() =>
        compileNavigation(map, [def], { domain: "foot", radiusSubcells: 0 }, [object]),
      ).toThrow();
  });
});
