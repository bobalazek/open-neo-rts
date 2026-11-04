import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

/** Real runtime assets/metadata, in-memory handles: tests never write the source checkout. */
export async function installEditorPack(page: Page, writable = true) {
  const root = resolve(import.meta.dirname, "../../../content/core");
  const files: { path: string; data: string }[] = [];
  function walk(folder: string) {
    for (const entry of readdirSync(resolve(root, folder), { withFileTypes: true })) {
      const path = folder + entry.name;
      if (entry.isDirectory()) walk(path + "/");
      else
        files.push({
          path,
          data: path.includes("/source/")
            ? ""
            : readFileSync(resolve(root, path)).toString("base64"),
        });
    }
  }
  walk("");
  await page.addInitScript(
    ({ files, writable }) => {
      Reflect.set(window, "editorConflictPainted", false);
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) {
        Reflect.apply(fill, this, args);
        if (args[0] === "903") Reflect.set(window, "editorConflictPainted", true);
      };
      const stored = new Map(
        files.map(({ path, data }) => [
          path,
          new File(
            [Uint8Array.from(atob(data), (letter) => letter.charCodeAt(0))],
            path.split("/").at(-1)!,
          ),
        ]),
      );
      const state = {
        files: stored,
        fail: false,
        writes: 0,
        delayPath: null as string | null,
        release: null as (() => void) | null,
      };
      Reflect.set(window, "editorFixture", state);
      const fileHandle = (path: string, child: string) => ({
        kind: "file",
        name: child,
        async getFile() {
          if (state.delayPath === path) {
            state.delayPath = null;
            await new Promise<void>((resolve) => {
              state.release = resolve;
            });
            state.release = null;
          }
          return stored.get(path)!;
        },
        async createWritable() {
          let next: string | Uint8Array<ArrayBuffer> = "";
          return {
            async write(value: string | Uint8Array<ArrayBuffer>) {
              if (state.fail) throw new Error("Test write failure");
              next = value;
            },
            async close() {
              stored.set(path, new File([next], child));
              state.writes++;
            },
            async abort() {},
          };
        },
      });
      const directory = (name: string, prefix: string): object => ({
        kind: "directory",
        name,
        async getDirectoryHandle(child: string) {
          return directory(child, prefix + child + "/");
        },
        async getFileHandle(child: string, options?: { create?: boolean }) {
          const path = prefix + child;
          if (!stored.has(path)) {
            if (!options?.create) throw new DOMException("Missing", "NotFoundError");
            stored.set(path, new File([], child));
          }
          return fileHandle(path, child);
        },
        async removeEntry(child: string) {
          stored.delete(prefix + child);
        },
        async *values() {
          const children = [
            ...new Set(
              [...stored.keys()]
                .filter((path) => path.startsWith(prefix))
                .map((path) => path.slice(prefix.length).split("/")[0]!),
            ),
          ].sort();
          for (const child of children) {
            const path = prefix + child;
            if (!stored.has(path)) yield directory(child, path + "/");
            else yield fileHandle(path, child);
          }
        },
      });
      if (writable) Reflect.set(window, "showDirectoryPicker", async () => directory("core", ""));
      else {
        Reflect.set(window, "showDirectoryPicker", undefined);
        Reflect.set(
          window,
          "editorFolderFiles",
          [...stored].map(([path, source]) => {
            const file = new File([source], source.name);
            Object.defineProperty(file, "webkitRelativePath", { value: `core/${path}` });
            return file;
          }),
        );
      }
    },
    { files, writable },
  );
}
