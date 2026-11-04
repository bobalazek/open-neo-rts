import { dirname, resolve } from "node:path";
import type { BunPlugin } from "bun";
import { SCHEMAS, validate } from "../../packages/content/src";

/** Manifest-driven preview registry. Full match identity is resolved with runtime bytes. */
export default {
  name: "debug-builtins",
  setup(build) {
    build.onResolve({ filter: /^virtual:debug-builtins$/ }, () => ({
      path: "debug-builtins",
      namespace: "debug-builtins",
    }));
    build.onLoad({ filter: /.*/, namespace: "debug-builtins" }, async () => {
      const root = resolve(import.meta.dir, "../../content/core");
      const manifest: unknown = await Bun.file(resolve(root, "manifest.json")).json();
      const manifestIssues = validate(SCHEMAS.manifest, manifest);
      if (manifestIssues.length)
        throw new Error(
          `manifest.json: ${manifestIssues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
        );
      const listed = (manifest as { files: Record<string, string[] | undefined> }).files;
      const files = ["units", "structures", "props"].flatMap((group) => listed[group] ?? []).sort();
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
        const content = raw as { presentation: { model: string; wreck?: string; icon?: string } };
        const urls = { model: "undefined", wreck: "undefined" };
        for (const variant of ["model", "wreck"] as const) {
          const relativeModel = content.presentation[variant];
          if (!relativeModel) continue;
          const model = resolve(dirname(path), relativeModel);
          if (await Bun.file(model).exists()) {
            // LFS pointers are deliberately unavailable art, not model bytes.
            if ((await Bun.file(model).slice(0, 4).text()) === "glTF") {
              urls[variant] = `${variant}${index}`;
              imports.push(`import ${urls[variant]} from ${JSON.stringify(model)};`);
            }
          }
        }
        let icon = "undefined";
        if (content.presentation.icon) {
          const iconPath = resolve(dirname(path), content.presentation.icon);
          if ((await Bun.file(iconPath).slice(1, 4).text()) === "PNG") {
            icon = `icon${index}`;
            imports.push(`import ${icon} from ${JSON.stringify(iconPath)};`);
          }
        }
        const sounds = (content.presentation as { sounds?: Record<string, string> }).sounds ?? {};
        const soundRefs: string[] = [];
        for (const [event, file] of Object.entries(sounds)) {
          const soundPath = resolve(dirname(path), file);
          if (
            !(await Bun.file(soundPath).exists()) ||
            (await Bun.file(soundPath).slice(0, 43).text()).startsWith(
              "version https://git-lfs.github.com/spec/v1",
            )
          )
            continue;
          const name = `sound${index}_${soundRefs.length}`;
          imports.push(`import ${name} from ${JSON.stringify(soundPath)};`);
          soundRefs.push(`${JSON.stringify(event)}:${name}`);
        }
        entries.push(
          `{raw:${JSON.stringify(raw)}, model:${urls.model}, wreck:${urls.wreck}, icon:${icon}, sounds:{${soundRefs.join(",")}}}`,
        );
      }
      return {
        contents: `${imports.join("\n")}\nexport const builtins = [${entries.join(",\n")}];`,
        loader: "js",
        resolveDir: root,
      };
    });
  },
} satisfies BunPlugin;
