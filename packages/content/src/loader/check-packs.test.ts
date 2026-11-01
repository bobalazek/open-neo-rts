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
});
