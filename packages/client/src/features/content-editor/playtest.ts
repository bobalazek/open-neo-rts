import { catalogEntry } from "../debug/catalog";
import { FACTIONS } from "../debug/configuration";
import type { DebugLink } from "../debug/links";
import { type EditorPack, resolveDefinitionDraft, safeEditorPath } from "./definition-pack";
import { MODEL_FILE_LIMIT } from "./model";

/** A validated, device-local snapshot: URLs never point back to mutable files or remote assets. */
export async function prepareDraftPlaytest(
  packs: readonly EditorPack[],
  packId: string,
  path: string,
  draft: unknown,
) {
  const checked = await resolveDefinitionDraft(packs, packId, path, structuredClone(draft));
  if (
    !checked.catalog ||
    !checked.gameplay ||
    checked.issues.some((issue) => issue.level === "error")
  )
    throw new Error(
      checked.issues
        .filter((issue) => issue.level === "error")
        .map((issue) => `${issue.file}: ${issue.message}`)
        .join(" · "),
    );
  const urls: string[] = [];
  try {
    const catalog = checked.gameplay.definitions.map((definition) => {
      const raw = checked.catalog!.definitions.get(definition.id)!;
      const pack = definition.id.slice(0, definition.id.indexOf("."));
      const source = packs.find((entry) => entry.input.id === pack)!;
      const file = [...source.input.json].find(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          "id" in value &&
          `${pack}.${value.id}` === definition.id,
      )?.[0];
      if (!file) throw new Error(`Definition file is unavailable: ${definition.id}`);
      const folder = file.slice(0, file.lastIndexOf("/") + 1);
      const presentation = raw.presentation as Record<string, unknown>;
      const asset = (name: unknown) => {
        if (name === undefined) return undefined;
        const file = `${pack}/${safeEditorPath(folder + String(name))}`;
        const bytes = checked.bytes.get(file);
        if (!bytes || bytes.length > MODEL_FILE_LIMIT)
          throw new Error(`Model unavailable or exceeds 16 MiB: ${file}`);
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }),
        );
        urls.push(url);
        return url;
      };
      return catalogEntry(raw, asset(presentation.model), asset(presentation.wreck), pack);
    });
    const raw = checked.catalog.definitions.get(`${packId}.${(draft as { id: string }).id}`);
    if (!raw) throw new Error("The draft definition is unavailable");
    const id = `${packId}.${raw.id}`;
    const entry = catalog.find((entry) => entry.definition.id === id)!;
    const faction =
      FACTIONS.find((faction) =>
        String(raw.id)
          .split(":")[1]
          ?.startsWith(faction.id.slice("faction:".length) + "/"),
      ) ?? FACTIONS[1]!;
    const water =
      entry.movementDomain === "naval" || entry.definition.cells?.some((row) => /[sw]/.test(row));
    const initial: DebugLink = {
      map: `core.map:${entry.definition.nodeKinds ? "sandbox-resources" : water ? "sandbox-water" : "sandbox-flat"}`,
      seed: 1,
      controlled: 0,
      spawns: [],
      forces: [0, 1].map((index) => ({
        index,
        faction: `core.${faction.id}`,
        color: index ? "#d8443a" : "#3c93d9",
      })),
    };
    let disposed = false;
    return {
      catalog,
      initial,
      definition: id,
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const url of urls) URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    for (const url of urls) URL.revokeObjectURL(url);
    throw error;
  }
}
