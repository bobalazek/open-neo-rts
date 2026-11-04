import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { defaultField } from "./definition-form";
import {
  checkDefinitionDraft,
  EditorConflict,
  type EditorFile,
  type EditorFileHandle,
  readEditorPack,
  safeEditorPath,
  writeDefinition,
} from "./definition-pack";

describe("definition authoring", () => {
  test("rejects an oversized pack before any file contents are read", async () => {
    let reads = 0;
    const source = {
      size: 256 * 1024 * 1024 + 1,
      async text() {
        reads++;
        return "{}";
      },
      async arrayBuffer() {
        reads++;
        return new ArrayBuffer(0);
      },
    };
    await expect(
      readEditorPack(
        "core",
        new Map([
          ["manifest.json", { ...source, size: 2 }],
          ["large.png", source],
        ]),
      ),
    ).rejects.toThrow("256 MiB");
    expect(reads).toBe(0);
  });
  test("uses actual core references, schemas, gameplay compiler and model requirements", async () => {
    const root = resolve(import.meta.dir, "../../../../../content/core");
    const files = new Map<string, EditorFile>(
      [...new Bun.Glob("**/*").scanSync({ cwd: root, onlyFiles: true })].map((path) => [
        path,
        Bun.file(resolve(root, path)),
      ]),
    );
    files.set("factions/eastern-collective/units/dragon-tank/source/ignored.json", {
      size: 300 * 1024 * 1024,
      text() {
        throw new Error("Editable source must not be read");
      },
      arrayBuffer() {
        throw new Error("Editable source must not be read");
      },
    });
    const pack = await readEditorPack("core", files);
    const path = "factions/eastern-collective/units/dragon-tank/unit.json";
    const original = pack.input.json.get(path) as Record<string, unknown>;
    expect(
      (await checkDefinitionDraft([pack], "core", path, original)).filter(
        (i) => i.level === "error",
      ),
    ).toEqual([]);
    const badReference = { ...original, producedBy: ["structure:eastern-collective/missing"] };
    expect(
      (await checkDefinitionDraft([pack], "core", path, badReference)).some((i) =>
        i.message.includes("unknown reference"),
      ),
    ).toBe(true);
    const badHealth = { ...original, health: -1 };
    expect(
      (await checkDefinitionDraft([pack], "core", path, badHealth)).some((i) =>
        i.message.includes("health"),
      ),
    ).toBe(true);
    const presentation = original.presentation as { sockets: string[] };
    const badModel = {
      ...original,
      presentation: { ...presentation, sockets: [...presentation.sockets, "socket_missingtest"] },
    };
    expect(
      (await checkDefinitionDraft([pack], "core", path, badModel)).some(
        (i) => i.level === "error" && i.message.includes("socket_missingtest"),
      ),
    ).toBe(true);
    expect(pack.input.json.get(path)).toBe(original);
    const metadata = path.replace("unit.json", "assets.json");
    const uncredited = {
      ...pack,
      input: { ...pack.input, json: new Map(pack.input.json) },
    };
    uncredited.input.json.set(metadata, { files: {} });
    expect(
      (await checkDefinitionDraft([uncredited], "core", path, original)).some(
        (issue) => issue.level === "error" && issue.message.includes("no assets.json entry"),
      ),
    ).toBe(true);
    expect(pack.input.json.get(metadata)).not.toEqual({ files: {} });
    const nested = "misc/source/runtime/";
    const withNested = new Map(files);
    withNested.set(nested + "extra.png", new File([new Uint8Array([0])], "extra.png"));
    withNested.set(
      nested + "assets.json",
      new File(
        [
          JSON.stringify({
            files: { "extra.png": { author: "Fixture author", source: "fixture.notes" } },
          }),
        ],
        "assets.json",
      ),
    );
    const nestedPack = await readEditorPack("core", withNested);
    expect(nestedPack.input.json.has(nested + "assets.json")).toBe(true);
    expect(
      (await checkDefinitionDraft([nestedPack], "core", path, original)).filter(
        (issue) => issue.level === "error",
      ),
    ).toEqual([]);
  }, 15000);

  test("checks the latest file before opening a write and aborts failed writes", async () => {
    let disk = "old",
      opened = 0,
      aborted = false,
      fail = false;
    const handle: EditorFileHandle = {
      kind: "file",
      name: "unit.json",
      async getFile() {
        return new File([disk], "unit.json");
      },
      async createWritable() {
        opened++;
        let next = disk;
        return {
          async write(value) {
            next = typeof value === "string" ? value : new TextDecoder().decode(value);
            if (fail) throw new Error("Disk full");
          },
          async close() {
            disk = next;
          },
          async abort() {
            aborted = true;
          },
        };
      },
    };
    await expect(writeDefinition(handle, "stale", "bad")).rejects.toBeInstanceOf(EditorConflict);
    expect(opened).toBe(0);
    expect(disk).toBe("old");
    fail = true;
    await expect(writeDefinition(handle, "old", "lost")).rejects.toThrow("Disk full");
    expect(aborted).toBe(true);
    expect(disk).toBe("old");
    fail = false;
    await writeDefinition(handle, "old", "saved");
    expect(disk).toBe("saved");
  });

  test("schema defaults retain required shape and paths cannot escape a pack", () => {
    expect(
      defaultField({
        type: "object",
        required: ["range"],
        properties: {
          range: { type: "array", minItems: 2, items: { type: "number", minimum: 0 } },
          optional: { type: "string" },
        },
      }),
    ).toEqual({ range: [0, 0] });
    for (const path of [
      "/secret",
      "../unit.json",
      "a/../unit.json",
      "a\\unit.json",
      "a//unit.json",
    ])
      expect(() => safeEditorPath(path)).toThrow();
    expect(safeEditorPath("factions/eastern-collective/units/dragon-tank/unit.json")).toBe(
      "factions/eastern-collective/units/dragon-tank/unit.json",
    );
  });
});
