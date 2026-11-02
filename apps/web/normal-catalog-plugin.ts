import { resolve } from "node:path";
import type { BunPlugin } from "bun";
import { resolvePacks } from "../../packages/content/src";
import { compileGameplayCatalog } from "../../packages/sim/src";

/** File I/O stays in the web build adapter; normal setup uses the shared validated compiler. */
export default {
  name: "normal-catalog",
  setup(build) {
    build.onResolve({ filter: /^virtual:normal-catalog$/ }, () => ({
      path: "core",
      namespace: "normal-catalog",
    }));
    build.onLoad({ filter: /.*/, namespace: "normal-catalog" }, async () => {
      try {
        const root = resolve(import.meta.dir, "../../content/core");
        const files: string[] = [];
        for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true }))
          files.push(file);
        files.sort();
        const json = new Map<string, unknown>(),
          bytes = new Map<string, Uint8Array>();
        for (const file of files) {
          if (file.endsWith(".json")) json.set(file, await Bun.file(resolve(root, file)).json());
          else if (!file.includes("/source/") && !file.endsWith(".gitkeep"))
            bytes.set(
              `core/${file}`,
              new Uint8Array(await Bun.file(resolve(root, file)).arrayBuffer()),
            );
        }
        const resolved = resolvePacks([{ id: "core", files, json }], "0.1.0", { bytes });
        const catalog = compileGameplayCatalog(resolved);
        return {
          contents: `export const content = ${JSON.stringify({ catalog, error: null })};`,
          loader: "js",
        };
      } catch (error) {
        // Incomplete LFS installs still mount Home/debug and explain why normal matches are unavailable.
        return {
          contents: `export const content = ${JSON.stringify({ catalog: null, error: error instanceof Error ? error.message : "Core content unavailable" })};`,
          loader: "js",
        };
      }
    });
  },
} satisfies BunPlugin;
