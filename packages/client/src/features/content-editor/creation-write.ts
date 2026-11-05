import { checkEditorAudio } from "./audio-validation";
import type { DefinitionClone } from "./creation";
import {
  checkDefinitionDraft,
  type EditorDirectory,
  type EditorFileHandle,
  type EditorPack,
  readEditorDirectory,
  writeDefinition,
} from "./definition-pack";

const equal = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

/** Publish the manifest last; failed payload writes remove only unchanged files we created. */
export async function writeDefinitionClone(
  packs: readonly EditorPack[],
  plan: DefinitionClone,
  audio = checkEditorAudio,
) {
  const directory = packs.find((pack) => pack.input.id === plan.packId)?.directory;
  if (!directory?.getDirectoryHandle || !directory.getFileHandle || !directory.removeEntry)
    throw new Error("This folder does not support creation; download the changes instead");
  if (plan.issues.some((issue) => issue.level === "error"))
    throw new Error("Fix the validation errors before creating a definition");
  const manifest = await directory.getFileHandle("manifest.json");
  if ((await (await manifest.getFile()).text()) !== plan.manifestBaseline)
    throw new Error("The manifest changed on disk. Reopen the pack before creating a definition");
  let destination: EditorDirectory | undefined = directory;
  try {
    for (const part of plan.destination.slice(0, -1).split("/"))
      destination = await destination!.getDirectoryHandle!(part);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    destination = undefined;
  }
  if (destination)
    for await (const _entry of destination.values())
      throw new Error("The destination is no longer empty; existing files cannot be replaced");
  const created: {
    folder: EditorDirectory;
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
    closed: boolean;
  }[] = [];
  const nextManifest = new TextDecoder().decode(plan.files.get("manifest.json")!);
  let publishing = false;
  try {
    for (const [path, bytes] of plan.files) {
      if (path === "manifest.json") continue;
      const parts = path.split("/");
      const name = parts.pop()!;
      let folder = directory;
      for (const part of parts) {
        if (!folder.getDirectoryHandle) throw new Error("Folder creation is unavailable");
        folder = await folder.getDirectoryHandle(part, { create: true });
      }
      if (!folder.getFileHandle || !folder.removeEntry)
        throw new Error("File creation is unavailable");
      for await (const entry of folder.values())
        if (entry.name === name)
          throw new Error(`A file appeared at ${path}; nothing was replaced`);
      const handle = await folder.getFileHandle(name, { create: true });
      if ((await handle.getFile()).size !== 0) throw new Error(`A file appeared at ${path}`);
      const entry = { folder, name, bytes, closed: false };
      created.push(entry);
      const stream = await handle.createWritable();
      try {
        await stream.write(bytes);
        await stream.close();
        entry.closed = true;
      } catch (error) {
        await stream.abort().catch(() => {});
        throw error;
      }
    }
    // Validate a fresh disk snapshot with the candidate manifest before making it discoverable.
    const written = await readEditorDirectory(
      directory,
      new Map([["manifest.json", JSON.parse(nextManifest)]]),
    );
    for (const [path, bytes] of plan.files) {
      if (path === "manifest.json") continue;
      const file = written.files.get(path);
      if (!file || !equal(new Uint8Array(await file.arrayBuffer()), bytes))
        throw new Error(`The new file changed before publication: ${path}`);
    }
    const issues = await checkDefinitionDraft(
      packs.map((pack) => (pack.input.id === plan.packId ? written : pack)),
      plan.packId,
      plan.path,
      plan.draft,
      audio,
    );
    if (issues.some((issue) => issue.level === "error"))
      throw new Error(
        issues
          .filter((issue) => issue.level === "error")
          .map((issue) => issue.message)
          .join(" · "),
      );
    publishing = true;
    await writeDefinition(manifest, plan.manifestBaseline, nextManifest);
    return await readEditorDirectory(directory);
  } catch (error) {
    if (publishing) {
      // A close error can occur after commit: never remove files referenced by an uncertain manifest.
      const current = await (await manifest.getFile()).text().catch(() => undefined);
      if (current === nextManifest) return await readEditorDirectory(directory);
      if (current !== plan.manifestBaseline)
        throw new Error(
          "Manifest publication could not be confirmed. New files were preserved; reopen the pack",
          { cause: error },
        );
    }
    const retained: string[] = [];
    for (const entry of created.reverse()) {
      try {
        const handle = await entry.folder.getFileHandle!(entry.name);
        const current = new Uint8Array(await (await handle.getFile()).arrayBuffer());
        if ((entry.closed || current.length > 0) && !equal(current, entry.bytes))
          throw new Error("File changed");
        await entry.folder.removeEntry!(entry.name);
      } catch {
        retained.push(entry.name);
      }
    }
    if (retained.length)
      throw new Error(
        `Creation failed; changed or inaccessible new files were preserved (${retained.join(", ")}). Reopen the pack or download the changes`,
        { cause: error },
      );
    throw error;
  }
}
