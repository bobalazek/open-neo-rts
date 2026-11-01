import { describe, expect, test } from "bun:test";
import { checkPacks, type PackInput, schemaRef } from "./check-packs";

const UNIT = "factions/eastern-collective/units/collective-soldier/unit.json";
const STRUCTURE = "factions/eastern-collective/structures/barracks-complex/structure.json";

const manifest = {
  $schema: schemaRef("manifest.json", "manifest"),
  id: "core",
  version: "0.1.0",
  engine: ">=0.1.0",
  name: "Core",
  description: "Test pack",
  dependencies: {},
  files: { units: [UNIT], structures: [STRUCTURE] },
};

const rifle = {
  id: "rifle",
  targets: ["ground"],
  range: [0, 5],
  reload: 1,
  projectile: { kind: "instant" },
  warheads: [{ type: "damage", amount: 10, versus: { heavy: 10 } }],
};

const unit = (sockets: string[], extra: Record<string, unknown> = {}) => ({
  $schema: schemaRef(UNIT, "unit"),
  id: "unit:eastern-collective/collective-soldier",
  name: "Collective Soldier",
  description: "Standard infantry.",
  role: "combat",
  family: "infantry",
  cost: { credits: 100 },
  buildTime: 4,
  producedBy: ["structure:eastern-collective/barracks-complex"],
  health: 100,
  armor: "infantry",
  movement: { domain: "foot", speed: 1.5 },
  radius: 0.25,
  vision: 7,
  pop: 1,
  weapons: [rifle],
  presentation: { model: "collective-soldier.glb", materials: {}, sockets },
  ...extra,
});

const structure = {
  $schema: schemaRef(STRUCTURE, "structure"),
  id: "structure:eastern-collective/barracks-complex",
  name: "Barracks Complex",
  description: "Trains infantry.",
  role: "production",
  cost: { credits: 500 },
  buildTime: 10,
  health: 1400,
  armor: "structure",
  footprint: [3, 2],
  power: -10,
  vision: 6,
  presentation: { model: "barracks-complex.glb", materials: {} },
};

function pack(overrides: Record<string, unknown> = {}): PackInput {
  const json = new Map<string, unknown>([
    ["manifest.json", manifest],
    [UNIT, unit(["socket_muzzle"])],
    [STRUCTURE, structure],
  ]);
  for (const [k, v] of Object.entries(overrides)) json.set(k, v);
  return { id: "core", files: [...json.keys()], json };
}

const FACTION = "factions/eastern-collective/faction.json";
const HQ = "factions/eastern-collective/structures/command-center/structure.json";
const BUILDER = "factions/eastern-collective/units/field-technician/unit.json";
const HQ_ID = "structure:eastern-collective/command-center";

function factionPack(hqRole = "headquarters", builderAt = HQ_ID): PackInput {
  return pack({
    "manifest.json": {
      ...manifest,
      files: { factions: [FACTION], units: [UNIT, BUILDER], structures: [STRUCTURE, HQ] },
    },
    [FACTION]: {
      $schema: schemaRef(FACTION, "faction"),
      id: "faction:eastern-collective",
      name: "Eastern Collective",
      description: "Test faction.",
      color: "#d8443a",
      start: { structures: [HQ_ID], units: [], resources: { credits: 5000 } },
      ai: { personality: "test" },
    },
    [HQ]: { ...structure, $schema: schemaRef(HQ, "structure"), id: HQ_ID, role: hqRole },
    [BUILDER]: unit(["socket_muzzle"], {
      $schema: schemaRef(BUILDER, "unit"),
      id: "unit:eastern-collective/field-technician",
      role: "builder",
      producedBy: [builderAt],
    }),
  });
}

const MAP = "maps/test-map/map.json";

function mapPack(extra: Record<string, unknown> = {}, layers = new Map<string, Uint8Array>()) {
  const p = pack({
    "manifest.json": { ...manifest, files: { ...manifest.files, maps: [MAP] } },
    [MAP]: {
      $schema: schemaRef(MAP, "map"),
      id: "map:test-map",
      name: "Test Map",
      description: "A small test map.",
      size: { width: 32, height: 32 },
      biome: "temperate",
      players: { min: 2, max: 2 },
      spawns: [
        { id: "west", position: [4, 16], facing: 90 },
        { id: "east", position: [28, 16], facing: 270 },
      ],
      start: "faction",
      resources: [{ kind: "ore", position: [16, 8], amount: 1000, radius: 4 }],
      objects: [
        {
          definition: "structure:eastern-collective/barracks-complex",
          position: [16, 28],
          owner: "east",
        },
      ],
      ...extra,
    },
  });
  return { ...p, layers };
}

