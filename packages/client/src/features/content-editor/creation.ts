import { checkEditorAudio } from "./audio-validation";
import {
  checkDefinitionDraft,
  type EditorPack,
  readEditorPack,
  safeEditorPath,
} from "./definition-pack";

const encodeJson = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
type Data = Record<string, unknown>;

/** A copied, validated creation candidate; existing pack files and metadata are never mutated. */
export async function prepareDefinitionClone(
  packs: readonly EditorPack[],
  packId: string,
  sourcePath: string,
  slug: string,
  name: string,
  audio = checkEditorAudio,
) {
  if (
    slug.length > 96 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !name.trim() ||
    name.trim().length > 96
  )
    throw new Error(
      "Choose a kebab-case folder name and a nonempty display name of at most 96 characters",
    );
  safeEditorPath(sourcePath);
  const source = packs.find((pack) => pack.input.id === packId);
  const original = source?.input.json.get(sourcePath) as Data | undefined;
  const identity =
    typeof original?.id === "string" &&
    /^(unit|structure|prop):([a-z0-9-]+)\/[a-z0-9-]+$/.exec(original.id);
  if (!source || !original || !identity)
    throw new Error("Choose a unit, structure or prop template");
  const kind = identity[1] as "unit" | "structure" | "prop";
  if (!sourcePath.endsWith(`/${kind}.json`))
    throw new Error("Template filename does not match its definition kind");
  const folder = sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1);
  const parent = folder.slice(0, folder.slice(0, -1).lastIndexOf("/") + 1);
  const destination = safeEditorPath(`${parent}${slug}`) + "/";
  if (source.input.files.some((file) => file.startsWith(destination)))
    throw new Error("That definition folder already exists; existing files cannot be replaced");
  const path = `${destination}${kind}.json`;
  const id = `${kind}:${identity[2]}/${slug}`;
  const copy = (value: unknown): unknown => {
    if (value === original.id) return id;
    if (value === `${packId}.${original.id}`) return `${packId}.${id}`;
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy(entry)]));
    return value;
  };
  const draft = { ...(copy(original) as Data), id, name: name.trim() };
  const manifest = structuredClone(source.input.json.get("manifest.json")) as {
    files: Record<string, string[]>;
  };
  const group = `${kind}s`;
  if (!Array.isArray(manifest?.files?.[group]))
    throw new Error("The pack manifest has no matching definition group");
  manifest.files[group] = [...manifest.files[group], path].sort();
  const template = [...source.files].filter(([file]) => file.startsWith(folder));
  if (template.reduce((size, [, file]) => size + file.size, 0) > 256 * 1024 * 1024)
    throw new Error("The template and its editable sources exceed 256 MiB");
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [file, data] of template)
    files.set(destination + file.slice(folder.length), new Uint8Array(await data.arrayBuffer()));
  files.set(path, encodeJson(draft));
  files.set("manifest.json", encodeJson(manifest));
  const candidateFiles = new Map(source.files);
  for (const [file, bytes] of files)
    candidateFiles.set(file, new File([bytes], file.split("/").at(-1)!));
  const candidate = await readEditorPack(packId, candidateFiles);
  const candidates = packs.map((pack) => (pack === source ? candidate : pack));
  const issues = await checkDefinitionDraft(candidates, packId, path, draft, audio);
  return {
    packId,
    sourcePath,
    destination,
    path,
    draft,
    files,
    candidate,
    issues,
    manifestBaseline: await source.files.get("manifest.json")!.text(),
  };
}
export type DefinitionClone = Awaited<ReturnType<typeof prepareDefinitionClone>>;
