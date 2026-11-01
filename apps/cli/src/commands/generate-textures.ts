// bun neo generate-textures [pack]: the pack's palette texture and tileable surface detail tiles, made procedurally from a
// fixed seed (docs/design/terrain-and-biomes.md#textures). This file is their source: edit it and rerun, never the PNGs.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { png } from "../glb-writer";

const TILE = 128; // detail tile size; a power of two, so coordinates wrap with a mask
const SWATCH = 16; // palette swatch size; the palette is 16 × 16 swatches
const SEED = 0x6e656f;
const AUTHOR = "Borut Balazek";
const SOURCE = "apps/cli/src/commands/generate-textures.ts";

/**
 * Provisional colours until the art direction sign-off (docs/project/human-tasks.md). palette.png holds one swatch per
 * entry, row-major in this order: material slots, then four shades of each surface (the per-cell variation), then
 * prop colours. Brick model sources use the same hex values.
 */
export const PALETTE = {
  slots: {
    palette: "#8a8f96",
    team: "#9aa3b2",
    team_dark: "#6b7280",
    team_light: "#c5ccd6",
    team_emissive: "#dfe6f0",
    metal: "#9ea3a8",
    glass: "#7fb8d8",
    emissive: "#ffd36a",
  },
  surfaces: {
    "grass-1": "#5f9a3a",
    "grass-2": "#78ad46",
    "grass-3": "#4a7d33",
    "dirt-1": "#8a6a45",
    "dirt-2": "#9a7d57",
    "dirt-3": "#6f5338",
    sand: "#d8c08a",
    rock: "#7d7f82",
    snow: "#e9eef3",
    ice: "#a9d4e6",
    road: "#46494e",
    rubble: "#6e6a64",
    ore: "#7a5e2a",
  },
  props: {
    bark: "#6b4a2b",
    "bark-grey": "#5e5248",
    "bark-palm": "#8b6a43",
    leaf: "#4f8a35",
    "leaf-dark": "#3f6e2c",
    "leaf-light": "#66a344",
    pine: "#2f5a34",
    "pine-dark": "#26492b",
    frond: "#5b8f3a",
    cactus: "#4f7f3b",
    acacia: "#7a8f3c",
    "dry-brush": "#a88f5c",
    berry: "#b03a3a",
    reed: "#6f8f45",
    cattail: "#5a3e26",
    "rock-dark": "#6c6f73",
    rock: "#7f8285",
    "rock-light": "#969a9e",
    "sandstone-dark": "#b0844f",
    sandstone: "#c49a62",
    "sandstone-light": "#d8b27a",
    "arctic-rock": "#4c5157",
    "arctic-rock-light": "#5f656c",
    snow: "#eef3f7",
    ice: "#9fd3e8",
    "ice-light": "#c9ecf6",
    crate: "#a0773f",
    "crate-dark": "#7a5a2e",
    sandbag: "#b9a77a",
    "sandbag-dark": "#a8966a",
    steel: "#5d6166",
    rust: "#7a4e33",
    charred: "#3b3734",
    "charred-light": "#4f4a46",
    brick: "#9a4a3a",
    "brick-dark": "#843d30",
    concrete: "#a8a59e",
    "concrete-dark": "#8c8983",
    adobe: "#b98a5a",
    "adobe-dark": "#a77a4e",
    "car-red": "#8f4b3f",
    dumpster: "#3f6b4a",
    "drum-blue": "#3d6fa8",
    "drum-red": "#a8443d",
    "drum-yellow": "#c9a23a",
    pole: "#4a4e54",
    "lamp-glow": "#ffe39a",
    gold: "#e0b23a",
    "gold-dark": "#b8892a",
    "gold-light": "#f4d675",
    vein: "#6f8fa8",
    "vein-light": "#9cbcd4",
    pit: "#2f2b28",
    oil: "#1d1c1f",
    "flag-orange": "#e0662e",
  },
} as const;

