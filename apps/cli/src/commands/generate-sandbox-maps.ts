// bun neo generate-sandbox-maps: writes the sandbox maps (docs/design/terrain-and-biomes.md#sandbox-maps) to
// content/core/maps/sandbox-*/. This file is their source: edit the shapes here and rerun, never the output.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { parseTerrain, RAMP, type TerrainGrid, WATER } from "@open-neo-rts/content";

const DIR = "content/core/maps";

type Spawn = { id: string; position: [number, number]; facing: number };
type Resource = {
  kind: "ore" | "materials";
  position: [number, number];
  amount: number;
  radius?: number;
};

export interface SandboxMap {
  name: string;
  description: string;
  terrain: TerrainGrid;
  spawns: Spawn[];
  resources?: Resource[];
}

function grid(size: number): TerrainGrid {
  return parseTerrain(size, size, {});
}

type Layer = "level" | "ramp" | "water";

/** Sets `layer` to `value` on cells x0 ≤ x < x1, y0 ≤ y < y1 (clipped to the map) where `inside` holds. */
function box(
  t: TerrainGrid,
  layer: Layer,
  [x0, y0, x1, y1]: [number, number, number, number],
  value: number,
  inside = (_x: number, _y: number) => true,
) {
  for (let y = Math.max(y0, 0); y < Math.min(y1, t.height); y++)
    for (let x = Math.max(x0, 0); x < Math.min(x1, t.width); x++)
      if (inside(x, y)) t[layer][y * t.width + x] = value;
}

