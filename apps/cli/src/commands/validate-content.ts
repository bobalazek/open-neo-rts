// bun neo validate-content [packs-dir]: manifests, schemas, IDs, references, locales, map layers, and each model against its definition.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  type PackInput,
  PackResolutionError,
  parseGlb,
  resolvePacks,
  validateModel,
} from "@open-neo-rts/content";

function walk(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, root) : [relative(root, path)];
  });
}

export async function validateContent(args: string[]): Promise<number> {
  const root = args[0] ?? "content";
  const bytes = new Map<string, Uint8Array>();
  const packs: PackInput[] = readdirSync(root)
    .filter((id) => statSync(join(root, id)).isDirectory() && id !== "schemas")
    .map((id) => {
      const dir = join(root, id);
      const files = walk(dir).filter((f) => !f.endsWith(".gitkeep"));
      const json = new Map<string, unknown>();
      for (const f of files.filter((f) => f.endsWith(".json"))) {
        try {
          json.set(f, JSON.parse(readFileSync(join(dir, f), "utf8")));
        } catch (e) {
          console.log(`✖ ${id}/${f}: invalid JSON (${(e as Error).message})`);
        }
      }
      const layers = new Map(
        files
          .filter((f) => f.endsWith(".r8"))
          .map((f) => [f, new Uint8Array(readFileSync(join(dir, f)))] as const),
      );
      for (const file of files)
        if (!file.endsWith(".json") && !file.includes("/source/"))
          bytes.set(`${id}/${file}`, new Uint8Array(readFileSync(join(dir, file))));
      return { id, files, json, layers };
    });

  let catalog: ReturnType<typeof resolvePacks>;
  try {
    catalog = resolvePacks(packs, "0.1.0", { bytes });
  } catch (error) {
    if (!(error instanceof PackResolutionError)) throw error;
    for (const issue of error.issues) console.log(`✖ ${issue.file}: ${issue.message}`);
    return 1;
  }
  const { models } = catalog;
  const issues = [...catalog.issues];
  for (const m of models) {
    const bytes = new Uint8Array(readFileSync(join(root, m.pack, m.file)));
    try {
      for (const i of validateModel(parseGlb(bytes), m.kind, m.requires)) {
        issues.push({ level: i.level, file: `${m.pack}/${m.file}`, message: i.message });
      }
    } catch (e) {
      issues.push({ level: "error", file: `${m.pack}/${m.file}`, message: (e as Error).message });
    }
  }

  const errors = issues.filter((i) => i.level === "error").length;
  for (const i of issues) console.log(`${i.level === "error" ? "✖" : "⚠"} ${i.file}: ${i.message}`);
  console.log(
    `${packs.length} packs, ${models.length} models checked: ${errors} errors, ${issues.length - errors} warnings`,
  );
  console.log(
    `Content identity: gameplay ${catalog.gameplayHash}, cosmetic ${catalog.cosmeticHash}`,
  );
  return errors > 0 ? 1 : 0;
}
