// bun neo generate-sandbox-maps [map-id]: writes the sandbox maps (docs/design/terrain-and-biomes.md#sandbox-maps) to
// content/core/maps/sandbox-*/; training-grounds is an explicit-only target. This file is their terrain source.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { parseTerrain, RAMP, SURFACES, type TerrainGrid, WATER } from "@open-neo-rts/content";
import trainingGrounds from "../../../../content/core/maps/training-grounds/map.json";
import { png } from "../glb-writer";
import { PALETTE } from "./generate-textures";

const DIR = "content/core/maps";

type Spawn = { id: string; position: [number, number]; facing: number };
type Resource = {
  kind: "ore" | "materials" | "oil";
  position: [number, number];
  amount?: number;
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

type Layer = "level" | "ramp" | "surface" | "water" | "biome";

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

  "sandbox-biomes": () => {
    const t = grid(128);
    for (const [i, surface] of (["grass", "sand", "snow", "road"] as const).entries()) {
      const x = (i % 2) * 64;
      const y = Math.floor(i / 2) * 64;
      box(t, "biome", [x, y, x + 64, y + 64], i);
      box(t, "surface", [x, y, x + 64, y + 64], SURFACES.indexOf(surface));
    }
    return {
      name: "Sandbox: Biomes",
      description:
        "Four equal quadrants: temperate grass in the north-west, desert sand in the north-east, arctic snow in the south-west and urban road in the south-east.",
      terrain: t,
      spawns: [
        { id: "north-west", position: [24, 24], facing: 135 },
        { id: "south-east", position: [104, 104], facing: 315 },
      ],
    };
  },

  "sandbox-resources": () => ({
    name: "Sandbox: Resources",
    description:
      "Ore fields, raw-material nodes and an oil marker for shared-extractor placement. Extraction and depletion simulation arrive with the economy.",
    terrain: grid(64),
    spawns: [
      { id: "west", position: [12, 32], facing: 90 },
      { id: "east", position: [52, 32], facing: 270 },
    ],
    resources: [
      { kind: "ore", position: [32, 12], amount: 30000, radius: 5 },
      { kind: "ore", position: [20, 50], amount: 10000, radius: 3 },
      { kind: "ore", position: [44, 50], amount: 500, radius: 1 },
      { kind: "materials", position: [32, 32], amount: 5000 },
      { kind: "materials", position: [32, 44], amount: 250 },
      { kind: "oil", position: [44.5, 32.5] },
    ],
  }),
};

/** Original terrain around Training Grounds' existing spawn/resource coordinates (symmetric about cell 64). */
export function trainingGroundsTerrain(): TerrainGrid {
  const t = grid(128);
  for (const [x0, x1] of [
    [8, 41],
    [88, 121],
  ] as const)
    for (const [y0, y1] of [
      [8, 41],
      [88, 121],
    ] as const)
      box(t, "level", [x0, y0, x1, y1], 1);
  // Each clear corner base has two nine-cell exits, so ground armies can use either side lane.
  box(t, "ramp", [24, 41, 33, 42], RAMP.north);
  box(t, "ramp", [41, 24, 42, 33], RAMP.west);
  box(t, "ramp", [96, 41, 105, 42], RAMP.north);
  box(t, "ramp", [87, 24, 88, 33], RAMP.east);
  box(t, "ramp", [24, 87, 33, 88], RAMP.south);
  box(t, "ramp", [41, 96, 42, 105], RAMP.west);
  box(t, "ramp", [96, 87, 105, 88], RAMP.south);
  box(t, "ramp", [87, 96, 88, 105], RAMP.east);
  // The existing rich middle field has four equally wide approaches and open ground around the terrace.
  box(t, "level", [52, 52, 77, 77], 1);
  box(t, "ramp", [60, 51, 69, 52], RAMP.south);
  box(t, "ramp", [77, 60, 78, 69], RAMP.west);
  box(t, "ramp", [60, 77, 69, 78], RAMP.north);
  box(t, "ramp", [51, 60, 52, 69], RAMP.east);
  return t;
}

/** map.layers key → TerrainGrid field. */
const LAYERS = [
  ["height", "level"],
  ["ramps", "ramp"],
  ["surface", "surface"],
  ["water", "water"],
  ["biome", "biome"],
] as const;