type RGB = [number, number, number];
type Tile = Float32Array; // RGB per pixel, 0–255, row-major
const SHADES = [0.9, 0.96, 1, 1.06];

const rgb = (hex: string): RGB =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as RGB;
const surface = (name: keyof typeof PALETTE.surfaces) => rgb(PALETTE.surfaces[name]);
const prop = (name: keyof typeof PALETTE.props) => rgb(PALETTE.props[name]);

/** Integer hash of (x, y, seed) to [0, 1). */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value noise on a lattice of `cell` pixels that wraps at the tile edge, so tiles repeat seamlessly. */
function noise(x: number, y: number, cell: number, s: number): number {
  const n = TILE / cell;
  const [gx, gy] = [x / cell, y / cell];
  const [x0, y0] = [Math.floor(gx), Math.floor(gy)];
  const v = (i: number, j: number) => hash((x0 + i) % n, (y0 + j) % n, s);
  const [fx, fy] = [smooth(gx - x0), smooth(gy - y0)];
  return lerp(lerp(v(0, 0), v(1, 0), fx), lerp(v(0, 1), v(1, 1), fx), fy);
}
const fbm = (x: number, y: number, s: number) =>
  0.5 * noise(x, y, 32, s) + 0.3 * noise(x, y, 16, s + 1) + 0.2 * noise(x, y, 8, s + 2);

const at = (x: number, y: number) => ((y & (TILE - 1)) * TILE + (x & (TILE - 1))) * 3;
function shade(t: Tile, x: number, y: number, f: number) {
  const i = at(x, y);
  for (let c = 0; c < 3; c++) t[i + c] = (t[i + c] ?? 0) * f;
}
function each(fn: (x: number, y: number) => void) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) fn(x, y);
}
function fill(color: RGB): Tile {
  const t = new Float32Array(TILE * TILE * 3);
  each((x, y) => t.set(color, at(x, y)));
  return t;
}

// --- Detail layers. Every one wraps at the tile edge. ------------------------------------------

/** Soft large-scale variation. */
const grain = (t: Tile, amount: number, s: number) =>
  each((x, y) => shade(t, x, y, 1 + amount * (fbm(x, y, s) - 0.5) * 2));

/** Single lighter or darker pixels. */
const speckle = (t: Tile, density: number, amount: number, s: number) =>
  each((x, y) => {
    const h = hash(x, y, s);
    if (h < density) shade(t, x, y, h < density / 2 ? 1 - amount : 1 + amount);
  });

/** Brick studs on a `pitch` grid: lit top-left, rim and drop shadow bottom-right. */
const studs = (t: Tile, pitch: number, strength: number) =>
  each((x, y) => {
    const [u, v] = [(x % pitch) - pitch / 2 + 0.5, (y % pitch) - pitch / 2 + 0.5];
    const r2 = (pitch * 0.3) ** 2;
    const d2 = u * u + v * v;
    if (d2 < r2) {
      const lit = (-u - v) / (pitch * 0.42);
      shade(t, x, y, 1 + strength * (0.25 + 0.6 * lit - (d2 > r2 * 0.7 ? 0.5 : 0)));
    } else if ((u - 1.5) ** 2 + (v - 1.5) ** 2 < r2) shade(t, x, y, 1 - strength * 0.7);
  });

/** Plate seams every `w` × `h` pixels (rows offset by half for running bond), each plate a slightly different shade. */
const seams = (
  t: Tile,
  w: number,
  h: number,
  strength: number,
  bond: boolean,
  vary: number,
  s: number,
) =>
  each((x, y) => {
    const row = Math.floor(y / h);
    const xo = x + (bond && row % 2 === 1 ? w / 2 : 0);
    const [px, py] = [xo % w, y % h];
    let f = 1 + vary * (hash(Math.floor(xo / w) % (TILE / w), row, s) - 0.5) * 2;
    if (px === 0 || py === 0) f *= 1 - strength;
    else if (px === 1 || py === 1) f *= 1 + strength * 0.5;
    shade(t, x, y, f);
  });