/** Sets `layer` to `value` on cells within about `r` of (cx, cy). */
const disc = (t: TerrainGrid, layer: Layer, cx: number, cy: number, r: number, value: number) =>
  box(
    t,
    layer,
    [cx - r, cy - r, cx + r + 1, cy + r + 1],
    value,
    (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r, // + r rounds off the cardinal tips
  );

export const SANDBOX_MAPS: Record<string, () => SandboxMap> = {
  "sandbox-flat": () => ({
    name: "Sandbox: Flat",
    description:
      "One level of temperate grass, no water and nothing placed: for movement, selection and combat.",
    terrain: grid(64),
    spawns: [
      { id: "west", position: [16, 32], facing: 90 },
      { id: "east", position: [48, 32], facing: 270 },
    ],
  }),

  "sandbox-terrain": () => {
    const t = grid(96);
    // North-west: an L on level 1 (inner cliff corner at 30, 36), level 2 on it, level 3 on that.
    box(t, "level", [8, 8, 52, 36], 1);
    box(t, "level", [8, 36, 30, 70], 1);
    box(t, "level", [12, 12, 40, 30], 2);
    box(t, "level", [16, 16, 26, 24], 3);
    // A ramp cell sits on the lower level, next to the higher cell it rises toward.
    box(t, "ramp", [14, 70, 18, 71], RAMP.north); // 0 → 1, at the foot of the L
    box(t, "ramp", [40, 18, 41, 22], RAMP.west); // 1 → 2
    box(t, "ramp", [15, 19, 16, 21], RAMP.east); // 2 → 3, the minimum 2 cells wide
    // North-east: level 1, with a 3-cell pass (x 52 to 54) between it and the L.
    box(t, "level", [55, 14, 88, 40], 1);
    box(t, "ramp", [70, 13, 74, 14], RAMP.south);
    // South-east: level 1.
    box(t, "level", [60, 56, 88, 88], 1);
    box(t, "ramp", [59, 70, 60, 74], RAMP.east);
    // A one-cell pillar, two levels tall.
    box(t, "level", [44, 50, 45, 51], 2);
    return {
      name: "Sandbox: Terrain",
      description:
        "Plateaus on levels 0 to 3 with ramps rising north, east, south and west, outer and inner cliff corners, a one-cell pillar and a 3-cell pass.",
      terrain: t,
      spawns: [
        { id: "south-west", position: [16, 84], facing: 0 },
        { id: "east", position: [76, 48], facing: 270 },
      ],
    };
  },

  "sandbox-water": () => {
    const t = grid(96);
    // Shallow first, then deep, so deep is never painted over. Deep keeps a shallow cell on all 8 sides.
    box(t, "water", [0, 72, 82, 79], WATER.shallow); // river, from the west edge to the coast
    box(t, "water", [82, 0, 96, 96], WATER.shallow); // coast: 2 cells, so two-row shore structures fit
    disc(t, "water", 48, 40, 12, WATER.shallow); // lake shore: 2 cells, as the round shore is diagonal
    box(t, "water", [0, 74, 40, 77], WATER.deep); // river, deep west section (needs a bridge)
    box(t, "water", [50, 74, 84, 77], WATER.deep); // river, deep east section into the sea
    box(t, "water", [84, 0, 96, 96], WATER.deep); // sea
    disc(t, "water", 48, 40, 10, WATER.deep); // lake
    return {
      name: "Sandbox: Water",
      description:
        "A deep lake with a shallow shore in the middle, a river with a shallow ford (x 40 to 49) between two deep sections, and deep sea along the east coast.",
      terrain: t,
      spawns: [
        { id: "north-west", position: [16, 16], facing: 135 },
        { id: "south", position: [64, 88], facing: 315 },
      ],
    };
  },

  "sandbox-resources": () => ({
    name: "Sandbox: Resources",
    description:
      "Ore fields of three sizes and raw-material nodes, the smallest of each nearly empty so depletion shows quickly.",
    terrain: grid(64),
    spawns: [
      { id: "west", position: [12, 32], facing: 90 },
      { id: "east", position: [52, 32], facing: 270 },
    ],
    // No oil nodes or neutral tech structures: the schema has no kind for them yet (owner decision).
    resources: [
      { kind: "ore", position: [32, 12], amount: 30000, radius: 5 },
      { kind: "ore", position: [20, 50], amount: 10000, radius: 3 },
      { kind: "ore", position: [44, 50], amount: 500, radius: 1 },
      { kind: "materials", position: [32, 32], amount: 5000 },
      { kind: "materials", position: [32, 44], amount: 250 },
    ],
  }),
};

/** map.layers key → TerrainGrid field. */
const LAYERS = [
  ["height", "level"],
  ["ramps", "ramp"],
  ["surface", "surface"],
  ["water", "water"],
] as const;

export async function generateSandboxMaps(): Promise<number> {
  for (const [id, build] of Object.entries(SANDBOX_MAPS)) {
    const { name, description, terrain: t, spawns, resources = [] } = build();
    const dir = `${DIR}/${id}`;
    mkdirSync(dir, { recursive: true });
    const layers: Record<string, string> = {};
    for (const [key, field] of LAYERS) {
      const file = `${key}.r8`;
      if (t[field].some((v) => v !== 0)) {
        writeFileSync(`${dir}/${file}`, t[field]);
        layers[key] = file;
      } else rmSync(`${dir}/${file}`, { force: true }); // all zeros is the default; drop a stale file
    }
    const map = {
      $schema: "../../../schemas/map.schema.json",
      id: `map:${id}`,
      name,
      description,
      size: { width: t.width, height: t.height },
      biome: "temperate",
      players: { min: 1, max: 2 },
      spawns,
      start: "empty",
      resources,
      objects: [],
      ...(Object.keys(layers).length > 0 ? { layers } : {}),
    };
    // Biome keeps [x, y] pairs on one line; JSON.stringify splits them.
    const json = JSON.stringify(map, null, 2).replace(
      /\[\s+([-\d.]+),\s+([-\d.]+)\s+\]/g,
      "[$1, $2]",
    );
    writeFileSync(`${dir}/map.json`, `${json}\n`);
    console.log(
      `wrote ${dir}: map.json${Object.values(layers)
        .map((f) => `, ${f}`)
        .join("")}`,
    );
  }
  return 0;
}
