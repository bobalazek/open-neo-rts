// Procedural 64×64 demo terrain until real maps load: plateaus on levels 0–3 with inner and outer cliff corners,
// ramps facing all four directions, a pillar, a lake with a shallow shore band, a road and every surface.

import { RAMP, SURFACES, type Surface, type TerrainGrid, WATER } from "@open-neo-rts/content";
import { hash2 } from "./mesh";

const SIZE = 64;

export function createDemoGrid(): TerrainGrid {
  const n = SIZE * SIZE;
  const g: TerrainGrid = {
    width: SIZE,
    height: SIZE,
    level: new Uint8Array(n),
    ramp: new Uint8Array(n),
    surface: new Uint8Array(n),
    water: new Uint8Array(n),
  };
  // Fills [x0, x1) × [y0, y1).
  const fill = (x0: number, y0: number, x1: number, y1: number, set: (i: number) => void) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(y * SIZE + x);
  };
  const level = (l: number) => (i: number) => {
    g.level[i] = l;
  };
  const surface = (s: Surface) => (i: number) => {
    g.surface[i] = SURFACES.indexOf(s);
  };
  const ramp = (l: number, r: number) => (i: number) => {
    g.level[i] = l;
    g.ramp[i] = r;
    g.surface[i] = SURFACES.indexOf("dirt");
  };

  // Dirt patches on the grass.
  fill(0, 0, SIZE, SIZE, (i) => {
    if (hash2((i % SIZE) >> 2, Math.floor(i / SIZE) >> 2) % 6 === 0) surface("dirt")(i);
  });

  // An L-shaped level-1 plateau (inner corner at 20, 20), level 2 of rock on it, a snowy level-3 top.
  fill(6, 6, 30, 20, level(1));
  fill(6, 20, 20, 30, level(1));
  fill(10, 10, 22, 18, level(2));
  fill(10, 10, 22, 18, surface("rock"));
  fill(13, 12, 18, 16, level(3));
  fill(13, 12, 18, 16, surface("snow"));
  // A second level-1 plateau with ice and a one-cell level-2 pillar.
  fill(40, 38, 58, 54, level(1));
  fill(42, 40, 47, 44, surface("ice"));
  fill(50, 46, 51, 47, level(2));

  // Ramps: each sits on its lower level and faces the cell one level up.
  fill(10, 30, 13, 31, ramp(0, RAMP.north));
  fill(5, 12, 6, 15, ramp(0, RAMP.east));
  fill(30, 9, 31, 12, ramp(0, RAMP.west));
  fill(14, 9, 17, 10, ramp(1, RAMP.south));
  fill(22, 13, 23, 15, ramp(1, RAMP.west));
  fill(12, 13, 13, 15, ramp(2, RAMP.east));
  fill(46, 54, 49, 55, ramp(0, RAMP.north));

  // A lake: deep in the middle, a shallow band at least 2 cells wide, a sandy shore.
  fill(36, 8, 57, 29, (i) => {
    const dx = (i % SIZE) - 46;
    const dy = Math.floor(i / SIZE) - 18;
    const d = dx * dx + dy * dy;
    if (d < 25) g.water[i] = WATER.deep;
    else if (d < 56) g.water[i] = WATER.shallow;
    if (d < 81) surface("sand")(i);
  });

  // Roads: east-west across the map, and a spur up to the north-facing ramp.
  fill(0, 34, SIZE, 36, surface("road"));
  fill(10, 31, 13, 34, surface("road"));
  fill(24, 40, 30, 46, surface("rubble"));
  return g;
}
