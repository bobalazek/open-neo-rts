import { expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import { parseScenario, SCENARIO_FORMAT, SIM_VERSION } from "@open-neo-rts/sim";
import { type EditorFile, readEditorPack } from "./definition-pack";
import { prepareDraftPlaytest } from "./playtest";

const root = resolve(import.meta.dir, "../../../../../content/core");
async function core() {
  return readEditorPack(
    "core",
    new Map<string, EditorFile>(
      [...new Bun.Glob("**/*").scanSync({ cwd: root, onlyFiles: true })].map((path) => [
        path,
        Bun.file(resolve(root, path)),
      ]),
    ),
  );
}
const path = "factions/eastern-collective/units/dragon-tank/unit.json";

test("playtests own validated unsaved definitions and models without changing the source pack", async () => {
  const pack = await core();
  const original = pack.input.json.get(path) as Record<string, unknown>;
  const draft = {
    ...structuredClone(original),
    health: 1901,
    movement: { ...(original.movement as object), speed: 3 },
  };
  const revoke = spyOn(URL, "revokeObjectURL");
  const prepared = await prepareDraftPlaytest([pack], "core", path, draft);
  try {
    const entry = prepared.catalog.find((entry) => entry.definition.id === prepared.definition)!;
    expect(entry.definition.health).toBe(1901);
    expect(entry.definition.speed).toBe(Math.round((3 * 1024) / 20));
    expect(entry.model).toStartWith("blob:");
    const bytes = new Uint8Array(await (await fetch(entry.model!)).arrayBuffer());
    expect(bytes).toEqual(
      new Uint8Array(
        await pack.files.get(path.replace("unit.json", "dragon-tank.glb"))!.arrayBuffer(),
      ),
    );
    expect((pack.input.json.get(path) as { health: number }).health).toBe(900);
    draft.health = 1;
    expect(entry.definition.health).toBe(1901);
    const scenario = parseScenario({
      format: SCENARIO_FORMAT,
      simVersion: SIM_VERSION,
      commands: [],
      setup: {
        debug: true,
        seed: 1,
        seats: [1],
        grants: [],
        forces: [{ index: 0, faction: "core.faction:eastern-collective" }],
        map: {
          id: "core.map:sandbox-flat",
          terrain: {
            width: 32,
            height: 32,
            level: new Array(1024).fill(0),
            ramp: new Array(1024).fill(0),
            surface: new Array(1024).fill(0),
            water: new Array(1024).fill(0),
            biome: new Array(1024).fill(0),
          },
          objects: [],
          spawns: [],
          resources: [],
        },
        definitions: prepared.catalog.map((entry) => entry.definition),
      },
    });
    expect(
      scenario.setup.definitions.find((definition) => definition.id === entry.definition.id)
        ?.health,
    ).toBe(1901);
    prepared.dispose();
    const revoked = revoke.mock.calls.length;
    expect(revoked).toBeGreaterThan(100);
    prepared.dispose();
    expect(revoke.mock.calls).toHaveLength(revoked);
  } finally {
    prepared.dispose();
    revoke.mockRestore();
  }
}, 20000);

test("invalid drafts create no asset URLs and suitable water/node maps use authored terrain", async () => {
  const pack = await core();
  const create = spyOn(URL, "createObjectURL");
  try {
    const original = pack.input.json.get(path) as object;
    await expect(
      prepareDraftPlaytest([pack], "core", path, { ...original, health: -1 }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    for (const [file, map] of [
      ["factions/eastern-collective/structures/shipyard/structure.json", "core.map:sandbox-water"],
      ["neutral/structures/resource-extractor/structure.json", "core.map:sandbox-resources"],
    ] as const) {
      const prepared = await prepareDraftPlaytest([pack], "core", file, pack.input.json.get(file));
      try {
        expect(prepared.initial.map).toBe(map);
      } finally {
        prepared.dispose();
      }
    }
  } finally {
    create.mockRestore();
  }
}, 20000);
