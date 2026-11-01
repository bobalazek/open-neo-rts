import { dirname, resolve } from "node:path";
import type { BunPlugin } from "bun";
import { SCHEMAS, validate } from "../../packages/content/src";

/** Built-in source registry only; no pack loading or rewritten content. */
export default {
  name: "debug-builtins",
  setup(build) {
    build.onResolve({ filter: /^virtual:debug-builtins$/ }, () => ({
      path: "debug-builtins",
      namespace: "debug-builtins",
    }));
    build.onLoad({ filter: /.*/, namespace: "debug-builtins" }, async () => {
      const root = resolve(import.meta.dir, "../../content/core");
      const files = Array.from(
        new Bun.Glob("**/{unit,structure,prop}.json").scanSync({ cwd: root }),
      ).sort();
      const imports: string[] = [];
      const entries: string[] = [];
      for (const [index, relative] of files.entries()) {
        const path = resolve(root, relative);
        const raw: unknown = await Bun.file(path).json();
        const kind = relative.split("/").at(-1)?.replace(".json", "") as
          | "unit"
          | "structure"
          | "prop";
        const issues = validate(SCHEMAS[kind], raw);
        if (issues.length)
          throw new Error(
            `${relative}: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
          );
        const content = raw as { presentation: { model: string } };
        const model = resolve(dirname(path), content.presentation.model);
        let url = "undefined";
        if (await Bun.file(model).exists()) {
          // LFS pointers are deliberately unavailable art, not model bytes.
          const magic = await Bun.file(model).slice(0, 4).text();
          if (magic === "glTF") {
            url = `model${index}`;
            imports.push(`import ${url} from ${JSON.stringify(model)};`);
          }
        }
        entries.push(`{raw:${JSON.stringify(raw)}, model:${url}}`);
      }
      return {
        contents: `${imports.join("\n")}\nexport const builtins = [${entries.join(",\n")}];`,
        loader: "js",
        resolveDir: root,
      };
    });
  },
} satisfies BunPlugin;
