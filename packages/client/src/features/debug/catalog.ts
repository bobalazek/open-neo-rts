import { type DOMAINS, SCHEMAS, validate } from "@open-neo-rts/content";
import { toDefinition } from "@open-neo-rts/sim/definitions";

interface RawDefinition {
  id: string;
  name: string;
  health?: number;
  destructible?: { health: number };
  movement?: { speed: number; turnRate?: number; domain: (typeof DOMAINS)[number] };
  footprint?: readonly number[];
  cells?: readonly string[];
  blocks?: string;
}

/** Original schema validation precedes both metadata access and sim-unit conversion. */
export function catalogEntry(raw: unknown, model?: string) {
  if (typeof raw !== "object" || raw === null || !("id" in raw) || typeof raw.id !== "string")
    throw new Error("Definition ID missing");
  const kind = raw.id.split(":")[0];
  if (kind !== "unit" && kind !== "structure" && kind !== "prop")
    throw new Error("Unknown definition kind");
  const issues = validate(SCHEMAS[kind], raw);
  if (issues.length)
    throw new Error(
      `Invalid ${raw.id}: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  const content = raw as RawDefinition;
  return {
    name: content.name,
    kind,
    definition: toDefinition({ ...content, id: `core.${content.id}` }),
    movementDomain: content.movement?.domain ?? null,
    model,
  };
}
export type CatalogEntry = ReturnType<typeof catalogEntry>;

export async function resolveEntityModel(entry: CatalogEntry) {
  if (!entry.model) throw new Error(`Model unavailable: ${entry.name} (${entry.definition.id})`);
  let response: Response;
  try {
    response = await fetch(entry.model);
  } catch {
    throw new Error(`Model unavailable: ${entry.name} (request failed)`);
  }
  if (!response.ok) throw new Error(`Model unavailable: ${entry.name} (HTTP ${response.status})`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    movementDomain: entry.movementDomain,
    footprint: entry.definition.footprint,
  };
}
