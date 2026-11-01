import { arr, type Issue, int, oneOf, opt, str } from "@open-neo-rts/content";
import { strictObject } from "../../snapshots/schema";

/** Spawnable content in simulation units. A zero health prop is indestructible. */
export interface Definition {
  id: string;
  health: number;
  /** Integer subcells per tick; static objects always use 0. */
  speed: number;
  /** Binary angle units per tick. */
  turnRate: number;
  footprint?: readonly [number, number];
  cells?: readonly string[];
  blocks?: "nothing" | "movement" | "movement-and-vision";
}

const INT32_MAX = 0x7fffffff;
export const definitionSchema = strictObject({
  id: str(/^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/),
  health: int(0, INT32_MAX),
  speed: int(0, INT32_MAX),
  turnRate: int(0, 0x10000),
  footprint: opt(arr(int(1, 8), 2, 2)),
  cells: opt(arr(str(/^[lswn]+$/), 1, 8)),
  blocks: opt(oneOf(["nothing", "movement", "movement-and-vision"])),
});

/** Semantic checks shared by direct setup, conversion and untrusted replay JSON. */
export function checkDefinitions(definitions: readonly Definition[], issues: Issue[]): void {
  const ids = new Set<string>();
  for (const [i, definition] of definitions.entries()) {
    const path = `$.setup.definitions[${i}]`;
    const kind = definition.id.split(":")[0]?.split(".").at(-1);
    if (ids.has(definition.id)) issues.push({ path: `${path}.id`, message: "duplicate ID" });
    ids.add(definition.id);
    if (kind !== "prop" && definition.health === 0)
      issues.push({ path: `${path}.health`, message: "must be positive for units/structures" });
    if (kind === "unit" && (definition.footprint || definition.cells || definition.blocks))
      issues.push({ path, message: "units do not have static footprints" });
    if (kind !== "prop" && definition.blocks !== undefined)
      issues.push({ path: `${path}.blocks`, message: "only props declare blocks" });
    if (kind === "prop" && definition.cells)
      issues.push({ path: `${path}.cells`, message: "only structures declare cell rules" });
    if (kind !== "unit" && definition.speed !== 0)
      issues.push({ path: `${path}.speed`, message: "static objects cannot move" });
    if (
      definition.cells &&
      (!definition.footprint ||
        definition.cells.length !== definition.footprint[1] ||
        definition.cells.some((row) => row.length !== definition.footprint?.[0]))
    )
      issues.push({ path: `${path}.cells`, message: "rows must match the original footprint" });
  }
}

/** Convert owner-authored content once. Missing health on a prop means no damageable health. */
export function toDefinition(content: {
  id: string;
  health?: number;
  destructible?: { health: number };
  movement?: { speed: number; turnRate?: number };
  footprint?: readonly number[];
  cells?: readonly string[];
  blocks?: string;
}): Definition {
  const { speed = 0, turnRate = 7200 } = content.movement ?? {};
  if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(turnRate) || turnRate < 0)
    throw new RangeError("Invalid content movement");
  const definition = {
    id: content.id,
    health: content.health ?? content.destructible?.health ?? 0,
    speed: Math.round((speed * 1024) / 20),
    turnRate: Math.round((turnRate * 0x10000) / 7200),
    ...(content.footprint && { footprint: [...content.footprint] }),
    ...(content.cells && { cells: [...content.cells] }),
    ...(content.blocks !== undefined && { blocks: content.blocks }),
  } as Definition;
  const issues: Issue[] = [];
  definitionSchema.check(definition, "$.definition", issues);
  if (!issues.length) checkDefinitions([definition], issues);
  if (issues.length)
    throw new Error(
      `Invalid definition: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  return definition;
}