/** Schematic preview: surface colours and height shading, orange ramps, gold/blue resources, white spawns. */
export function mapPreview({ terrain: t, spawns, resources = [] }: SandboxMap): Uint8Array {
  const scale = 4;
  const size = t.width * scale;
  const rgba = new Uint8Array(size * size * 4);
  const colours = SURFACES.map((name) => {
    const hex = PALETTE.surfaces[name === "grass" ? "grass-1" : name === "dirt" ? "dirt-1" : name];
    return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  });
  const cell = (x: number, y: number, rgb: number[]) => {
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++)
        rgba.set([...rgb, 255], ((y * scale + dy) * size + x * scale + dx) * 4);
  };
  for (let y = 0; y < t.height; y++)
    for (let x = 0; x < t.width; x++) {
      const i = y * t.width + x;
      const colour = colours[t.surface[i] ?? 0] ?? [0, 0, 0];
      const ground = colour.map((c) => Math.min(255, c + (t.level[i] ?? 0) * 30));
      const water = t.water[i] === WATER.deep ? [44, 87, 135] : [85, 151, 179];
      cell(x, y, t.water[i] ? water : t.ramp[i] ? [232, 139, 57] : ground);
    }
  for (const r of resources) {
    if (r.kind !== "ore") {
      const px = Math.floor(r.position[0]),
        py = Math.floor(r.position[1]),
        extent = r.kind === "materials" ? 1 : 0;
      for (let y = py - extent; y <= py; y++)
        for (let x = px - extent; x <= px; x++)
          if (x >= 0 && y >= 0 && x < t.width && y < t.height)
            cell(x, y, r.kind === "oil" ? [55, 42, 34] : [111, 143, 168]);
      continue;
    }
    for (
      let y = Math.max(0, Math.ceil(r.position[1] - (r.radius ?? 1)));
      y <= Math.min(t.height - 1, r.position[1] + (r.radius ?? 1));
      y++
    )
      for (
        let x = Math.max(0, Math.ceil(r.position[0] - (r.radius ?? 1)));
        x <= Math.min(t.width - 1, r.position[0] + (r.radius ?? 1));
        x++
      )
        if ((x - r.position[0]) ** 2 + (y - r.position[1]) ** 2 <= (r.radius ?? 1) ** 2)
          cell(x, y, r.kind === "ore" ? [224, 178, 58] : [111, 143, 168]);
  }
  for (const s of spawns)
    for (let y = s.position[1] - 1; y <= s.position[1] + 1; y++)
      for (let x = s.position[0] - 1; x <= s.position[0] + 1; x++) cell(x, y, [255, 255, 255]);
  return png(rgba, size);
}

export async function generateSandboxMaps(args: string[] = []): Promise<number> {
  const selectedId = args[0];
  if (
    args.length > 1 ||
    (selectedId !== undefined &&
      selectedId !== "training-grounds" &&
      !Object.hasOwn(SANDBOX_MAPS, selectedId))
  ) {
    console.error(
      `Usage: bun neo generate-sandbox-maps [map-id]\nMap IDs: ${Object.keys(SANDBOX_MAPS).join(", ")}, training-grounds`,
    );
    return 1;
  }
  for (const id of selectedId ? [selectedId] : Object.keys(SANDBOX_MAPS)) {
    const built =
      id === "training-grounds"
        ? ({ ...trainingGrounds, terrain: trainingGroundsTerrain() } as unknown as SandboxMap)
        : SANDBOX_MAPS[id]?.();
    if (!built) continue;
    const { name, description, terrain: t, spawns, resources = [] } = built;
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
    const map =
      id === "training-grounds"
        ? { ...trainingGrounds, layers }
        : {
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
    writeFileSync(`${dir}/preview.png`, mapPreview(built));
    writeFileSync(
      `${dir}/assets.json`,
      `${JSON.stringify(
        {
          files: {
            "preview.png": {
              author: "Borut Balazek",
              source: "apps/cli/src/commands/generate-sandbox-maps.ts",
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `wrote ${dir}: map.json${Object.values(layers)
        .map((f) => `, ${f}`)
        .join("")}`,
    );
  }
  return 0;
}
