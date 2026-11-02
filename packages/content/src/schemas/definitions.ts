// Every content file kind, defined once. `bun neo generate-schemas` writes these to content/schemas/.

import { MATERIALS } from "../assets/validate-model";
import {
  ARMOR_CLASSES,
  BLOCKERS,
  PROJECTILE_KINDS,
  TARGETS,
  WARHEAD_TAGS,
  WARHEAD_TYPES,
} from "../rules/combat";
import { NODE_KINDS, RESOURCES } from "../rules/resources";
import { STRUCTURE_ROLES, UNIT_ROLES } from "../rules/roles";
import { arr, bool, int, num, obj, oneOf, opt, rec, type Schema, str, unknown } from "./dsl";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const FILE = /^[a-z0-9]+([._-][a-z0-9]+)*\.[a-z0-9]+$/;

/**
 * IDs mirror folders: `faction:prototype`, `unit:prototype/tank`, `structure:neutral/oil-derrick`,
 * `prop:temperate/tree-oak`, `map:training-grounds`. Another pack's content: `<pack>.unit:…`.
 */
export const idOf = (kind: string): Schema =>
  str(new RegExp(`^([a-z0-9-]+\\.)?${kind}:[a-z0-9-]+(/[a-z0-9-]+)?$`), `${kind} ID`);
const anyId = str(/^([a-z0-9-]+\.)?[a-z]+:[a-z0-9-]+(\/[a-z0-9-]+)?$/, "any definition ID");
const text = (max: number, description: string) => str(new RegExp(`^.{1,${max}}$`), description);
const name = text(60, "English name; translations go in locales/<lang>.json");
const description = text(400, "English description");

export const DOMAINS = [
  "foot",
  "wheeled",
  "tracked",
  "hover",
  "amphibious",
  "naval",
  "air",
] as const;
export const FAMILIES = ["infantry", "vehicle", "aircraft", "naval"] as const;
export const EFFECTS = [
  "modifyStat",
  "spawn",
  "damageArea",
  "reveal",
  "stealth",
  "disable",
  "heal",
  "grantResource",
] as const;

const cost = rec(int(0), new RegExp(`^(${RESOURCES.map((r) => r.id).join("|")})$`));
const resourceShape = obj({
  kind: oneOf(["ore", ...NODE_KINDS]),
  position: arr(num(0, 512, "cells"), 2, 2),
  amount: opt(
    int(1, undefined, "finite stock; required for ore/materials; omitted oil is unlimited"),
  ),
  radius: opt(num(0, 20, "cells")),
});
const mapResource: Schema = {
  json: {
    ...resourceShape.json,
    allOf: [
      { if: { properties: { kind: { const: "oil" } } }, else: { required: ["amount"] } },
      { if: { properties: { kind: { const: "ore" } } }, else: { not: { required: ["radius"] } } },
    ],
  },
  check(value, path, issues) {
    resourceShape.check(value, path, issues);
    if (typeof value !== "object" || value === null || !("kind" in value)) return;
    if (value.kind !== "oil" && !("amount" in value))
      issues.push({ path: `${path}.amount`, message: "is required for ore/materials" });
    if (value.kind !== "ore" && "radius" in value)
      issues.push({ path: `${path}.radius`, message: "only ore fields have a radius" });
  },
};
const effect = obj(
  {
    type: oneOf(EFFECTS),
    target: opt(unknown("a { tags } filter for which units it affects")),
    scope: opt(
      oneOf(["self", "target", "area", "force", "team"], "who it reaches; area uses radius"),
    ),
    stat: opt(
      oneOf([
        "damage",
        "health",
        "speed",
        "reload",
        "range",
        "vision",
        "armor",
        "productionSpeed",
        "researchSpeed",
        "power",
        "cost",
        "shieldStrength",
        "empResistance",
        "repair",
        "mobile",
      ]),
    ),
    percent: opt(int(0)),
    amount: opt(num()),
    radius: opt(num(0)),
    duration: opt(num(0)),
    unit: opt(idOf("unit")),
  },
  "A typed effect. New effect types are engine features, never scripts.",
);

