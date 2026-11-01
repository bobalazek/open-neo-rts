import { describe, expect, test } from "bun:test";
import { checkPacks, type PackInput, schemaRef } from "./check-packs";

const manifest = (files: Record<string, string[]>) => ({
  $schema: schemaRef("manifest.json", "manifest"),
  id: "demo",
  version: "0.1.0",
  engine: ">=0.1.0",
  name: "pack.demo.name",
  description: "pack.demo.description",
  dependencies: {},
  files,
});

const weapon = {
  $schema: schemaRef("weapons/gun.json", "weapon"),
  id: "weapon:gun",
  damageType: "smallArms",
  damage: 10,
  range: [0, 5],
  reload: 1,
  projectile: { kind: "hitscan" },
  targets: ["ground"],
};

const unit = (sockets: string[]) => ({
  $schema: schemaRef("units/rifleman.json", "unit"),
  id: "unit:rifleman",
  name: "unit.rifleman.name",
  description: "unit.rifleman.description",
  faction: "faction:demo",
  family: "infantry",
  cost: { "resource:credits": 100 },
  buildTime: 5,
  producedBy: ["structure:barracks"],
  health: 100,
  armor: "infantry",
  movement: { domain: "foot", speed: 1.5 },
  radius: 0.25,
  vision: 7,
  pop: 1,
  weapons: ["weapon:gun"],
  presentation: {
    model: "assets/units/rifleman/rifleman.glb",
    icon: "assets/units/rifleman/rifleman.icon.png",
    materials: {},
    sockets,
  },
});

function pack(
  overrides: Partial<Record<string, unknown>> = {},
  extraFiles: string[] = [],
): PackInput {
  const json = new Map<string, unknown>([
    [
      "manifest.json",
      manifest({
        units: ["units/rifleman.json"],
        weapons: ["weapons/gun.json"],
        locales: ["locales/en.json"],
      }),
    ],
    ["units/rifleman.json", unit(["socket_muzzle"])],
    ["weapons/gun.json", weapon],
    [
      "locales/en.json",
      {
        "pack.demo.name": "Demo",
        "pack.demo.description": "Demo",
        "unit.rifleman.name": "Rifleman",
        "unit.rifleman.description": "Basic",
      },
    ],
  ]);
  for (const [k, v] of Object.entries(overrides)) json.set(k, v);
  return { id: "demo", files: [...json.keys(), ...extraFiles], json };
}

const errors = (p: PackInput) =>
  checkPacks([p])
    .issues.filter((i) => i.level === "error")
    .map((i) => i.message);

describe("checkPacks", () => {
  test("reports only unresolved references in an otherwise valid pack", () => {
    // faction:demo, structure:barracks and resource:credits aren't defined in this tiny pack
    expect(errors(pack())).toEqual([
      'unknown reference "faction:demo"',
      'unknown reference "resource:credits"',
      'unknown reference "structure:barracks"',
    ]);
  });
  test("rejects JSON files the manifest doesn't list", () => {
    const p = pack({ "units/tank.json": {} }, []);
    expect(errors(p)).toContain("not listed in manifest.json files");
  });
  test("rejects a wrong $schema path", () => {
    expect(
      errors(pack({ "weapons/gun.json": { ...weapon, $schema: "schemas/weapon.schema.json" } }))[0],
    ).toContain("$schema must be");
  });
  test("requires the socket each weapon fires from", () => {
    expect(errors(pack({ "units/rifleman.json": unit([]) }))).toContain(
      'weapon "weapon:gun" fires from "socket_muzzle", which presentation.sockets doesn\'t list',
    );
  });
  test("requires English strings for names", () => {
    const p = pack({
      "locales/en.json": { "pack.demo.name": "Demo", "pack.demo.description": "Demo" },
    });
    expect(errors(p)).toContain('name: no English string for "unit.rifleman.name"');
  });
  test("ID must match the file name", () => {
    expect(errors(pack({ "weapons/gun.json": { ...weapon, id: "weapon:cannon" } }))).toContain(
      'ID must be "weapon:gun" to match the file',
    );
  });
});
