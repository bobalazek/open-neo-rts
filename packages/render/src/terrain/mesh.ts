// Terrain chunk geometry as flat arrays: bevelled cell tops, one-cell ramps, brick cliff faces and water quads.
// World axes (right-handed): x east, y up, z south; cell (x, y) spans [x, x + 1] × [y, y + 1] cells on x and z.

import { BIOMES, RAMP, SURFACES, type TerrainGrid, WATER } from "@open-neo-rts/content";
import { PALETTES, type Palette } from "./biomes";

/** Metres per cell. */
export const CELL_SIZE = 2;
/** Metres per height level: three brick courses. */
export const LEVEL_HEIGHT = 1.8;
export const BRICK_HEIGHT = 0.6;
/** Cells per chunk side. Each chunk is one terrain mesh and at most one water mesh. */
export const CHUNK_SIZE = 16;
/** Cells of darkened terrain drawn past each map edge. */
export const BORDER = 8;

const BEVEL = 0.1;
const SHALLOW_DEPTH = BRICK_HEIGHT;
const DEEP_DEPTH = LEVEL_HEIGHT;
/** The water surface sits this far below the top of its level. */
const WATER_DROP = 0.2;
/** Bottom of the brick skirt around the outside of the border. */
const BASE = -DEEP_DEPTH - 2 * BRICK_HEIGHT;
const BORDER_SHADE = 0.5;
const SHADES = [0.92, 0.96, 1, 1.04];
const EPS = 1e-4;

// Corners: 0 NW, 1 NE, 2 SE, 3 SW. Edges walk the cell boundary with the cell on the left (p → q), and name the
// neighbour's corners that sit on our p and q.
const CORNER_X = [0, 1, 1, 0];
const CORNER_Y = [0, 0, 1, 1];
const EDGES = [
  { dx: -1, dy: 0, p: 0, q: 3, np: 1, nq: 2 },
  { dx: 0, dy: 1, p: 3, q: 2, np: 0, nq: 1 },
  { dx: 1, dy: 0, p: 2, q: 1, np: 3, nq: 0 },
  { dx: 0, dy: -1, p: 1, q: 0, np: 2, nq: 3 },
];
/** The two corners a ramp lifts by one level, by RAMP value. */
const RAMP_HIGH: Record<number, [number, number]> = {
  [RAMP.north]: [0, 1],
  [RAMP.east]: [1, 2],
  [RAMP.south]: [2, 3],
  [RAMP.west]: [3, 0],
};

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkGeometry {
  /** Chunk coordinates; chunk (0, 0) starts at cell (0, 0), border chunks are negative or past the map. */
  cx: number;
  cy: number;
  terrain: Geometry;
  water: Geometry | null;
}

/** 32-bit integer hash of two integers. Render-only, but the same on every machine. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Grid index of a cell; cells in the border repeat the nearest edge cell. */
function sample(g: TerrainGrid, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= g.width ? g.width - 1 : x;
  const cy = y < 0 ? 0 : y >= g.height ? g.height - 1 : y;
  return cy * g.width + cx;
}

/**
 * Height in metres of every cell's 4 top corners at the cell edge (below the bevel), over the map plus border:
 * index ((y + BORDER) * (width + 2 * BORDER) + x + BORDER) * 4 + corner.
 */
export function cornerHeights(g: TerrainGrid): Float32Array {
  const ew = g.width + 2 * BORDER;
  const eh = g.height + 2 * BORDER;
  const out = new Float32Array(ew * eh * 4);
  for (let ey = 0; ey < eh; ey++) {
    for (let ex = 0; ex < ew; ex++) {
      const i = sample(g, ex - BORDER, ey - BORDER);
      const o = (ey * ew + ex) * 4;
      const low = (g.level[i] ?? 0) * LEVEL_HEIGHT - BEVEL;
      const high = RAMP_HIGH[g.ramp[i] ?? 0];
      if (high) {
        out.fill(low, o, o + 4);
        out[o + high[0]] = low + LEVEL_HEIGHT;
        out[o + high[1]] = low + LEVEL_HEIGHT;
      } else {
        const water = g.water[i];
        const depth =
          water === WATER.deep ? DEEP_DEPTH : water === WATER.shallow ? SHALLOW_DEPTH : 0;
        out.fill(low - depth, o, o + 4);
      }
    }
  }
  return out;
}

