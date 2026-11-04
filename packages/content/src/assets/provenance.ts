import type { PackIssue } from "../loader/check-packs";

const RUNTIME = /\.(glb|png|webp|ogg|ktx2)$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Only a declared asset folder's source subtree is excluded, not an arbitrary ancestor. */
export function listAssetFiles(files: readonly string[]) {
  const ordered = [...files].sort();
  const manifests = ordered.filter(
    (file) => file === "assets.json" || file.endsWith("/assets.json"),
  );
  const sources = manifests.map((file) => file.slice(0, -"assets.json".length) + "source/");
  const source = (file: string) => sources.some((source) => file.startsWith(source));
  const exported = ordered.filter((file) => !source(file));
  return {
    manifests: manifests.filter((file) => !source(file)),
    exported,
    runtime: exported.filter((file) => RUNTIME.test(file)),
  };
}

/** Paths are relative to the supplied root; source references can name project tooling. */
export function checkAssetProvenance(
  files: readonly string[],
  json: ReadonlyMap<string, unknown>,
): { runtime: string[]; issues: PackIssue[] } {
  const { manifests, runtime } = listAssetFiles(files);
  const present = new Set(files);
  const entries = new Map<string, Record<string, unknown>>();
  const issues: PackIssue[] = [];
  const error = (file: string, message: string) => issues.push({ level: "error", file, message });
  for (const file of manifests) {
    const manifest = json.get(file);
    if (!object(manifest) || !object(manifest.files)) {
      error(file, "assets.json requires a files object");
      continue;
    }
    entries.set(file, manifest.files);
    const folder = file.slice(0, -"assets.json".length);
    for (const name of Object.keys(manifest.files).sort()) {
      if (
        name.includes("\\") ||
        name.split("/").some((part) => !part || part === "." || part === "..")
      ) {
        error(file, `invalid asset entry path "${name}"`);
        continue;
      }
      if (!present.has(folder + name)) error(file, `entry for missing file "${name}"`);
      const entry = manifest.files[name];
      if (
        !object(entry) ||
        typeof entry.author !== "string" ||
        !entry.author.trim() ||
        typeof entry.source !== "string" ||
        !entry.source.trim()
      )
        error(file, `entry "${name}" requires nonempty author and source`);
    }
  }
  for (const file of runtime) {
    const slash = file.lastIndexOf("/");
    const manifest = file.slice(0, slash + 1) + "assets.json";
    const metadata = entries.get(manifest);
    if (!metadata || !Object.hasOwn(metadata, file.slice(slash + 1)))
      error(file, "no assets.json entry (author and source)");
  }
  return { runtime, issues };
}