/** What a unit or structure can repair or heal, how fast, and at what cost. */
const repair = obj({
  targets: obj({
    families: opt(arr(oneOf(FAMILIES))),
    roles: opt(arr(oneOf([...UNIT_ROLES, ...STRUCTURE_ROLES]))),
    tags: opt(arr(str(KEBAB))),
    structures: opt(bool()),
  }),
  rate: num(0, 1000, "health per second"),
  range: opt(num(0, 20, "cells; 0 means adjacent")),
  costPercent: opt(int(0, 100, "share of the target's cost for a full repair")),
  automatic: opt(bool()),
});

/** How a shot travels. */
const projectile = obj({
  kind: oneOf(PROJECTILE_KINDS),
  speed: opt(num(0, 200, "cells per second (not for instant or beam)")),
  gravity: opt(num(0, 100, "arc height factor for arc and grenade")),
  turnRate: opt(num(0, 3600, "degrees per second (missile)")),
  flightTime: opt(num(0, 60, "seconds before a missile self-destructs")),
  fuse: opt(num(0, 30, "seconds between impact and detonation")),
  blockedBy: opt(arr(oneOf(BLOCKERS))),
  interceptable: opt(bool()),
});

/** What happens on impact. A weapon applies its warheads in order. */
const warhead = obj({
  type: oneOf(WARHEAD_TYPES),
  amount: opt(int(0, 100000, "damage for damage; per second for burn")),
  versus: opt(
    rec(
      int(0, 1000, "percent of amount dealt to this armour class"),
      new RegExp(`^(default|${ARMOR_CLASSES.join("|")})$`),
    ),
  ),
  radius: opt(num(0, 20, "splash radius in cells")),
  falloff: opt(arr(int(0, 100, "percent"), 1, 8)),
  delay: opt(num(0, 30, "seconds after impact")),
  duration: opt(num(0, 120, "seconds (burn, disable, slow, reveal)")),
  percent: opt(int(0, 100, "slow strength")),
  unit: opt(idOf("unit")),
  count: opt(int(1, 20)),
  friendlyFire: opt(bool()),
  tags: opt(arr(oneOf(WARHEAD_TAGS))),
});

/** What a unit or defence fires: launcher, projectile, warheads. Defined inline in its unit or structure. */
const weapon = obj({
  id: str(KEBAB, "local name, unique within this definition"),
  targets: arr(oneOf(TARGETS), 1),
  range: arr(num(0, 60, "cells"), 2, 2),
  reload: num(0, 120, "seconds"),
  burst: opt(obj({ count: int(1, 20), delay: num(0, 10, "seconds between shots") })),
  accuracy: opt(num(0, 10, "scatter radius in cells at maximum range; 0 is perfect")),
  aim: opt(oneOf(["turret", "forward", "omni"])),
  arc: opt(num(0, 360, "degrees the unit may be off-facing when aim is forward")),
  socket: opt(str(/^socket_[a-z]+$/, "muzzle socket it fires from; defaults to socket_muzzle")),
  projectile,
  warheads: arr(warhead, 1),
});

/** An activated or passive ability, defined inline in its unit or structure. */
const ability = obj({
  id: str(KEBAB, "local name, unique within this definition"),
  name,
  description,
  target: oneOf(["self", "unit", "point", "area"]),
  range: opt(num(0, 200, "cells")),
  cooldown: num(0, 3600, "seconds"),
  autoCast: opt(bool()),
  cost: opt(cost),
  effects: arr(effect, 1),
});

/** Research offered by a structure, defined inline in that structure. */
const research = obj({
  id: str(KEBAB, "local name, unique within this structure"),
  name,
  description,
  cost,
  researchTime: num(0, 900, "seconds"),
  requires: opt(arr(anyId)),
  effects: arr(effect),
});

