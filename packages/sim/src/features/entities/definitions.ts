import {
  ARMOR_CLASSES,
  type ArmorClass,
  arr,
  bool,
  DOMAINS,
  FAMILIES,
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
  WARHEAD_TAGS,
} from "@open-neo-rts/content";
import { strictObject } from "../../snapshots/schema";
import { type GameplayWeapon, weaponSchema } from "./weapons";

export interface RepairDefinition {
  readonly targets: {
    readonly families: readonly string[];
    readonly roles: readonly string[];
    readonly tags: readonly string[];
    readonly structures?: boolean;
  };
  readonly rateMilliHealthPerSecond: number;
  readonly rangeSubcells?: number;
  readonly costPerMille?: number;
  readonly automatic?: boolean;
}

export interface DeployModeDefinition {
  readonly id: string;
  readonly cooldownTicks: number;
  readonly damagePerMille: number;
  readonly armorPerMille: number;
  readonly rangePerMille: number;
  readonly rangeBonusSubcells: number;
  readonly cost: Readonly<Partial<Record<ResourceId, number>>>;
}

/** Spawnable content in simulation units. A zero health prop is indestructible. */
export interface Definition {
  id: string;
  health: number;
  /** Integer subcells per tick; static objects always use 0. */
  speed: number;
  /** Binary angle units per tick. */
  turnRate: number;
  /** Authored circular sight radius in integer subcells; omitted means no vision source. */
  visionSubcells?: number;
  /** Completed structure capacity: positive supply, negative draw. */
  power?: number;
  role?: string;
  tags?: readonly string[];
  repair?: RepairDefinition;
  harvestCapacity?: number;
  harvestAmountPerSecond?: number;
  dock?: boolean;
  armor?: ArmorClass;
  resistPerMille?: Readonly<Record<string, number>>;
  weapons?: readonly GameplayWeapon[];
  deployMode?: DeployModeDefinition;
  turretTurnAnglePerTick?: number;
  /** Missing/null means unavailable, never an implicit free construction recipe. */
  construction?: {
    readonly cost: Readonly<Partial<Record<ResourceId, number>>>;
    readonly buildTicks: number;
  } | null;
  requires?: readonly string[];
  builds?: readonly string[];
  produces?: readonly string[];
  spawnsWith?: readonly string[];
  pop?: number;
  productionSlots?: number;
  exits?: readonly {
    readonly side: "north" | "east" | "south" | "west";
    readonly cell: readonly [number, number];
  }[];
  domain?: MovementDomain;
  radiusSubcells?: number;
  domains?: readonly MovementDomain[];
  footprint?: readonly [number, number];
  cells?: readonly string[];
  nodeKinds?: readonly NodeKind[];
  /** Whole stock units per second; accumulated before integer payout. */
  extraction?: Readonly<
    Partial<
      Record<
        NodeKind,
        {
          readonly resource: "credits" | "materials";
          readonly amountPerSecond: number;
        }
      >
    >
  >;
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
  visionSubcells: opt(int(0, 40 * 1024)),
  power: opt(int(-500, 500)),
  harvestCapacity: opt(int(1, INT32_MAX)),
  harvestAmountPerSecond: opt(int(1, INT32_MAX)),
  dock: opt(bool()),
  role: opt(oneOf([...UNIT_ROLES, ...STRUCTURE_ROLES])),
  armor: opt(oneOf(ARMOR_CLASSES)),
  resistPerMille: opt(rec(int(0, 10000), new RegExp(`^(${WARHEAD_TAGS.join("|")})$`))),
  weapons: opt(arr(weaponSchema, 0, 32)),
  deployMode: opt(
    strictObject({
      id: str(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      cooldownTicks: int(0, 2400),
      damagePerMille: int(0, 2000),
      armorPerMille: int(1000, 2000),
      rangePerMille: int(0, 10000),
      rangeBonusSubcells: int(0, 60 * 1024),
      cost: rec(int(0, INT32_MAX), /^(credits|materials|industrial-capacity|salvage-points)$/),
    }),
  ),
  turretTurnAnglePerTick: opt(int(0, 0x10000)),
  tags: opt(arr(str(/^[a-z0-9-]+$/), 0, 1000)),
  repair: opt(
    strictObject({
      targets: strictObject({
        families: arr(oneOf(FAMILIES), 0, FAMILIES.length),
        roles: arr(
          oneOf([...UNIT_ROLES, ...STRUCTURE_ROLES]),
          0,
          UNIT_ROLES.length + STRUCTURE_ROLES.length,
        ),
        tags: arr(str(/^[a-z0-9-]+$/), 0, 1000),
        structures: opt(bool()),
      }),
      rateMilliHealthPerSecond: int(0, 1_000_000),
      rangeSubcells: opt(int(0, 20 * 1024)),
      costPerMille: opt(int(0, 1000)),
      automatic: opt(bool()),
    }),
  ),
  construction: opt({
    json: { anyOf: [recipeSchema.json, { type: "null" }] },
    check(value, path, issues) {
      if (value !== null) recipeSchema.check(value, path, issues);
    },
  }),
  requires: opt(arr(str(/^[a-z0-9.:/-]+$/))),
  builds: opt(arr(str(/^([a-z0-9-]+\.)?structure:[a-z0-9-]+(\/[a-z0-9-]+)?$/))),
  produces: opt(arr(str(/^([a-z0-9-]+\.)?unit:[a-z0-9-]+(\/[a-z0-9-]+)?$/), 0, 1000)),
  spawnsWith: opt(arr(str(/^([a-z0-9-]+\.)?unit:[a-z0-9-]+(\/[a-z0-9-]+)?$/), 0, 1000)),
  pop: opt(int(0, INT32_MAX)),
  productionSlots: opt(int(1, 5)),
  exits: opt(
    arr(
      strictObject({ side: oneOf(["north", "east", "south", "west"]), cell: arr(int(0, 7), 2, 2) }),
      1,
      8,
    ),
  ),
  domain: opt(oneOf(DOMAINS)),
  radiusSubcells: opt(int(0, 8192)),
  domains: opt(arr(oneOf(DOMAINS), 1)),
  footprint: opt(arr(int(1, 8), 2, 2)),
  cells: opt(arr(str(/^[lswn]+$/), 1, 8)),
  nodeKinds: opt(arr(oneOf(NODE_KINDS), 1, NODE_KINDS.length)),
  extraction: opt(
    rec(
      strictObject({
        resource: oneOf(["credits", "materials"]),
        amountPerSecond: int(1, INT32_MAX),
      }),
      /^(materials|oil)$/,
    ),
  ),
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
    if (definition.deployMode && kind !== "unit")
      issues.push({ path: `${path}.deployMode`, message: "only units deploy in this phase" });
    if (definition.weapons?.length && (kind === "prop" || !definition.armor))
      issues.push({ path: `${path}.weapons`, message: "armed units/structures require armour" });
    const weaponIds = new Set<string>();
    for (const [index, weapon] of (definition.weapons ?? []).entries()) {
      if (weaponIds.has(weapon.id))
        issues.push({ path: `${path}.weapons[${index}].id`, message: "duplicate local weapon ID" });
      weaponIds.add(weapon.id);
      if (weapon.rangeSubcells[0] > weapon.rangeSubcells[1])
        issues.push({ path: `${path}.weapons[${index}].rangeSubcells`, message: "inverted range" });
      if (weapon.aim === "turret" && definition.turretTurnAnglePerTick === undefined)
        issues.push({
          path: `${path}.weapons[${index}].aim`,
          message: "turret aiming requires an authored turret turn rate",
        });
    }
    if (kind !== "prop" && definition.health === 0)
      issues.push({ path: `${path}.health`, message: "must be positive for units/structures" });
    if (kind === "prop" && definition.visionSubcells !== undefined)
      issues.push({
        path: `${path}.visionSubcells`,
        message: "only units/structures reveal terrain",
      });
    if (kind !== "structure" && definition.power !== undefined)
      issues.push({ path: `${path}.power`, message: "only structures declare power" });
    if (
      (definition.harvestCapacity !== undefined ||
        definition.harvestAmountPerSecond !== undefined) &&
      (kind !== "unit" || definition.role !== "harvester")
    )
      issues.push({
        path: `${path}.harvestCapacity`,
        message: "only harvester units declare cargo and mining rates",
      });
    if (definition.harvestAmountPerSecond !== undefined && definition.harvestCapacity === undefined)
      issues.push({
        path: `${path}.harvestAmountPerSecond`,
        message: "mining requires bounded cargo capacity",
      });
    if (definition.dock !== undefined && (kind !== "structure" || definition.role !== "dropoff"))
      issues.push({
        path: `${path}.dock`,
        message: "only drop-off structures declare a cargo dock",
      });
    const roles: readonly string[] =
      kind === "unit" ? UNIT_ROLES : kind === "structure" ? STRUCTURE_ROLES : [];
    if (definition.role && !roles.includes(definition.role))
      issues.push({ path: `${path}.role`, message: "role must match the definition kind" });
    if (definition.builds && (kind !== "unit" || definition.role !== "builder"))
      issues.push({ path: `${path}.builds`, message: "only builder units declare build lists" });
    if (
      (definition.produces ||
        definition.spawnsWith ||
        definition.productionSlots !== undefined ||
        definition.exits) &&
      kind !== "structure"
    )
      issues.push({
        path,
        message: "only structures declare production lists, capacity and exits",
      });
    for (const field of ["produces", "spawnsWith"] as const)
      for (const reference of definition[field] ?? []) {
        const unit = definitions.find((candidate) => candidate.id === reference);
        if (
          unit?.id.split(":")[0]?.split(".").at(-1) !== "unit" ||
          unit.pop === undefined ||
          unit.domain === undefined ||
          unit.radiusSubcells === undefined
        )
          issues.push({
            path: `${path}.${field}`,
            message: "production references require unit population and movement metadata",
          });
      }
    for (const exit of definition.exits ?? []) {
      const [x, y] = exit.cell,
        [w = 0, d = 0] = definition.footprint ?? [];
      if (
        x >= w ||
        y >= d ||
        (exit.side === "north" && y !== 0) ||
        (exit.side === "south" && y !== d - 1) ||
        (exit.side === "west" && x !== 0) ||
        (exit.side === "east" && x !== w - 1)
      )
        issues.push({
          path: `${path}.exits`,
          message: "exit cell must be on its declared footprint side",
        });
    }
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
      definition.extraction &&
      (kind !== "structure" ||
        definition.role !== "extractor" ||
        definition.power === undefined ||
        !definition.nodeKinds?.length ||
        Object.keys(definition.extraction).length !== definition.nodeKinds.length ||
        definition.nodeKinds.some((node) => !Object.hasOwn(definition.extraction as object, node)))
    )
      issues.push({
        path: `${path}.extraction`,
        message: "powered extractor requires one output for each bound node kind",
      });
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
  role?: string;
  harvest?: { capacity: number; amountPerSecond?: number };
  dock?: boolean;
  pop?: number;
  productionSlots?: number;
  exits?: readonly { side: string; cell: readonly number[] }[];
  health?: number;
  vision?: number;
  destructible?: { health: number };
  movement?: { speed: number; turnRate?: number; domain?: string };
  radius?: number;
  domains?: readonly string[];
  footprint?: readonly number[];
  cells?: readonly string[];
  nodeKinds?: readonly NodeKind[];
  extraction?: Definition["extraction"];
  blocks?: string;
  power?: number;
}): Definition {
  const { speed = 0, turnRate = 7200 } = content.movement ?? {};
  if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(turnRate) || turnRate < 0)
    throw new RangeError("Invalid content movement");
  const definition = {
    id: content.id,
    ...(content.role !== undefined && { role: content.role }),
    ...(content.harvest && { harvestCapacity: content.harvest.capacity }),
    ...(content.harvest?.amountPerSecond !== undefined && {
      harvestAmountPerSecond: content.harvest.amountPerSecond,
    }),
    ...(content.dock !== undefined && { dock: content.dock }),
    ...(content.pop !== undefined && { pop: content.pop }),
    ...(content.productionSlots !== undefined && { productionSlots: content.productionSlots }),
    ...(content.exits && {
      exits: content.exits.map((exit) => ({ side: exit.side, cell: [...exit.cell] })),
    }),
    health: content.health ?? content.destructible?.health ?? 0,
    speed: Math.round((speed * 1024) / 20),
    turnRate: Math.round((turnRate * 0x10000) / 7200),
    ...(content.vision !== undefined && { visionSubcells: Math.round(content.vision * 1024) }),
    ...(content.power !== undefined && { power: content.power }),
    ...(content.movement?.domain !== undefined && { domain: content.movement.domain }),
    ...(content.radius !== undefined && { radiusSubcells: Math.round(content.radius * 1024) }),
    ...(content.domains && { domains: [...content.domains] }),
    ...(content.footprint && { footprint: [...content.footprint] }),
    ...(content.cells && { cells: [...content.cells] }),
    ...(content.nodeKinds && { nodeKinds: [...content.nodeKinds] }),
    ...(content.extraction && {
      extraction: Object.fromEntries(
        Object.entries(content.extraction).map(([kind, output]) => [kind, { ...output }]),
      ),
    }),
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