type RGB = [number, number, number];

function rgb(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

class Builder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private i: number[] = [];

  /**
   * A planar quad a b c d, counter-clockwise seen from the front. The normal is the cross of its diagonals, so a
   * quad with two coincident corners (a triangle) still gets one.
   */
  quad(v: number[], color: RGB, shade: number) {
    const [ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, cx = 0, cy = 0, cz = 0] = v;
    const [dx = 0, dy = 0, dz = 0] = v.slice(9);
    const ux = cx - ax;
    const uy = cy - ay;
    const uz = cz - az;
    const wx = dx - bx;
    const wy = dy - by;
    const wz = dz - bz;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const base = this.p.length / 3;
    for (let k = 0; k < 4; k++) {
      this.p.push(v[k * 3] ?? 0, v[k * 3 + 1] ?? 0, v[k * 3 + 2] ?? 0);
      this.n.push(nx, ny, nz);
      this.c.push(color[0] * shade, color[1] * shade, color[2] * shade, 1);
    }
    // Babylon's default front face is clockwise in index order, even in a right-handed scene.
    this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  done(): Geometry | null {
    if (this.i.length === 0) return null;
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Float32Array(this.c),
      indices: new Uint32Array(this.i),
    };
  }
}

const colours = (p: Palette) => ({
  surfaces: SURFACES.map((s) => rgb(p.surfaces[s])),
  cliff: rgb(p.cliff),
  shallow: rgb(p.shallow),
  deep: rgb(p.deep),
});