const errors = (p: PackInput) =>
  checkPacks([p])
    .issues.filter((i) => i.level === "error")
    .map((i) => i.message);

describe("checkPacks", () => {
  test("a valid pack has no errors", () => {
    expect(errors(pack())).toEqual([]);
  });
  test("rejects JSON files the manifest doesn't list", () => {
    const p = pack({ "factions/eastern-collective/units/dragon-tank/unit.json": {} });
    expect(errors(p)).toContain("not listed in manifest.json files");
  });
  test("rejects a wrong $schema path", () => {
    expect(
      errors(pack({ [UNIT]: unit(["socket_muzzle"], { $schema: "unit.schema.json" }) }))[0],
    ).toContain("$schema must be");
  });
  test("requires the socket each weapon fires from", () => {
    expect(errors(pack({ [UNIT]: unit([]) }))).toContain(
      'weapon "rifle" fires from "socket_muzzle", which presentation.sockets doesn\'t list',
    );
  });
  test("the ID must match the folder", () => {
    expect(
      errors(pack({ [UNIT]: unit(["socket_muzzle"], { id: "unit:eastern-collective/soldier" }) })),
    ).toContain('id must be "unit:eastern-collective/collective-soldier" to match its folder');
  });
  test("reports unknown references", () => {
    const p = pack({
      [UNIT]: unit(["socket_muzzle"], { producedBy: ["structure:eastern-collective/war-factory"] }),
    });
    expect(errors(p)).toContain('unknown reference "structure:eastern-collective/war-factory"');
  });
  test("requires a role", () => {
    const { role: _, ...noRole } = unit(["socket_muzzle"]);
    expect(errors(pack({ [UNIT]: noRole }))).toContain("$.role is required");
  });
  test("cell rows must match the footprint", () => {
    const fits = { ...structure, cells: ["lll", "sss"] };
    const short = { ...structure, cells: ["lll", "ss"] };
    expect(errors(pack({ [STRUCTURE]: fits }))).toEqual([]);
    expect(errors(pack({ [STRUCTURE]: short }))).toContain(
      "cells must be 2 rows of 3 letters, matching footprint",
    );
  });
  test("a faction with one headquarters and a builder trained there is valid", () => {
    expect(errors(factionPack())).toEqual([]);
  });
  test("a faction needs exactly one headquarters", () => {
    expect(errors(factionPack("production"))).toContain(
      "needs exactly one headquarters structure, has 0",
    );
  });
  test("a faction's builder must be trained at its headquarters", () => {
    expect(
      errors(factionPack("headquarters", "structure:eastern-collective/barracks-complex")),
    ).toContain("needs a builder unit trained at its headquarters");
  });
  test("a map keeps spawns, resource fields and objects 4 cells from the edge", () => {
    expect(errors(mapPack())).toEqual([]);
    const near = mapPack({
      spawns: [
        { id: "west", position: [3, 16], facing: 90 },
        { id: "east", position: [28, 16], facing: 270 },
      ],
      resources: [{ kind: "ore", position: [16, 7], amount: 1000, radius: 4 }],
      objects: [
        {
          definition: "structure:eastern-collective/barracks-complex",
          position: [16, 29],
          owner: "neutral",
        },
      ],
    });
    expect(errors(near)).toEqual([
      'spawn "west" is closer than 4 cells to the map edge',
      "resource at [16,7] is closer than 4 cells to the map edge",
      'object "structure:eastern-collective/barracks-complex" is closer than 4 cells to the map edge',
    ]);
  });
  test("map layers must exist and be one byte per cell", () => {
    const layers = { height: "height.r8", water: "water.r8" };
    const bytes = (n: number) => new Uint8Array(n);
    expect(
      errors(mapPack({ layers }, new Map([["maps/test-map/height.r8", bytes(1024)]]))),
    ).toEqual(['layers.water "water.r8" doesn\'t exist']);
    const short = new Map([
      ["maps/test-map/height.r8", bytes(1024)],
      ["maps/test-map/water.r8", bytes(1000)],
    ]);
    expect(errors(mapPack({ layers }, short))).toEqual([
      "layers.water is 1000 bytes, expected 32 × 32 = 1024",
    ]);
  });
  test("reports terrain errors in map layers", () => {
    const height = new Uint8Array(1024);
    height[33] = 9;
    const layers = new Map([["maps/test-map/height.r8", height]]);
    expect(errors(mapPack({ layers: { height: "height.r8" } }, layers))).toEqual([
      "level above 7 at (1, 1)",
    ]);
  });
});
