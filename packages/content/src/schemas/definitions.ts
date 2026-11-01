// Every content file kind, defined once. `bun neo generate-schemas` writes these to content/schemas/.

import { MATERIALS } from "../assets/validate-model";
import { arr, bool, int, num, obj, oneOf, opt, rec, type Schema, str, unknown } from "./dsl";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const LOCALE_KEY = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const ASSET_PATH = /^assets\/[a-z0-9/._-]+$/;

/** `<kind>:<name>` inside a pack, `<pack>.<kind>:<name>` across packs. */
export const idOf = (kind: string): Schema =>
  str(new RegExp(`^([a-z0-9-]+\\.)?${kind}:[a-z0-9]+(-[a-z0-9]+)*$`), `${kind} ID`);
const anyId = str(/^([a-z0-9-]+\.)?[a-z]+:[a-z0-9]+(-[a-z0-9]+)*$/, "any definition ID");
const key = str(LOCALE_KEY, "locale key");

export const ARMOR_CLASSES = [
  "infantry",
  "light",
  "medium",
  "heavy",
  "aircraft",
  "naval",
  "structure",
] as const;
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
export const TARGETS = ["ground", "air", "naval", "structure", "projectile"] as const;
export const PROJECTILES = [
  "hitscan",
  "direct",
  "ballistic",
  "homing",
  "beam",
  "delivered",
] as const;
export const SEATS = ["human", "bot", "open"] as const;

const cost = rec(int(0), /^([a-z0-9-]+\.)?resource:[a-z0-9-]+$/);
const effect = obj(
  {
    type: oneOf([
      "modifyStat",
      "spawn",
      "damageArea",
      "reveal",
      "stealth",
      "disable",
      "heal",
      "grantResource",
    ]),
    target: opt(unknown("self, area, or a { tags } filter")),
    stat: opt(str()),
    percent: opt(int(0)),
    amount: opt(num()),
    radius: opt(num(0)),
    duration: opt(num(0)),
    unit: opt(idOf("unit")),
  },
  "A typed effect. New effect types are engine features, never scripts.",
);

const presentation = (kind: "unit" | "structure") =>
  obj({
    model: str(ASSET_PATH, "runtime model (.glb), relative to the pack"),
    icon: str(ASSET_PATH, "build-menu icon (.png)"),
    wreck: opt(
      str(ASSET_PATH, kind === "unit" ? "wreck model (.wreck.glb)" : "rubble model (.rubble.glb)"),
    ),
    materials: rec(oneOf(Object.keys(MATERIALS)), /^.+$/),
    parts: opt(arr(str(/^[a-z][a-z0-9_]*$/), 0)),
    sockets: opt(arr(str(/^socket_[a-z]+$/), 0)),
    animations: opt(arr(str(/^[a-z][a-z0-9_]*$/), 0)),
    sounds: opt(rec(str(ASSET_PATH))),
  });