const presentation = (kind: "unit" | "structure" | "prop") =>
  obj({
    model: str(FILE, "runtime model (.glb) in the same folder"),
    icon: opt(str(FILE, "icon (.png) in the same folder")),
    wreck: opt(
      str(FILE, kind === "unit" ? "wreck model (.wreck.glb)" : "rubble model (.rubble.glb)"),
    ),
    materials: rec(oneOf(Object.keys(MATERIALS)), /^.+$/),
    parts: opt(arr(str(/^[a-z][a-z0-9_]*$/))),
    sockets: opt(arr(str(/^socket_[a-z]+$/))),
    animations: opt(arr(str(/^[a-z][a-z0-9_]*$/))),
    sounds: opt(rec(str(FILE), /^[a-z_]+$/)),
    damageStates: opt(
      arr(
        obj({
          below: int(1, 99, "health percent"),
          show: opt(oneOf(["state_damaged", "state_critical"])),
          effects: opt(arr(oneOf(["smoke", "fire", "sparks", "leak"]))),
        }),
        1,
        3,
      ),
    ),
    construction: opt(oneOf(["bricks", "drop", "unfold"])),
    destruction: opt(
      obj({
        style: oneOf(["explode", "collapse", "sink", "crash"]),
        size: oneOf(["small", "medium", "large", "huge"]),
      }),
    ),
  });

const eraFields = {
  eras: opt(arr(idOf("era"), 1)),
  eraVariants: opt(
    rec(
      unknown("partial definition overriding fields for that era"),
      /^([a-z0-9-]+\.)?era:[a-z0-9-]+$/,
    ),
  ),
};

const listOf = (pattern: RegExp) => opt(arr(str(pattern)));

