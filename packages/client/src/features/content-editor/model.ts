import { type ModelKind, modelRequirements, parseGlb, validateModel } from "@open-neo-rts/content";

export const MODEL_FILE_LIMIT = 16 * 1024 * 1024;

/** The same authored requirements and structural validator used by pack/CLI validation. */
export function inspectModel(
  bytes: Uint8Array,
  kind: ModelKind,
  definition?: Record<string, unknown>,
) {
  if (bytes.byteLength > MODEL_FILE_LIMIT) throw new Error("Model exceeds 16 MiB");
  const gltf = parseGlb(bytes);
  const presentation = definition?.presentation as Record<string, unknown> | undefined;
  const issues = validateModel(
    gltf,
    kind,
    modelRequirements(definition ?? {}, presentation ?? {}, kind),
  );
  return {
    issues,
    materials: (gltf.materials ?? []).map((m) => m.name ?? ""),
    nodes: (gltf.nodes ?? []).map((node) => node.name ?? ""),
    sockets: (gltf.nodes ?? [])
      .filter((node) => node.name?.startsWith("socket_"))
      .map((node) => node.name!),
    clips: (gltf.animations ?? []).map((clip) => clip.name ?? ""),
    hasDamage: (gltf.nodes ?? []).some((node) =>
      ["state_damaged", "state_critical"].includes(node.name ?? ""),
    ),
  };
}

export function installedModel(entries: readonly { id: string; model?: string }[], value: string) {
  const found = entries.find((entry) => entry.id === value || entry.model === value);
  if (!found) throw new Error("Unknown installed model");
  return found.id;
}
