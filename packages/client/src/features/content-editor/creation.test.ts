import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { definitionArchive } from "./archive";
import { prepareDefinitionClone } from "./creation";
import { writeDefinitionClone } from "./creation-write";
import {
  type EditorDirectory,
  type EditorFile,
  type EditorFileHandle,
  readEditorDirectory,
  readEditorPack,
} from "./definition-pack";

const sourcePath = "factions/eastern-collective/units/dragon-tank/unit.json";
const newPath = sourcePath.replace("/dragon-tank/", "/test-tank/");
const root = resolve(import.meta.dir, "../../../../../content/core");
// Domain checks run in Bun; actual decoding is exercised by the browser journeys.
const audio = async () => [];
function coreFiles() {
  return new Map<string, EditorFile>(
    [...new Bun.Glob("**/*").scanSync({ cwd: root, onlyFiles: true })].map((path) => [
      path,
      Bun.file(resolve(root, path)),
    ]),
  );
}

function disk(files: Map<string, EditorFile>) {
  const state = {
    fail: "",
    committedError: false,
    writes: [] as string[],
    onFailure: undefined as (() => void) | undefined,
  };
  function file(path: string): EditorFileHandle {
    return {
      kind: "file",
      name: path.split("/").at(-1)!,
      async getFile() {
        const value = files.get(path);
        if (!value) throw new DOMException("Missing", "NotFoundError");
        return value;
      },
      async createWritable() {
        let next: string | Uint8Array<ArrayBuffer> = "";
        return {
          async write(value) {
            if (state.fail === path) {
              state.onFailure?.();
              throw new Error("Disk full");
            }
            next = value;
          },
          async close() {
            files.set(path, new File([next], path.split("/").at(-1)!));
            state.writes.push(path);
            if (path === "manifest.json" && state.committedError)
              throw new Error("Lost close acknowledgement");
          },
          async abort() {},
        };
      },
    };
  }
  function directory(name: string, prefix: string): EditorDirectory {
    return {
      kind: "directory",
      name,
      async *values() {
        const children = [
          ...new Set(
            [...files.keys()]
              .filter((path) => path.startsWith(prefix))
              .map((path) => path.slice(prefix.length).split("/")[0]!),
          ),
        ].sort();
        for (const child of children)
          yield files.has(prefix + child)
            ? file(prefix + child)
            : directory(child, prefix + child + "/");
      },
      async getDirectoryHandle(child) {
        return directory(child, prefix + child + "/");
      },
      async getFileHandle(child, options) {
        const path = prefix + child;
        if (!files.has(path)) {
          if (!options?.create) throw new DOMException("Missing", "NotFoundError");
          files.set(path, new File([], child));
        }
        return file(path);
      },
      async removeEntry(child) {
        files.delete(prefix + child);
      },
    };
  }
  return { state, directory: directory("core", "") };
}