const common = (kind: string) => ({
  id: idOf(kind),
  name: key,
  description: key,
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

export const SCHEMAS = {
  manifest: obj({
    id: str(KEBAB, "pack ID, equal to the folder name"),
    version: str(SEMVER),
    engine: str(undefined, "supported engine version range"),
    name: key,
    description: key,
    dependencies: rec(str(), KEBAB),
    files: obj(
      {
        rules: opt(arr(str(/^rules\/[a-z0-9-]+\.json$/))),
        factions: opt(arr(str(/^factions\/[a-z0-9-]+\.json$/))),
        units: opt(arr(str(/^units\/[a-z0-9-]+\.json$/))),
        structures: opt(arr(str(/^structures\/[a-z0-9-]+\.json$/))),
        weapons: opt(arr(str(/^weapons\/[a-z0-9-]+\.json$/))),
        abilities: opt(arr(str(/^abilities\/[a-z0-9-]+\.json$/))),
        research: opt(arr(str(/^research\/[a-z0-9-]+\.json$/))),
        profiles: opt(arr(str(/^profiles\/[a-z0-9-]+\.json$/))),
        presets: opt(arr(str(/^presets\/[a-z0-9-]+\.json$/))),
        maps: opt(arr(str(/^maps\/[a-z0-9-]+\/map\.json$/))),
        campaigns: opt(arr(str(/^campaigns\/[a-z0-9-]+\/campaign\.json$/))),
        locales: opt(arr(str(/^locales\/[a-z]{2}(-[A-Z]{2})?\.json$/))),
      },
      "Every content file the pack includes. The loader reads exactly these; unlisted files are an error.",
    ),
    hidden: opt(bool()),
  }),
  resources: obj({
    resources: arr(
      obj({ id: idOf("resource"), kind: oneOf(["stock", "capacity", "flow"]), name: key }),
      1,
    ),
  }),
  damage: obj({
    armorClasses: arr(oneOf(ARMOR_CLASSES), 1),
    damageTypes: rec(rec(int(0, 1000), /^[a-z]+$/), /^[a-zA-Z]+$/),
  }),
  settings: obj({
    settings: arr(
      obj({
        id: str(/^[a-zA-Z]+$/),
        group: oneOf([
          "caps",
          "economy",
          "speed",
          "combat",
          "vision",
          "victory",
          "teams",
          "bots",
          "modules",
        ]),
        type: oneOf(["integer", "enum", "boolean"]),
        default: unknown(),
        min: opt(int()),
        max: opt(int()),
        options: opt(arr(str(), 1)),
        scope: arr(oneOf(["match", "faction", "force"]), 1),
      }),
      1,
    ),
  }),
  faction: obj({
    ...common("faction"),
    color: str(/^#[0-9a-f]{6}$/, "default team colour"),
    start: obj({
      structures: arr(idOf("structure")),
      units: arr(obj({ unit: idOf("unit"), count: int(1, 50) })),
      resources: cost,
    }),
    ai: obj({ personality: str(KEBAB) }),
  }),
  unit: obj({
    ...common("unit"),
    faction: idOf("faction"),
    family: oneOf(FAMILIES),
    tags: opt(arr(str(KEBAB))),
    cost,
    buildTime: num(0, 600, "seconds"),
    producedBy: arr(idOf("structure"), 1),
    requires: opt(arr(anyId)),
    health: int(1),
    armor: oneOf(ARMOR_CLASSES),
    movement: obj({
      domain: oneOf(DOMAINS),
      speed: num(0, 50, "cells per second"),
      turnRate: opt(num(0, 3600, "degrees per second")),
    }),
    radius: num(0.1, 8, "collision radius in cells"),
    vision: num(0, 40, "cells"),
    pop: int(0, 20),
    weapons: arr(idOf("weapon")),
    abilities: opt(arr(idOf("ability"))),
    turret: opt(obj({ turnRate: num(0, 3600, "degrees per second") })),
    harvest: opt(obj({ capacity: int(1) })),
    transport: opt(obj({ slots: int(1, 20) })),
    ...eraFields,
    presentation: presentation("unit"),
  }),
  structure: obj({
    ...common("structure"),
    faction: idOf("faction"),
    tags: opt(arr(str(KEBAB))),
    cost: opt(cost),
    buildTime: opt(num(0, 600, "seconds")),
    producedBy: opt(arr(idOf("structure"), 1)),
    requires: opt(arr(anyId)),
    health: int(1),
    armor: oneOf(ARMOR_CLASSES),
    footprint: arr(int(1, 8), 2, 2),
    power: int(-500, 500, "+ produced, - used"),
    vision: num(0, 40, "cells"),
    pop: opt(int(0)),
    weapons: opt(arr(idOf("weapon"))),
    abilities: opt(arr(idOf("ability"))),
    spawnsWith: opt(arr(idOf("unit"))),
    dock: opt(bool()),
    garrison: opt(obj({ slots: int(1, 20) })),
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
  weapon: obj({
    id: idOf("weapon"),
    damageType: str(/^[a-zA-Z]+$/),
    damage: int(0),
    range: arr(num(0, 60, "cells"), 2, 2),
    reload: num(0, 120, "seconds"),
    burst: opt(int(1, 20)),
    projectile: obj({
      kind: oneOf(PROJECTILES),
      speed: opt(num(0, 200, "cells per second")),
      turnRate: opt(num(0, 3600)),
    }),
    targets: arr(oneOf(TARGETS), 1),
    splash: opt(obj({ radius: num(0, 20, "cells"), edgePercent: int(0, 100) })),
    socket: opt(
      str(/^socket_[a-z]+$/, "muzzle socket on the carrier's model; defaults to socket_muzzle"),
    ),
  }),
  ability: obj({
    ...common("ability"),
    target: oneOf(["self", "unit", "point", "area"]),
    range: opt(num(0, 200, "cells")),
    cooldown: num(0, 3600, "seconds"),
    autoCast: opt(bool()),
    cost: opt(cost),
    effects: arr(effect, 1),
  }),
  research: obj({
    ...common("research"),
    researchedAt: arr(idOf("structure"), 1),
    cost,
    researchTime: num(0, 900, "seconds"),
    requires: opt(arr(anyId)),
    effects: arr(effect),
  }),
  profile: obj({
    ...common("profile"),
    packs: arr(str(KEBAB), 1),
    factions: arr(idOf("faction"), 1),
    resources: arr(idOf("resource"), 1),
    rules: obj({
      modules: arr(oneOf(["weather", "territory", "supply", "trade", "eras", "wonders"])),
      settings: rec(unknown()),
    }),
    presets: arr(idOf("preset"), 1),
    maps: opt(arr(idOf("map"))),
  }),
  preset: obj({
    ...common("preset"),
    forces: arr(
      obj({ team: str(/^[A-H]$/), seats: arr(oneOf(SEATS), 1, 4), faction: opt(idOf("faction")) }),
      2,
      8,
    ),
    settings: rec(unknown()),
  }),
  locale: rec(str(), LOCALE_KEY),
} satisfies Record<string, Schema>;

export type SchemaName = keyof typeof SCHEMAS;

/** Which schema a manifest `files` group uses. */
export const GROUP_SCHEMA: Record<string, SchemaName | ((file: string) => SchemaName)> = {
  rules: (file) =>
    file.endsWith("resources.json")
      ? "resources"
      : file.endsWith("damage.json")
        ? "damage"
        : "settings",
  factions: "faction",
  units: "unit",
  structures: "structure",
  weapons: "weapon",
  abilities: "ability",
  research: "research",
  profiles: "profile",
  presets: "preset",
  locales: "locale",
};
