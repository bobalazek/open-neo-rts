import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseTerrain, resolvePacks, type TerrainLayers } from "@open-neo-rts/content";
import {
  checkpointHash,
  compileGameplayCatalog,
  createMatch,
  createNormalMatchSetup,
  parseScenario,
  SCENARIO_FORMAT,
  type Scenario,
  SIM_VERSION,
  step,
  toMatchResources,
} from "@open-neo-rts/sim";
import map from "../../../../content/core/maps/training-grounds/map.json";

export function aiMatchOptions(args: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i],
      value = args[i + 1];
    if (
      !name ||
      !["--seeds", "--ticks", "--out"].includes(name) ||
      !value ||
      value.startsWith("--") ||
      values.has(name)
    )
      throw new Error(
        "Usage: bun neo ai-vs-ai --out <new-directory> [--seeds 1,2,...] [--ticks 30000]",
      );
    values.set(name, value);
  }
  const seedText = values.get("--seeds") ?? Array.from({ length: 20 }, (_, i) => i + 1).join(",");
  const seeds = seedText.split(",").map((seed) => {
    if (!/^\d+$/.test(seed) || Number(seed) > 0xffffffff)
      throw new Error("Seeds must be uint32 integers");
    return Number(seed);
  });
  if (seeds.length > 100 || new Set(seeds).size !== seeds.length)
    throw new Error("Provide 1–100 distinct seeds");
  const tickText = values.get("--ticks") ?? "30000";
  if (!/^\d+$/.test(tickText) || Number(tickText) < 1 || Number(tickText) > 216000)
    throw new Error("--ticks must be an integer from 1 to 216000");
  const out = values.get("--out");
  if (!out) throw new Error("--out requires a new output directory");
  return { seeds, ticks: Number(tickText), out: resolve(out) };
}

/** Real core bytes and map layers; no injected bank balances, spawns or controller orders. */
export async function aiMatchScenario(seed: number): Promise<Scenario> {
  const root = resolve(import.meta.dir, "../../../../content/core");
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true }))
    files.push(file);
  files.sort();
  const json = new Map<string, unknown>(),
    bytes = new Map<string, Uint8Array>();
  for (const file of files) {
    if (file.endsWith(".json")) json.set(file, await Bun.file(resolve(root, file)).json());
    else if (!file.includes("/source/") && !file.endsWith(".gitkeep"))
      bytes.set(`core/${file}`, new Uint8Array(await Bun.file(resolve(root, file)).arrayBuffer()));
  }
  const catalog = compileGameplayCatalog(
    resolvePacks([{ id: "core", files, json }], "0.1.0", { bytes }),
  );
  const layers: TerrainLayers = {};
  for (const [key, file] of Object.entries(map.layers)) {
    const layer = bytes.get(`core/maps/training-grounds/${file}`);
    if (!layer) throw new Error(`Missing original Training Grounds layer: ${file}`);
    layers[key as keyof TerrainLayers] = layer;
  }
  const terrain = parseTerrain(map.size.width, map.size.height, layers, map.biome);
  const setup = createNormalMatchSetup({
    catalog,
    seed,
    mapSupport: { start: map.start as "faction", players: map.players },
    map: {
      id: `core.${map.id}`,
      terrain: {
        width: terrain.width,
        height: terrain.height,
        level: [...terrain.level],
        ramp: [...terrain.ramp],
        surface: [...terrain.surface],
        water: [...terrain.water],
        biome: [...terrain.biome],
      },
      spawns: map.spawns.map((spawn) => ({
        id: spawn.id,
        position: [
          Math.round(spawn.position[0]! * 1024),
          Math.round(spawn.position[1]! * 1024),
        ] as const,
        facing: Math.round((spawn.facing * 65536) / 360) & 0xffff,
      })),
      resources: toMatchResources(map.resources),
      objects: [],
    },
    forces: [
      { index: 0, faction: "core.faction:eastern-collective", team: 0, spawn: "north-west" },
      { index: 1, faction: "core.faction:eastern-collective", team: 1, spawn: "south-east" },
    ],
    seats: [1, 2],
    bots: [0, 1].map((force) => ({ seat: force + 1, kind: "basic-skirmish", force })),
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      grantedAtTick: 0,
      scopes: ["unit.orders", "economy.build", "production.queue", "surrender"],
    })),
  });
  return parseScenario({ format: SCENARIO_FORMAT, simVersion: SIM_VERSION, setup, commands: [] });
}

export function aiMatchTrial(scenario: Scenario, ticks: number) {
  const kernel = createMatch(scenario.setup);
  while (kernel.tick < ticks && !kernel.victory?.ended) step(kernel, []);
  const checkpoints = [...kernel.checkpoints];
  const hash = checkpointHash(kernel);
  if (checkpoints.at(-1)?.tick !== kernel.tick) checkpoints.push({ tick: kernel.tick, hash });
  return {
    tick: kernel.tick,
    hash,
    checkpoints,
    victory: kernel.victory?.snapshot() ?? null,
    events: kernel.log,
    bots: kernel.bots?.serialize(),
  };
}

export async function aiVsAi(args: string[]): Promise<number> {
  try {
    const options = aiMatchOptions(args);
    // Refuse existing directories so reruns cannot erase the first failed evidence.
    mkdirSync(options.out);
    const template = await aiMatchScenario(options.seeds[0]!);
    const results: {
      seed: number;
      tick: number;
      hash: string;
      completed: boolean;
      reproducible: boolean;
      winner: number | null;
    }[] = [];
    for (const seed of options.seeds) {
      const scenario = { ...template, setup: { ...template.setup, seed } };
      const stem = resolve(options.out, `seed-${seed}`);
      await Bun.write(`${stem}.scenario.json`, `${JSON.stringify(scenario)}\n`);
      try {
        const first = aiMatchTrial(scenario, options.ticks);
        await Bun.write(`${stem}.first.json`, `${JSON.stringify(first)}\n`);
        const second = aiMatchTrial(scenario, options.ticks);
        const reproducible = JSON.stringify(first) === JSON.stringify(second);
        if (!reproducible) await Bun.write(`${stem}.repeat.json`, `${JSON.stringify(second)}\n`);
        const row = {
          seed,
          tick: first.tick,
          hash: first.hash,
          completed: !!first.victory?.result,
          reproducible,
          winner: first.victory?.result?.winner ?? null,
        };
        results.push(row);
        await Bun.write(
          resolve(options.out, "summary.json"),
          `${JSON.stringify({ format: 1, simVersion: SIM_VERSION, tickLimit: options.ticks, results }, null, 2)}\n`,
        );
        console.log(JSON.stringify(row));
        if (!reproducible) throw new Error(`Seed ${seed} diverged; both runs preserved`);
      } catch (error) {
        await Bun.write(
          `${stem}.failure.json`,
          `${JSON.stringify({ seed, error: error instanceof Error ? error.message : String(error) })}\n`,
        );
        throw error;
      }
    }
    return results.every((result) => result.completed && result.reproducible) ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
