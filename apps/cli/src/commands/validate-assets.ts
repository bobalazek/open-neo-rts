// bun neo validate-assets [root]: glTF validity, model conventions and provenance for every pack's assets.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { type ModelKind, parseGlb, validateModel } from "@open-neo-rts/content";
import { validateBytes } from "gltf-validator";

const RUNTIME = /\.(glb|png|webp|ogg|ktx2)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function kindOf(file: string): ModelKind {
  if (/\.(wreck|rubble)\.glb$/.test(file)) return "wreck";
  if (file.includes("/structures/")) return "structure";
  if (file.includes("/units/")) return "unit";
  return "prop";
}

function manifestFiles(manifest: string): Record<string, unknown> {
  return JSON.parse(readFileSync(manifest, "utf8")).files ?? {};
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

  const files = walk(root).filter((f) => !f.includes("/schemas/") && !f.endsWith(".gitkeep"));

  // Provenance: every runtime file has an assets.json entry, and every entry has a file.
  for (const manifest of files.filter((f) => basename(f) === "assets.json")) {
    for (const name of Object.keys(manifestFiles(manifest))) {
      if (!files.includes(join(dirname(manifest), name))) {
        report(manifest, "error", `entry for missing file "${name}"`);
      }
    }
  }
  for (const file of files.filter((f) => RUNTIME.test(f))) {
    const manifest = join(dirname(file), "assets.json");
    if (!files.includes(manifest) || !(basename(file) in manifestFiles(manifest))) {
      report(file, "error", "no assets.json entry (author and source)");
    }
  }

  for (const file of files.filter((f) => f.endsWith(".glb"))) {
    const bytes = new Uint8Array(readFileSync(file));
    const spec = await validateBytes(bytes, {
      uri: file,
      externalResourceFunction: async () => new Uint8Array(),
    });
    for (const m of spec.issues.messages) {
      if (m.severity === 0) report(file, "error", `glTF: ${m.message}`);
    }
    try {
      for (const issue of validateModel(parseGlb(bytes), kindOf(file))) {
        report(file, issue.level, issue.message);
      }
    } catch (e) {
      report(file, "error", (e as Error).message);
    }
  }

  console.log(`${files.length} asset files checked: ${errors} errors, ${warnings} warnings`);
  return errors > 0 ? 1 : 0;
}