export const SCHEMAS = {
  manifest: obj({
    id: str(KEBAB, "pack ID, equal to the folder name"),
    version: str(SEMVER),
    engine: str(undefined, "supported engine version range"),
    name,
    description,
    dependencies: rec(str(undefined, "semver range"), KEBAB),
    optionalDependencies: opt(rec(str(undefined, "semver range"), KEBAB)),
    conflicts: opt(rec(str(undefined, "semver range of incompatible versions"), KEBAB)),
    gameplay: opt(bool()),
    files: obj(
      {
        factions: listOf(/^factions\/[a-z0-9-]+\/faction\.json$/),
        units: listOf(/^factions\/[a-z0-9-]+\/units\/[a-z0-9-]+\/unit\.json$/),
        structures: listOf(
          /^(factions\/[a-z0-9-]+|neutral)\/structures\/[a-z0-9-]+\/structure\.json$/,
        ),
        props: listOf(/^props\/[a-z0-9-]+\/[a-z0-9-]+\/prop\.json$/),
        maps: listOf(/^maps\/[a-z0-9-]+\/map\.json$/),
        campaigns: listOf(/^campaigns\/[a-z0-9-]+\/campaign\.json$/),
        locales: listOf(/^locales\/[a-z]{2}(-[A-Z]{2})?\.json$/),
      },
      "Every definition file the pack includes. The loader reads exactly these; unlisted files are an error.",
    ),
  }),
  faction: obj({
    id: idOf("faction"),
    name,
    description,
    color: str(/^#[0-9a-f]{6}$/, "default team colour"),
    start: obj({
      structures: arr(idOf("structure")),
      units: arr(obj({ unit: idOf("unit"), count: int(1, 50) })),
      resources: cost,
    }),
    ai: obj({ personality: str(KEBAB) }),
  }),
  unit: obj({
    id: idOf("unit"),
    name,
    description,
    role: oneOf(UNIT_ROLES, "what the engine treats it as; names differ per faction"),
    family: oneOf(FAMILIES),
    tags: opt(arr(str(KEBAB))),
    cost,
    buildTime: num(0, 600, "seconds"),
    producedBy: arr(idOf("structure"), 1),
    requires: opt(arr(anyId)),
    health: int(1),
    armor: oneOf(ARMOR_CLASSES),
    resist: opt(
      rec(
        int(0, 1000, "percent taken from warheads with this tag"),
        new RegExp(`^(${WARHEAD_TAGS.join("|")})$`),
      ),
    ),
    movement: obj({
      domain: oneOf(DOMAINS),
      speed: num(0, 50, "cells per second"),
      turnRate: opt(num(0, 3600, "degrees per second")),
    }),
    radius: num(0.1, 8, "collision radius in cells"),
    vision: num(0, 40, "cells"),
    pop: int(0, 20),
    weapons: arr(weapon),
    abilities: opt(arr(ability)),
    turret: opt(obj({ turnRate: num(0, 3600, "degrees per second") })),
    harvest: opt(obj({ capacity: int(1) })),
    transport: opt(obj({ slots: int(1, 20) })),
    ammo: opt(int(1, 50, "attack runs before rearming (fixed-wing)")),
    repair: opt(repair),
    ...eraFields,
    presentation: presentation("unit"),
  }),
  structure: obj({
    id: idOf("structure"),
    name,
    description,
    role: oneOf(
      STRUCTURE_ROLES,
      "what the engine treats it as; any builder of the faction constructs it",
    ),
    tags: opt(arr(str(KEBAB))),
    cost: opt(cost),
    buildTime: opt(num(0, 600, "seconds with one builder")),
    requires: opt(arr(anyId)),
    health: int(1),
    armor: oneOf(ARMOR_CLASSES),
    resist: opt(
      rec(
        int(0, 1000, "percent taken from warheads with this tag"),
        new RegExp(`^(${WARHEAD_TAGS.join("|")})$`),
      ),
    ),
    footprint: arr(int(1, 8), 2, 2),
    cells: opt(arr(str(/^[lsw]+$/), 1, 8)),
    nodeKinds: opt(arr(oneOf(NODE_KINDS), 1, NODE_KINDS.length)),
    extraction: opt(
      rec(
        obj({ resource: oneOf(["credits", "materials"]), amountPerSecond: int(1, 0x7fffffff) }),
        /^(materials|oil)$/,
      ),
    ),
    power: int(-500, 500, "+ produced, - used"),
    vision: num(0, 40, "cells"),
    pop: opt(int(0)),
    weapons: opt(arr(weapon)),
    abilities: opt(arr(ability)),
    research: opt(arr(research)),
    spawnsWith: opt(arr(idOf("unit"))),
    dock: opt(bool()),
    pads: opt(int(1, 8, "aircraft pads")),
    garrison: opt(obj({ slots: int(1, 20) })),
    repair: opt(repair),
    adjacency: opt(
      arr(
        obj({
          tags: arr(str(KEBAB), 1),
          radius: num(0, 10),
          stat: str(),
          percent: int(0),
          maxSources: int(1, 5),
        }),
      ),
    ),
    ...eraFields,
    presentation: presentation("structure"),
  }),
  prop: obj({
    id: idOf("prop"),
    name,
    description: opt(description),
    footprint: arr(int(1, 8), 2, 2),
    blocks: oneOf(["nothing", "movement", "movement-and-vision"]),
    domains: opt(arr(oneOf(DOMAINS), 1)),
    destructible: opt(obj({ health: int(1), crushable: opt(bool()) })),
    harvest: opt(obj({ resource: oneOf(RESOURCES.map((r) => r.id)), amount: int(1) })),
    presentation: presentation("prop"),
  }),
  map: obj({
    id: idOf("map"),
    name,
    description,
    size: obj({ width: int(32, 512, "cells"), height: int(32, 512, "cells") }),
    biome: str(KEBAB),
    players: obj({ min: int(1, 8), max: int(1, 8) }),
    spawns: arr(
      obj({
        id: str(KEBAB),
        position: arr(num(0, 512, "cells"), 2, 2),
        facing: num(0, 360, "degrees"),
      }),
      1,
      8,
    ),
    teams: opt(arr(arr(str(KEBAB), 1, 4), 2, 4)),
    start: oneOf(
      ["faction", "empty"],
      "faction: each spawn gets its faction's start kit; empty: only pre-placed objects",
    ),
    resources: arr(mapResource),
    objects: arr(
      obj({
        definition: anyId,
        position: arr(num(0, 512, "cells"), 2, 2),
        rotation: opt(int(0, 270, "degrees, multiples of 90")),
        owner: str(/^(neutral|[a-z0-9]+(-[a-z0-9]+)*)$/, "neutral, or a spawn ID"),
      }),
    ),
    layers: opt(
      obj({
        height: opt(str(FILE)),
        ramps: opt(str(FILE)),
        surface: opt(str(FILE)),
        water: opt(str(FILE)),
        biome: opt(str(FILE)),
      }),
    ),
  }),
  locale: rec(str(), /^[a-z]+:[a-z0-9/-]+\.[a-z.-]+$/),
} satisfies Record<string, Schema>;

export type SchemaName = keyof typeof SCHEMAS;

/** Which schema each manifest `files` group uses. */
export const GROUP_SCHEMA: Record<string, SchemaName> = {
  factions: "faction",
  units: "unit",
  structures: "structure",
  props: "prop",
  maps: "map",
  locales: "locale",
};
