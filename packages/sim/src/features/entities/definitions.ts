import {
  arr,
  DOMAINS,
  type Issue,
  int,
  type MovementDomain,
  NODE_KINDS,
  type NodeKind,
  oneOf,
  opt,
  type ResourceId,
  rec,
  STRUCTURE_ROLES,
  str,
  UNIT_ROLES,
} from "@open-neo-rts/content";
import { strictObject } from "../../snapshots/schema";

/** Spawnable content in simulation units. A zero health prop is indestructible. */
export interface Definition {
  id: string;
  health: number;
  /** Integer subcells per tick; static objects always use 0. */
  speed: number;
  /** Binary angle units per tick. */
  turnRate: number;
  /** Completed structure capacity: positive supply, negative draw. */
  power?: number;
  role?: string;
  /** Missing/null means unavailable, never an implicit free construction recipe. */
  construction?: {
    readonly cost: Readonly<Partial<Record<ResourceId, number>>>;
    readonly buildTicks: number;
  } | null;
  requires?: readonly string[];
  builds?: readonly string[];
  domain?: MovementDomain;
  radiusSubcells?: number;
  domains?: readonly MovementDomain[];
  footprint?: readonly [number, number];
  cells?: readonly string[];
  nodeKinds?: readonly NodeKind[];
  blocks?: "nothing" | "movement" | "movement-and-vision";
}

const INT32_MAX = 0x7fffffff;
const recipeSchema = strictObject({
  cost: rec(int(0, INT32_MAX), /^(credits|materials|industrial-capacity|salvage-points)$/),
  buildTicks: int(0, INT32_MAX),
});
export const definitionSchema = strictObject({
  id: str(/^([a-z0-9-]+\.)?(unit|structure|prop):[a-z0-9-]+(\/[a-z0-9-]+)?$/),
  health: int(0, INT32_MAX),
  speed: int(0, INT32_MAX),
  turnRate: int(0, 0x10000),
  power: opt(int(-500, 500)),
  role: opt(oneOf([...UNIT_ROLES, ...STRUCTURE_ROLES])),
  construction: opt({
    json: { anyOf: [recipeSchema.json, { type: "null" }] },
    check(value, path, issues) {
      if (value !== null) recipeSchema.check(value, path, issues);
    },
  }),
  requires: opt(arr(str(/^[a-z0-9.:/-]+$/))),
  builds: opt(arr(str(/^([a-z0-9-]+\.)?structure:[a-z0-9-]+(\/[a-z0-9-]+)?$/))),
  domain: opt(oneOf(DOMAINS)),
  radiusSubcells: opt(int(0, 8192)),
  domains: opt(arr(oneOf(DOMAINS), 1)),
  footprint: opt(arr(int(1, 8), 2, 2)),
  cells: opt(arr(str(/^[lswn]+$/), 1, 8)),
  nodeKinds: opt(arr(oneOf(NODE_KINDS), 1, NODE_KINDS.length)),
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
    if (kind !== "structure" && definition.power !== undefined)
      issues.push({ path: `${path}.power`, message: "only structures declare power" });
    const roles: readonly string[] =
      kind === "unit" ? UNIT_ROLES : kind === "structure" ? STRUCTURE_ROLES : [];
    if (definition.role && !roles.includes(definition.role))
      issues.push({ path: `${path}.role`, message: "role must match the definition kind" });
    if (definition.builds && (kind !== "unit" || definition.role !== "builder"))
      issues.push({ path: `${path}.builds`, message: "only builder units declare build lists" });
    if (kind === "unit" && (definition.footprint || definition.cells || definition.blocks))
      issues.push({ path, message: "units do not have static footprints" });
    if (kind !== "prop" && definition.blocks !== undefined)
      issues.push({ path: `${path}.blocks`, message: "only props declare blocks" });
    if (kind === "prop" && definition.cells)
      issues.push({ path: `${path}.cells`, message: "only structures declare cell rules" });
    if (
      definition.nodeKinds &&
      (kind !== "structure" ||
        !definition.footprint ||
        new Set(definition.nodeKinds).size !== definition.nodeKinds.length)
    )
      issues.push({
        path: `${path}.nodeKinds`,
        message: "only structures with footprints declare distinct node kinds",
      });
    if (kind !== "unit" && definition.speed !== 0)
      issues.push({ path: `${path}.speed`, message: "static objects cannot move" });
    if (
      kind !== "unit" &&
      (definition.domain !== undefined || definition.radiusSubcells !== undefined)
    )
      issues.push({ path, message: "only units declare movement domain and radius" });
    if (kind !== "prop" && definition.domains !== undefined)
      issues.push({ path: `${path}.domains`, message: "only props restrict blocked domains" });
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
  movement?: { speed: number; turnRate?: number; domain?: string };
  radius?: number;
  domains?: readonly string[];
  footprint?: readonly number[];
  cells?: readonly string[];
  nodeKinds?: readonly NodeKind[];
  blocks?: string;
  power?: number;
}): Definition {
  const { speed = 0, turnRate = 7200 } = content.movement ?? {};
  if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(turnRate) || turnRate < 0)
    throw new RangeError("Invalid content movement");
  const definition = {
    id: content.id,
    health: content.health ?? content.destructible?.health ?? 0,
    speed: Math.round((speed * 1024) / 20),
    turnRate: Math.round((turnRate * 0x10000) / 7200),
    ...(content.power !== undefined && { power: content.power }),
    ...(content.movement?.domain !== undefined && { domain: content.movement.domain }),
    ...(content.radius !== undefined && { radiusSubcells: Math.round(content.radius * 1024) }),
    ...(content.domains && { domains: [...content.domains] }),
    ...(content.footprint && { footprint: [...content.footprint] }),
    ...(content.cells && { cells: [...content.cells] }),
    ...(content.nodeKinds && { nodeKinds: [...content.nodeKinds] }),
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
