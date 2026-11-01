import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BIOMES, checkTerrain, RAMP, SURFACES, WATER } from "@open-neo-rts/content";
import trainingGrounds from "../../../../content/core/maps/training-grounds/map.json";
import { mapPreview, SANDBOX_MAPS, trainingGroundsTerrain } from "./generate-sandbox-maps";

for (const [id, build] of Object.entries(SANDBOX_MAPS)) {
  test(`${id} follows the terrain rules, with spawns on dry land off ramps`, () => {
    const { terrain: t, spawns } = build();
    expect(checkTerrain(t)).toEqual([]);
    for (const s of spawns) {
      const i = s.position[1] * t.width + s.position[0];
      expect([s.id, t.water[i], t.ramp[i]]).toEqual([s.id, WATER.none, RAMP.none]);
    }
  });
}

test("the CLI writes only the requested map and rejects invalid selection before writing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "neo-map-selection-"));
  const cli = join(import.meta.dir, "../index.ts");
  const run = (...args: string[]) =>
    Bun.spawnSync([process.execPath, cli, "generate-sandbox-maps", ...args], { cwd });
  try {
    for (const args of [["unknown"], ["../sandbox-flat"], ["sandbox-flat", "sandbox-terrain"]]) {
      const result = run(...args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("Usage:");
      expect(readdirSync(cwd)).toEqual([]);
    }
    expect(run("sandbox-flat").exitCode).toBe(0);
    expect(readdirSync(join(cwd, "content/core/maps"))).toEqual(["sandbox-flat"]);
    const map = JSON.parse(
      readFileSync(join(cwd, "content/core/maps/sandbox-flat/map.json"), "utf8"),
    );
    expect(map.id).toBe("map:sandbox-flat");
    const preview = readFileSync(join(cwd, "content/core/maps/sandbox-flat/preview.png"));
    expect([...preview.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(preview.readUInt32BE(16)).toBe(256);
    expect(preview.readUInt32BE(20)).toBe(256);
    const assets = JSON.parse(
      readFileSync(join(cwd, "content/core/maps/sandbox-flat/assets.json"), "utf8"),
    );
    expect(assets.files["preview.png"]).toEqual({
      author: "Borut Balazek",
      source: "apps/cli/src/commands/generate-sandbox-maps.ts",
    });
    expect(run("sandbox-biomes").exitCode).toBe(0);
    expect(readdirSync(join(cwd, "content/core/maps")).sort()).toEqual([
      "sandbox-biomes",
      "sandbox-flat",
    ]);
    const biomes = SANDBOX_MAPS["sandbox-biomes"]?.().terrain;
    expect(readFileSync(join(cwd, "content/core/maps/sandbox-biomes/biome.r8"))).toEqual(
      Buffer.from(biomes?.biome ?? []),
    );
    expect(readFileSync(join(cwd, "content/core/maps/sandbox-biomes/surface.r8"))).toEqual(
      Buffer.from(biomes?.surface ?? []),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("sandbox-biomes is 128 square with four equal, correctly painted quadrants", () => {
  const t = SANDBOX_MAPS["sandbox-biomes"]?.().terrain;
  expect(t).toBeDefined();
  if (!t) return;
  expect([t.width, t.height]).toEqual([128, 128]);
  expect(BIOMES).toEqual(["temperate", "desert", "arctic", "urban"]);
  const surface = (name: (typeof SURFACES)[number]) => SURFACES.indexOf(name);
  for (let y = 0; y < 128; y++) {
    expect([...t.biome.subarray(y * 128, (y + 1) * 128)]).toEqual([
      ...Array(64).fill(y < 64 ? 0 : 2),
      ...Array(64).fill(y < 64 ? 1 : 3),
    ]);
    expect([...t.surface.subarray(y * 128, (y + 1) * 128)]).toEqual([
      ...Array(64).fill(surface(y < 64 ? "grass" : "snow")),
      ...Array(64).fill(surface(y < 64 ? "sand" : "road")),
    ]);
  }
});

test("map previews are reproducible", () => {
  for (const build of Object.values(SANDBOX_MAPS))
    expect(mapPreview(build())).toEqual(mapPreview(build()));
});

test("Training Grounds keeps clear bases and connected resources on symmetric terrain", () => {
  const t = trainingGroundsTerrain();
  expect(checkTerrain(t)).toEqual([]);
  const at = (x: number, y: number) => y * t.width + x;
  for (const s of trainingGrounds.spawns) {
    const [sx = 0, sy = 0] = s.position;
    for (let y = sy - 6; y <= sy + 6; y++)
      for (let x = sx - 6; x <= sx + 6; x++)
        expect([t.level[at(x, y)], t.ramp[at(x, y)], t.water[at(x, y)]]).toEqual([1, 0, 0]);
  }
  const steps = [
    [0, -1, RAMP.north],
    [1, 0, RAMP.east],
    [0, 1, RAMP.south],
    [-1, 0, RAMP.west],
  ] as const;
  const opposite = [RAMP.none, RAMP.south, RAMP.west, RAMP.north, RAMP.east];
  const distances: number[][] = [];
  for (const s of trainingGrounds.spawns) {
    const [sx = 0, sy = 0] = s.position;
    const distance = new Int32Array(t.width * t.height).fill(-1);
    const queue = [at(sx, sy)];
    distance[queue[0] ?? 0] = 0;
    for (let n = 0; n < queue.length; n++) {
      const i = queue[n] ?? 0;
      const x = i % t.width;
      const y = Math.floor(i / t.width);
      for (const [dx, dy, ramp] of steps) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= t.width || ny >= t.height) continue;
        const j = at(nx, ny);
        if (distance[j] !== -1 || t.water[j]) continue;
        const diff = (t.level[j] ?? 0) - (t.level[i] ?? 0);
        const up = diff === 1 && t.ramp[i] === ramp;
        const down = diff === -1 && t.ramp[j] === opposite[ramp];
        if (diff !== 0 && !up && !down) continue;
        distance[j] = (distance[i] ?? 0) + 1;
        queue.push(j);
      }
    }
    expect(queue.length).toBe(t.width * t.height);
    const resources = trainingGrounds.resources.map(
      (r) => distance[at(r.position[0] ?? 0, r.position[1] ?? 0)] ?? -1,
    );
    expect(resources.every((d) => d >= 0)).toBe(true);
    distances.push(resources);
  }
  // Every start has the same distance to the middle and the same multiset of resource distances.
  expect(distances.map((d) => d[4])).toEqual([88, 88, 88, 88]);
  for (const distance of distances) distance.sort((a, b) => a - b);
  for (const distance of distances.slice(1)) expect(distance).toEqual(distances[0] ?? []);
  for (let y = 1; y < 128; y++)
    for (let x = 1; x < 128; x++) {
      const i = at(x, y),
        j = at(128 - x, 128 - y);
      expect(t.level[i]).toBe(t.level[j]);
      expect(t.ramp[j]).toBe(opposite[t.ramp[i] ?? 0]);
    }
  expect([...t.ramp].filter((r) => r !== RAMP.none).length).toBe(108);
});

test("Training Grounds generation preserves metadata and is excluded from the sandbox default", () => {
  const cwd = mkdtempSync(join(tmpdir(), "neo-training-terrain-"));
  const cli = join(import.meta.dir, "../index.ts");
  const run = (...args: string[]) =>
    Bun.spawnSync([process.execPath, cli, "generate-sandbox-maps", ...args], { cwd });
  try {
    expect(run("training-grounds").exitCode).toBe(0);
    const dir = join(cwd, "content/core/maps/training-grounds");
    const generated = JSON.parse(readFileSync(join(dir, "map.json"), "utf8"));
    expect(generated).toEqual({
      ...trainingGrounds,
      layers: { height: "height.r8", ramps: "ramps.r8" },
    });
    const t = trainingGroundsTerrain();
    expect(readFileSync(join(dir, "height.r8"))).toEqual(Buffer.from(t.level));
    expect(readFileSync(join(dir, "ramps.r8"))).toEqual(Buffer.from(t.ramp));
    rmSync(dir, { recursive: true });
    expect(run().exitCode).toBe(0);
    expect(readdirSync(join(cwd, "content/core/maps")).sort()).toEqual(
      Object.keys(SANDBOX_MAPS).sort(),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
