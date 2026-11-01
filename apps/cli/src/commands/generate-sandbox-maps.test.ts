import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BIOMES, checkTerrain, RAMP, SURFACES, WATER } from "@open-neo-rts/content";
import { mapPreview, SANDBOX_MAPS } from "./generate-sandbox-maps";

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
    expect(readdirSync(join(cwd, "content/core/maps"))).toEqual(["sandbox-biomes", "sandbox-flat"]);
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