/** Wind ripples across sand. */
const ripples = (t: Tile, amount: number, s: number) =>
  each((x, y) => {
    const p = ((((y + 8 * noise(x, y, 32, s)) / 16) % 1) + 1) % 1;
    shade(t, x, y, 1 + amount * (Math.abs(p - 0.5) * 4 - 1));
  });

/** Diagonal glints across ice. */
const streaks = (t: Tile, amount: number, s: number) =>
  each((x, y) => {
    const d = (x + y + Math.floor(10 * noise(x, y, 32, s))) % 32;
    if (d < 2) shade(t, x, y, 1 + amount);
    else if (d < 4) shade(t, x, y, 1 + amount * 0.4);
  });

/** Scattered rectangles in `colors` with a lit top-left and shaded bottom-right edge: pebbles, chips, brick bits. */
function fragments(t: Tile, count: number, [min, max]: [number, number], colors: RGB[], s: number) {
  for (let k = 0; k < count; k++) {
    const [x0, y0] = [Math.floor(hash(k, 1, s) * TILE), Math.floor(hash(k, 2, s) * TILE)];
    const w = min + Math.floor(hash(k, 3, s) * (max - min + 1));
    const h = min + Math.floor(hash(k, 4, s) * (max - min + 1));
    const color = colors[Math.floor(hash(k, 5, s) * colors.length)] as RGB;
    const tint = 0.92 + hash(k, 6, s) * 0.16;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 ? 1.15 : x === w - 1 || y === h - 1 ? 0.8 : 1;
        t.set(
          color.map((c) => c * tint * edge),
          at(x0 + x, y0 + y),
        );
      }
    }
  }
}

// --- The tiles ---------------------------------------------------------------------------------

const lighter = (c: RGB, f: number): RGB => c.map((v) => v * f) as RGB;

function grass(name: "grass-1" | "grass-2" | "grass-3", s: number): Tile {
  const base = surface(name);
  const t = fill(base);
  grain(t, 0.08, s);
  seams(t, 32, 32, 0.05, false, 0.03, s);
  studs(t, 16, 0.1);
  fragments(t, 70, [1, 2], [lighter(base, 1.18), lighter(base, 0.82)], s + 7);
  if (name === "grass-2")
    fragments(
      t,
      6,
      [1, 1],
      [
        [236, 214, 92],
        [240, 240, 232],
      ],
      s + 9,
    );
  return t;
}

function dirt(name: "dirt-1" | "dirt-2" | "dirt-3", s: number): Tile {
  const base = surface(name);
  const t = fill(base);
  grain(t, 0.1, s);
  if (name === "dirt-3") seams(t, 32, 16, 0.08, true, 0.06, s);
  else {
    seams(t, 32, 32, 0.06, false, 0.04, s);
    studs(t, 16, name === "dirt-1" ? 0.08 : 0.05);
  }
  if (name === "dirt-2") fragments(t, 40, [2, 3], [[150, 140, 128], lighter(base, 1.2)], s + 7);
  speckle(t, 0.04, 0.08, s + 3);
  return t;
}

