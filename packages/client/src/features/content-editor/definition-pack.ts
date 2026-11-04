import {
  checkAssetProvenance,
  listAssetFiles,
  type PackInput,
  PackResolutionError,
  resolvePacks,
} from "@open-neo-rts/content";
import { validateAssetGlb } from "@open-neo-rts/content/asset-validation";
import { compileGameplayCatalog } from "@open-neo-rts/sim";

export interface EditorFile {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly size: number;
}
export interface EditorFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<EditorFile>;
  createWritable(): Promise<{
    write(data: string | Uint8Array<ArrayBuffer>): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export interface EditorDirectory {
  kind: "directory";
  name: string;
  values(): AsyncIterable<EditorFileHandle | EditorDirectory>;
  getDirectoryHandle?(name: string, options?: { create?: boolean }): Promise<EditorDirectory>;
  getFileHandle?(name: string, options?: { create?: boolean }): Promise<EditorFileHandle>;
  removeEntry?(name: string): Promise<void>;
}
export interface EditorPack {
  input: PackInput;
  files: Map<string, EditorFile>;
  handles: Map<string, EditorFileHandle>;
  directory?: EditorDirectory;
}

async function readBatches<T, R>(values: readonly T[], read: (value: T) => Promise<R>) {
  const results: R[] = [];
  for (let start = 0; start < values.length; start += 32)
    results.push(...(await Promise.all(values.slice(start, start + 32).map(read))));
  return results;
}

export function safeEditorPath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid pack path");
  return path;
}

/** Directory handles stay in the client; the renderer and simulation never receive write access. */
export async function readEditorPack(
  id: string,
  files: Map<string, EditorFile>,
  handles = new Map<string, EditorFileHandle>(),
  overrides = new Map<string, unknown>(),
): Promise<EditorPack> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || files.size > 10000)
    throw new Error("Invalid pack folder");
  const json = new Map<string, unknown>();
  const layers = new Map<string, Uint8Array>();
  let size = 0;
  const exported = new Set(listAssetFiles([...files.keys()]).exported);
  const runtime = [...files].filter(([path]) => exported.has(path));
  for (const [path, file] of files) {
    safeEditorPath(path);
    if (!exported.has(path)) continue;
    size += file.size;
    if (size > 256 * 1024 * 1024) throw new Error("Pack runtime files exceed 256 MiB");
    if (path.endsWith(".json")) {
      if (file.size > 2 * 1024 * 1024) throw new Error("Pack JSON exceeds 2 MiB");
    }
  }
  for (const [path, value] of await readBatches(
    runtime.filter(([path]) => path.endsWith(".json")),
    async ([path, file]) =>
      [path, overrides.has(path) ? overrides.get(path) : JSON.parse(await file.text())] as const,
  ))
    json.set(path, value);
  for (const [path, bytes] of await readBatches(
    runtime.filter(([path]) => path.endsWith(".r8")),
    async ([path, file]) => [path, new Uint8Array(await file.arrayBuffer())] as const,
  ))
    layers.set(path, bytes);
  const manifest = json.get("manifest.json") as { id?: unknown } | undefined;
  if (manifest?.id !== id) throw new Error("Choose the pack folder containing its manifest.json");
  return {
    input: {
      id,
      files: [...files.keys()].filter((path) => !path.endsWith(".gitkeep")).sort(),
      json,
      layers,
    },
    files,
    handles,
  };
}

export async function readEditorDirectory(
  directory: EditorDirectory,
  overrides = new Map<string, unknown>(),
): Promise<EditorPack> {
  const handles = new Map<string, EditorFileHandle>();
  let entries = 0;
  async function visit(folder: EditorDirectory, prefix: string) {
    if (prefix.split("/").length > 32) throw new Error("Pack folders are nested too deeply");
    for await (const entry of folder.values()) {
      if (++entries > 10000) throw new Error("Pack contains too many entries");
      const path = safeEditorPath(prefix + entry.name);
      if (entry.kind === "directory") await visit(entry, path + "/");
      else {
        handles.set(path, entry);
      }
    }
  }
  await visit(directory, "");
  const files = new Map(
    await readBatches(
      [...handles],
      async ([path, handle]) => [path, await handle.getFile()] as const,
    ),
  );
  const pack = await readEditorPack(directory.name, files, handles, overrides);
  pack.directory = directory;
  return pack;
}

export async function checkDefinitionDraft(
  packs: readonly EditorPack[],
  packId: string,
  path: string,
  draft: unknown,
) {
  // shortcut: runtime audio, source freshness and formatting parity remain 2-38b2.
  if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > 2 * 1024 * 1024)
    throw new Error("Definition JSON exceeds 2 MiB");
  const inputs = packs.map((pack) => ({ ...pack.input, json: new Map(pack.input.json) }));
  const target = inputs.find((pack) => pack.id === packId);
  if (!target?.json.has(safeEditorPath(path)))
    throw new Error("Definition is not in the selected pack");
  target.json.set(path, draft);
  const bytes = new Map<string, Uint8Array>();
  let total = 0;
  const runtime = packs.flatMap((pack) => {
    const exported = new Set(listAssetFiles(pack.input.files).exported);
    return [...pack.files]
      .filter(
        ([file]) => !file.endsWith(".json") && exported.has(file) && !file.endsWith(".gitkeep"),
      )
      .map(([file, source]) => [`${pack.input.id}/${file}`, source] as const);
  });
  for (const [, source] of runtime) {
    total += source.size;
    if (total > 256 * 1024 * 1024) throw new Error("Combined runtime files exceed 256 MiB");
  }
  for (const [file, data] of await readBatches(
    runtime,
    async ([file, source]) => [file, new Uint8Array(await source.arrayBuffer())] as const,
  ))
    bytes.set(file, data);
  try {
    const catalog = resolvePacks(inputs, "0.1.0", { bytes });
    const issues = [...catalog.issues];
    for (const input of inputs)
      issues.push(
        ...checkAssetProvenance(input.files, input.json).issues.map((issue) => ({
          ...issue,
          file: `${input.id}/${issue.file}`,
        })),
      );
    const models = new Set(catalog.models.map((model) => `${model.pack}/${model.file}`));
    for (const [file, data] of bytes)
      if (file.endsWith(".glb") && !models.has(file))
        issues.push(
          ...(await validateAssetGlb(data, file)).map((issue) => ({
            ...issue,
            file,
          })),
        );
    for (const model of catalog.models) {
      const file = `${model.pack}/${model.file}`;
      const data = bytes.get(file);
      if (!data) issues.push({ level: "error", file, message: "Model bytes are unavailable" });
      else
        issues.push(
          ...(await validateAssetGlb(data, file, model)).map((issue) => ({ ...issue, file })),
        );
    }
    try {
      compileGameplayCatalog(catalog);
    } catch (error) {
      issues.push({
        level: "error",
        file: path,
        message: error instanceof Error ? error.message : "Gameplay compilation failed",
      });
    }
    return issues;
  } catch (error) {
    if (error instanceof PackResolutionError) return [...error.issues];
    throw error;
  }
}

export class EditorConflict extends Error {
  constructor(readonly current: string) {
    super("The file changed on disk. Review the conflict before saving.");
  }
}

export async function writeDefinition(handle: EditorFileHandle, baseline: string, next: string) {
  const current = await (await handle.getFile()).text();
  if (current !== baseline) throw new EditorConflict(current);
  const writable = await handle.createWritable();
  try {
    await writable.write(next);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}