/** Builds every chunk of the map plus its border, each cell in its biome's palette. Empty chunks are skipped. */
export function buildTerrainGeometry(g: TerrainGrid): ChunkGeometry[] {
  const corners = cornerHeights(g);
  const ew = g.width + 2 * BORDER;
  const eh = g.height + 2 * BORDER;
  const corner = (x: number, y: number, k: number) => {
    const ex = x + BORDER;
    const ey = y + BORDER;
    return ex < 0 || ey < 0 || ex >= ew || ey >= eh ? BASE : (corners[(ey * ew + ex) * 4 + k] ?? 0);
  };
  const fallback = colours(PALETTES.temperate);
  const palettes = BIOMES.map((b) => colours(PALETTES[b]));
  const C = CELL_SIZE;

  const chunks: ChunkGeometry[] = [];
  const first = Math.floor(-BORDER / CHUNK_SIZE);
  for (let cy = first; cy * CHUNK_SIZE < g.height + BORDER; cy++) {
    for (let cx = first; cx * CHUNK_SIZE < g.width + BORDER; cx++) {
      const land = new Builder();
      const water = new Builder();
      const x1 = Math.min((cx + 1) * CHUNK_SIZE, g.width + BORDER);
      const y1 = Math.min((cy + 1) * CHUNK_SIZE, g.height + BORDER);
      for (let y = Math.max(cy * CHUNK_SIZE, -BORDER); y < y1; y++) {
        for (let x = Math.max(cx * CHUNK_SIZE, -BORDER); x < x1; x++) {
          const i = sample(g, x, y);
          const dark = x >= 0 && y >= 0 && x < g.width && y < g.height ? 1 : BORDER_SHADE;
          const { surfaces, cliff, shallow, deep } = palettes[g.biome[i] ?? 0] ?? fallback;
          const color = surfaces[g.surface[i] ?? 0] ?? surfaces[0] ?? cliff;
          const shade = (SHADES[hash2(x, y) % SHADES.length] ?? 1) * dark;
          const h = [0, 1, 2, 3].map((k) => corner(x, y, k));
          const [hnw = 0, hne = 0, hse = 0, hsw = 0] = h;
          const x0 = x * C;
          const z0 = y * C;
          const xe = x0 + C;
          const ze = z0 + C;
          const isRamp = (g.ramp[i] ?? 0) !== RAMP.none;

          if (isRamp) {
            land.quad([x0, hnw, z0, x0, hsw, ze, xe, hse, ze, xe, hne, z0], color, shade);
          } else {
            const t = hnw + BEVEL;
            const b = BEVEL;
            land.quad(
              [x0 + b, t, z0 + b, x0 + b, t, ze - b, xe - b, t, ze - b, xe - b, t, z0 + b],
              color,
              shade,
            );
            land.quad(
              [x0, hnw, z0, x0, hsw, ze, x0 + b, t, ze - b, x0 + b, t, z0 + b],
              color,
              shade,
            );
            land.quad(
              [x0, hsw, ze, xe, hse, ze, xe - b, t, ze - b, x0 + b, t, ze - b],
              color,
              shade,
            );
            land.quad(
              [xe, hse, ze, xe, hne, z0, xe - b, t, z0 + b, xe - b, t, ze - b],
              color,
              shade,
            );
            land.quad(
              [xe, hne, z0, x0, hnw, z0, x0 + b, t, z0 + b, xe - b, t, z0 + b],
              color,
              shade,
            );
          }

          const waterKind = isRamp ? WATER.none : (g.water[i] ?? WATER.none);
          const surface = (g.level[i] ?? 0) * LEVEL_HEIGHT - WATER_DROP;
          if (waterKind !== WATER.none) {
            const tint = waterKind === WATER.deep ? deep : shallow;
            water.quad(
              [x0, surface, z0, x0, surface, ze, xe, surface, ze, xe, surface, z0],
              tint,
              dark,
            );
          }

          for (const e of EDGES) {
            const ap = h[e.p] ?? 0;
            const aq = h[e.q] ?? 0;
            const bp = Math.min(ap, corner(x + e.dx, y + e.dy, e.np));
            const bq = Math.min(aq, corner(x + e.dx, y + e.dy, e.nq));
            const px = (x + (CORNER_X[e.p] ?? 0)) * C;
            const pz = (y + (CORNER_Y[e.p] ?? 0)) * C;
            const qx = (x + (CORNER_X[e.q] ?? 0)) * C;
            const qz = (y + (CORNER_Y[e.q] ?? 0)) * C;
            const wall = (
              t0: number,
              t1: number,
              b0: number,
              b1: number,
              a0: number,
              a1: number,
            ) => [
              px + (qx - px) * t0,
              b0,
              pz + (qz - pz) * t0,
              px + (qx - px) * t1,
              b1,
              pz + (qz - pz) * t1,
              px + (qx - px) * t1,
              a1,
              pz + (qz - pz) * t1,
              px + (qx - px) * t0,
              a0,
              pz + (qz - pz) * t0,
            ];
            // Water at the outer skirt: close the gap between the bed wall and the water surface.
            if (waterKind !== WATER.none && corner(x + e.dx, y + e.dy, e.np) === BASE) {
              const tint = waterKind === WATER.deep ? deep : shallow;
              water.quad(wall(0, 1, ap, aq, surface, surface), tint, dark);
            }
            if (ap - bp < EPS && aq - bq < EPS) continue;
            if (Math.abs(ap - aq) > EPS || Math.abs(bp - bq) > EPS) {
              land.quad(wall(0, 1, bp, bq, ap, aq), cliff, shade);
              continue;
            }
            // Stacked bricks in running bond: odd courses are split at the middle of the cell edge.
            const along = e.dx === 0 ? 0 : 1;
            const line = e.dx === 0 ? y + (CORNER_Y[e.p] ?? 0) : x + (CORNER_X[e.p] ?? 0);
            const courses = Math.max(1, Math.round((ap - bp) / BRICK_HEIGHT));
            const step = (ap - bp) / courses;
            for (let k = 0; k < courses; k++) {
              const lo = bp + k * step;
              const course = Math.round((lo + BEVEL) / BRICK_HEIGHT);
              const odd = course & 1;
              for (const [t0, t1] of odd
                ? [
                    [0, 0.5],
                    [0.5, 1],
                  ]
                : [[0, 1]]) {
                const mid = ((t0 ?? 0) + (t1 ?? 0)) / 2;
                const u = along ? pz + (qz - pz) * mid : px + (qx - px) * mid;
                const brick = Math.floor(u / C + odd * 0.5);
                const tone =
                  SHADES[hash2(brick * 2 + along, course * 4099 + line) % SHADES.length] ?? 1;
                land.quad(wall(t0 ?? 0, t1 ?? 1, lo, lo, lo + step, lo + step), cliff, tone * dark);
              }
            }
          }
        }
      }
      const terrain = land.done();
      if (terrain) chunks.push({ cx, cy, terrain, water: water.done() });
    }
  }
  return chunks;
}
