// bun neo build-models <faction | folder | file>: build brick-model sources (source/<name>.bricks.json, format in
// models/bricks.ts) into <name>.glb, the wreck or rubble named by the definition's presentation.wreck,
// <name>.icon.png, and their assets.json entries. A bare name means content/core/factions/<name>.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { BrickModel } from "../models/bricks";
import { buildModel } from "../models/build";

export async function buildModels(args: string[]): Promise<number> {
  const target = args[0];
  if (!target) {
    console.log("Usage: bun neo build-models <faction | folder | file>");
    return 1;
  }
  const root = existsSync(target) ? target : join("content", "core", "factions", target);
  if (!existsSync(root)) {
    console.log(`✖ no faction or path "${target}"`);
    return 1;
  }
  const sources = statSync(root).isFile()
    ? [root]
    : [...new Bun.Glob("**/source/*.bricks.json").scanSync(root)].map((f) => join(root, f)).sort();
  let errors = 0;
  for (const file of sources) {
    try {
      console.log(build(file));
    } catch (e) {
      errors++;
      console.log(`✖ ${file}: ${(e as Error).message}`);
    }
  }
  console.log(`${sources.length} brick models built: ${errors} errors`);
  return errors > 0 ? 1 : 0;
}

function build(file: string): string {
  const folder = dirname(dirname(file));
  const name = basename(file, ".bricks.json");
  const src = JSON.parse(readFileSync(file, "utf8")) as BrickModel;
  if (!src.author) throw new Error(`"author" is required (never invent one)`);
  const defFile = ["unit.json", "structure.json", "prop.json"]
    .map((f) => join(folder, f))
    .find(existsSync);
  const wreckFile = defFile && JSON.parse(readFileSync(defFile, "utf8")).presentation?.wreck;
  const factionFile = join(folder, "..", "..", "faction.json");
  const team = existsSync(factionFile)
    ? JSON.parse(readFileSync(factionFile, "utf8")).color
    : "#a0a4aa";
  const built = buildModel(src, {
    team,
    seed: name,
    ...(typeof wreckFile === "string" && {
      derived: wreckFile.endsWith(".rubble.glb") ? "rubble" : "wreck",
    }),
  });

  const out: Record<string, Uint8Array> = {
    [`${name}.glb`]: built.glb,
    [`${name}.icon.png`]: built.icon,
    ...(built.derived && { [wreckFile]: built.derived.glb }),
  };
  const manifestFile = join(folder, "assets.json");
  const assets = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, "utf8"))
    : { files: {} };
  for (const [path, bytes] of Object.entries(out)) {
    writeFileSync(join(folder, path), bytes);
    assets.files[path] = { author: src.author, source: relative(folder, file) };
  }
  writeFileSync(manifestFile, `${JSON.stringify(assets, null, 2)}\n`);
  const derived = built.derived ? `, ${wreckFile} ${built.derived.triangles}` : "";
  return `${relative(".", folder)}: ${built.triangles} triangles${derived}; clips: ${built.clips.join(", ") || "none"}; sockets: ${built.sockets.join(", ") || "none"}`;
}