describe("new definition creation", () => {
  test("clones real authored content without changing originals, credits or editable source bytes", async () => {
    const pack = await readEditorPack("core", coreFiles());
    const original = pack.input.json.get(sourcePath);
    const plan = await prepareDefinitionClone(
      [pack],
      "core",
      sourcePath,
      "test-tank",
      "Test Tank",
      audio,
    );
    expect(plan.issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(plan.draft.id).toBe("unit:eastern-collective/test-tank");
    expect(plan.draft.name).toBe("Test Tank");
    expect(pack.input.json.get(sourcePath)).toBe(original);
    expect(pack.files.has(newPath)).toBe(false);
    const manifest = JSON.parse(new TextDecoder().decode(plan.files.get("manifest.json")));
    expect(manifest.files.units).toContain(newPath);
    const folder = sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1);
    let sources = 0;
    for (const [path, file] of pack.files) {
      if (!path.startsWith(folder) || path === sourcePath) continue;
      if (path.includes("/source/")) sources++;
      expect(plan.files.get(path.replace("/dragon-tank/", "/test-tank/"))).toEqual(
        new Uint8Array(await file.arrayBuffer()),
      );
    }
    expect(sources).toBeGreaterThan(0);
    for (const slug of ["dragon-tank", "../escape", "Test Tank", "a".repeat(97)])
      await expect(
        prepareDefinitionClone([pack], "core", sourcePath, slug, "Test", audio),
      ).rejects.toThrow();
    for (const path of ["../outside", "a\\b", "a/../b", "a:bad"])
      expect(() => definitionArchive(new Map([[path, new Uint8Array([1])]]))).toThrow();
  }, 20000);

  test("publishes the manifest last and recognizes a committed close error", async () => {
    const files = coreFiles();
    const fixture = disk(files);
    const pack = await readEditorDirectory(fixture.directory);
    const baseline = await files.get("manifest.json")!.text();
    const plan = await prepareDefinitionClone(
      [pack],
      "core",
      sourcePath,
      "test-tank",
      "Test Tank",
      audio,
    );
    fixture.state.committedError = true;
    const result = await writeDefinitionClone([pack], plan, audio);
    expect(fixture.state.writes.at(-1)).toBe("manifest.json");
    expect(result.input.json.get(newPath)).toEqual(plan.draft);
    expect(await files.get("manifest.json")!.text()).not.toBe(baseline);
    await expect(writeDefinitionClone([result], plan, audio)).rejects.toThrow();
  }, 20000);

  test("failed payload and manifest writes preserve the old pack and permit a clean retry", async () => {
    for (const failure of [newPath, "manifest.json"]) {
      const files = coreFiles();
      const fixture = disk(files);
      const pack = await readEditorDirectory(fixture.directory);
      const baseline = await files.get("manifest.json")!.text();
      const plan = await prepareDefinitionClone(
        [pack],
        "core",
        sourcePath,
        "test-tank",
        "Test Tank",
        audio,
      );
      fixture.state.fail = failure;
      await expect(writeDefinitionClone([pack], plan, audio)).rejects.toThrow("Disk full");
      expect(await files.get("manifest.json")!.text()).toBe(baseline);
      expect([...files.keys()].some((path) => path.startsWith(plan.destination))).toBe(false);
      fixture.state.fail = "";
      expect((await writeDefinitionClone([pack], plan, audio)).input.json.get(newPath)).toEqual(
        plan.draft,
      );
    }
  }, 30000);

  test("manifest and destination conflicts block writes", async () => {
    const files = coreFiles();
    const fixture = disk(files);
    const pack = await readEditorDirectory(fixture.directory);
    const plan = await prepareDefinitionClone(
      [pack],
      "core",
      sourcePath,
      "test-tank",
      "Test Tank",
      audio,
    );
    const baseline = files.get("manifest.json")!;
    files.set("manifest.json", new File(["{}"], "manifest.json"));
    await expect(writeDefinitionClone([pack], plan, audio)).rejects.toThrow("manifest changed");
    files.set("manifest.json", baseline);
    files.set(newPath, new File(["other person's draft"], "unit.json"));
    await expect(writeDefinitionClone([pack], plan, audio)).rejects.toThrow("no longer empty");
    expect(fixture.state.writes).toEqual([]);
    expect(await files.get(newPath)!.text()).toBe("other person's draft");
  }, 20000);

  test("rollback retains externally changed new files instead of deleting another draft", async () => {
    const files = coreFiles();
    const fixture = disk(files);
    const pack = await readEditorDirectory(fixture.directory);
    const plan = await prepareDefinitionClone(
      [pack],
      "core",
      sourcePath,
      "test-tank",
      "Test Tank",
      audio,
    );
    const first = [...plan.files.keys()].find((path) => path !== "manifest.json")!;
    fixture.state.fail = "manifest.json";
    fixture.state.onFailure = () => {
      files.set(first, new File(["external edit"], first.split("/").at(-1)!));
    };
    await expect(writeDefinitionClone([pack], plan, audio)).rejects.toThrow("preserved");
    expect(await files.get(first)!.text()).toBe("external edit");
    expect(await files.get("manifest.json")!.text()).toBe(plan.manifestBaseline);
  }, 20000);
});