/** Name → generator, in contact-sheet order. Each gets its own seed offset so tiles differ. */
export const TILES: Record<string, () => Tile> = {
  "grass-1": () => grass("grass-1", SEED),
  "grass-2": () => grass("grass-2", SEED + 10),
  "grass-3": () => grass("grass-3", SEED + 20),
  "dirt-1": () => dirt("dirt-1", SEED + 30),
  "dirt-2": () => dirt("dirt-2", SEED + 40),
  "dirt-3": () => dirt("dirt-3", SEED + 50),
  sand: () => {
    const t = fill(surface("sand"));
    grain(t, 0.05, SEED + 60);
    ripples(t, 0.04, SEED + 61);
    seams(t, 64, 64, 0.03, false, 0.02, SEED + 62);
    speckle(t, 0.03, 0.05, SEED + 63);
    return t;
  },
  rock: () => {
    const t = fill(surface("rock"));
    grain(t, 0.1, SEED + 70);
    seams(t, 32, 16, 0.14, true, 0.1, SEED + 71);
    speckle(t, 0.06, 0.08, SEED + 72);
    return t;
  },
  snow: () => {
    const t = fill(surface("snow"));
    grain(t, 0.04, SEED + 80);
    studs(t, 16, 0.04);
    speckle(t, 0.006, 0.08, SEED + 81);
    return t;
  },
  ice: () => {
    const t = fill(surface("ice"));
    grain(t, 0.06, SEED + 90);
    streaks(t, 0.1, SEED + 91);
    seams(t, 64, 64, 0.06, false, 0.03, SEED + 92);
    return t;
  },
  road: () => {
    const t = fill(surface("road"));
    grain(t, 0.05, SEED + 100);
    seams(t, 32, 32, 0.12, false, 0.03, SEED + 101);
    speckle(t, 0.1, 0.12, SEED + 102);
    return t;
  },
  rubble: () => {
    const t = fill(surface("rubble"));
    grain(t, 0.08, SEED + 110);
    fragments(
      t,
      110,
      [3, 9],
      [prop("concrete"), prop("concrete-dark"), prop("brick"), prop("charred-light")],
      SEED + 111,
    );
    speckle(t, 0.04, 0.1, SEED + 112);
    return t;
  },
  ore: () => {
    const t = fill(surface("ore"));
    grain(t, 0.1, SEED + 120);
    studs(t, 16, 0.08);
    fragments(t, 45, [2, 4], [prop("gold"), prop("gold-light"), prop("gold-dark")], SEED + 121);
    return t;
  },
};

const toRgba = (t: Tile): Uint8Array => {
  const out = new Uint8Array(TILE * TILE * 4);
  for (let p = 0; p < TILE * TILE; p++) {
    for (let c = 0; c < 3; c++)
      out[p * 4 + c] = Math.max(0, Math.min(255, Math.round(t[p * 3 + c] ?? 0)));
    out[p * 4 + 3] = 255;
  }
  return out;
};

/** The palette texture, 256 × 256: one 16 px swatch per PALETTE entry, row-major; unused swatches are black. */
export function palette(): Uint8Array {
  const size = SWATCH * 16;
  const swatches: RGB[] = [
    ...Object.values(PALETTE.slots).map(rgb),
    ...Object.values(PALETTE.surfaces).flatMap((hex) => SHADES.map((f) => lighter(rgb(hex), f))),
    ...Object.values(PALETTE.props).map(rgb),
  ];
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = swatches[Math.floor(y / SWATCH) * 16 + Math.floor(x / SWATCH)] ?? [0, 0, 0];
      out.set([...c.map((v) => Math.round(Math.min(255, v))), 255], (y * size + x) * 4);
    }
  }
  return out;
}

/** Every texture as RGBA: name → [pixels, size]. */
export function textures(): Map<string, [Uint8Array, number]> {
  const out = new Map<string, [Uint8Array, number]>([["palette", [palette(), SWATCH * 16]]]);
  for (const [name, make] of Object.entries(TILES)) out.set(name, [toRgba(make()), TILE]);
  return out;
}

export async function generateTextures(args: string[]): Promise<number> {
  const dir = join("content", args[0] ?? "core", "textures");
  mkdirSync(dir, { recursive: true });
  const files: Record<string, { author: string; source: string }> = {};
  for (const [name, [rgba, size]] of textures()) {
    writeFileSync(join(dir, `${name}.png`), png(rgba, size));
    files[`${name}.png`] = { author: AUTHOR, source: SOURCE };
  }
  writeFileSync(join(dir, "assets.json"), `${JSON.stringify({ files }, null, 2)}\n`);
  console.log(`wrote ${Object.keys(files).length} textures in ${dir}`);
  return 0;
}
