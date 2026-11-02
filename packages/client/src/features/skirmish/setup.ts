import { MATCH_SETTINGS, type TerrainGrid } from "@open-neo-rts/content";
import { createNormalMatchSetup, type GameplayCatalog, toMatchResources } from "@open-neo-rts/sim";
import faction from "../../../../../content/core/factions/eastern-collective/faction.json";
import map from "../../../../../content/core/maps/training-grounds/map.json";
import { text } from "../../shared";

export { faction, map };
export const SETUP_STORAGE_KEY = "open-neo-rts.skirmish.v1";
export const numericSettings = ["startingCredits", "popCap", "structureCap"] as const;
export function rule(id: (typeof numericSettings)[number]) {
  const setting = MATCH_SETTINGS.find((setting) => setting.id === id);
  if (setting?.type !== "integer") throw new Error(`Missing integer match setting: ${id}`);
  return {
    min: setting.min as number,
    max: setting.max as number,
    default: setting.default as number,
  };
}
export interface SkirmishSetup {
  format: 1;
  seed: number;
  yourSpawn: string;
  otherSpawn: string;
  startingCredits: number;
  popCap: number;
  structureCap: number;
}
export function defaultSkirmish(): SkirmishSetup {
  return {
    format: 1,
    seed: 1,
    yourSpawn: "north-west",
    otherSpawn: "south-east",
    startingCredits: rule("startingCredits").default,
    popCap: rule("popCap").default,
    structureCap: rule("structureCap").default,
  };
}
export function validateSkirmish(value: unknown): SkirmishSetup {
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 7
  )
    throw new Error(text("ui.skirmish.load-failed"));
  const input = value as Record<string, unknown>;
  if (input.format !== 1) throw new Error(text("ui.skirmish.load-failed"));
  for (const [key, field, min, max] of [
    ["seed", text("ui.skirmish.seed"), 0, 0xffffffff],
    ...numericSettings.map((id) => [
      id,
      text(
        id === "startingCredits"
          ? "ui.skirmish.credits"
          : id === "popCap"
            ? "ui.skirmish.population"
            : "ui.skirmish.structures",
      ),
      rule(id).min,
      rule(id).max,
    ]),
  ] as const) {
    const number = input[key as string];
    if (
      typeof number !== "number" ||
      !Number.isInteger(number) ||
      number < Number(min) ||
      number > Number(max)
    )
      throw new Error(
        text("ui.skirmish.number-error", {
          field: String(field),
          min: Number(min),
          max: Number(max),
        }),
      );
  }
  if (
    input.yourSpawn === input.otherSpawn ||
    ![input.yourSpawn, input.otherSpawn].every((id) => map.spawns.some((spawn) => spawn.id === id))
  )
    throw new Error(text("ui.skirmish.spawn-error"));
  return {
    format: 1,
    seed: input.seed as number,
    yourSpawn: input.yourSpawn as string,
    otherSpawn: input.otherSpawn as string,
    startingCredits: input.startingCredits as number,
    popCap: input.popCap as number,
    structureCap: input.structureCap as number,
  };
}

/** Quick start and the setup form assemble exactly the same normal, non-debug match. */
export function normalSkirmish(value: unknown, grid: TerrainGrid, catalog: GameplayCatalog) {
  const config = validateSkirmish(value);
  return createNormalMatchSetup({
    catalog,
    seed: config.seed,
    settings: {
      startingCredits: config.startingCredits,
      popCap: config.popCap,
      structureCap: config.structureCap,
      fog: "standard",
    },
    mapSupport: { start: map.start as "faction", players: map.players },
    map: {
      id: `core.${map.id}`,
      terrain: {
        width: grid.width,
        height: grid.height,
        level: [...grid.level],
        ramp: [...grid.ramp],
        surface: [...grid.surface],
        water: [...grid.water],
        biome: [...grid.biome],
      },
      spawns: map.spawns.map((spawn) => ({
        id: spawn.id,
        position: [
          Math.round((spawn.position[0] as number) * 1024),
          Math.round((spawn.position[1] as number) * 1024),
        ] as const,
        facing: Math.round((spawn.facing * 65536) / 360) & 0xffff,
      })),
      resources: toMatchResources(map.resources),
      objects: [],
    },
    forces: [
      { index: 0, faction: `core.${faction.id}`, spawn: config.yourSpawn, team: 0 },
      { index: 1, faction: `core.${faction.id}`, spawn: config.otherSpawn, team: 1 },
    ],
    seats: [1, 2],
    bots: [{ seat: 2, kind: "basic-skirmish", force: 1 }],
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["unit.orders", "economy.build", "production.queue", "surrender"],
      grantedAtTick: 0,
    })),
  });
}
