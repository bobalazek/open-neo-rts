// bun neo validate-assets [root]: glTF validity, model conventions and provenance for every pack's assets.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { checkAssetProvenance, listAssetFiles } from "@open-neo-rts/content";
import { validateAssetGlb } from "@open-neo-rts/content/asset-validation";
import { validateAudio } from "./validate-audio";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export async function validateAssets(args: string[]): Promise<number> {
  const root = args[0] ?? "content";
  let errors = 0;
  let warnings = 0;
  const report = (file: string, level: "error" | "warning", message: string) => {
    if (level === "error") errors++;
    else warnings++;
    console.log(`${level === "error" ? "✖" : "⚠"} ${relative(".", file)}: ${message}`);
  };

  const files = walk(root).filter((f) => !f.endsWith(".gitkeep"));
  const paths = files.map((file) => relative(root, file).split(sep).join("/"));
  const json = new Map<string, unknown>();
  for (const file of listAssetFiles(paths).manifests)
    try {
      json.set(file, JSON.parse(readFileSync(join(root, file), "utf8")));
    } catch (error) {
      report(join(root, file), "error", `invalid JSON (${(error as Error).message})`);
    }
  const provenance = checkAssetProvenance(paths, json);
  for (const issue of provenance.issues) report(join(root, issue.file), issue.level, issue.message);
  const runtime = provenance.runtime.map((file) => join(root, file));

  for (const file of runtime.filter((f) => f.endsWith(".ogg"))) {
    const mono = ["unit.json", "structure.json", "prop.json"].some((name) =>
      files.includes(join(dirname(file), name)),
    );
    for (const message of validateAudio(file, mono)) report(file, "error", message);
  }

  for (const file of runtime.filter((f) => f.endsWith(".glb"))) {
    const bytes = new Uint8Array(readFileSync(file));
    for (const issue of await validateAssetGlb(bytes, relative(root, file).split(sep).join("/")))
      report(file, issue.level, issue.message);
  }

  console.log(`${files.length} asset files checked: ${errors} errors, ${warnings} warnings`);
  return errors > 0 ? 1 : 0;
}
