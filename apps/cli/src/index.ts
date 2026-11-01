#!/usr/bin/env bun
// open-neo-rts CLI: tools that run without graphics. Usage: bun neo <command> [args]

import { generateSchemas } from "./commands/generate-schemas";
import { makePlaceholders } from "./commands/make-placeholders";
import { validateAssets } from "./commands/validate-assets";
import { validateContent } from "./commands/validate-content";

type Command = { summary: string; run: (args: string[]) => Promise<number> };

const commands: Record<string, Command> = {
  validate: {
    summary: "Run every content and asset check (what CI runs)",
    run: async (args) => {
      const results = [
        await generateSchemas(["--check"]),
        await validateContent(args),
        await validateAssets(args),
      ];
      return results.some((r) => r !== 0) ? 1 : 0;
    },
  },
  "validate-content": {
    summary: "Check packs: manifests, schemas, IDs, references, locales, models vs definitions",
    run: validateContent,
  },
  "validate-assets": {
    summary: "Check asset files: glTF validity, model conventions, provenance",
    run: validateAssets,
  },
  "make-placeholders": {
    summary:
      "Generate block-model GLBs, wrecks and icons for definitions without art (default pack: dev)",
    run: makePlaceholders,
  },
  "generate-schemas": {
    summary: "Write content/schemas from packages/content (--check: fail if stale)",
    run: generateSchemas,
  },
};

const [name, ...args] = process.argv.slice(2);
const command = name ? commands[name] : undefined;
if (!command) {
  console.log("Usage: bun neo <command> [args]\n\nCommands:");
  for (const [key, c] of Object.entries(commands)) console.log(`  ${key.padEnd(18)} ${c.summary}`);
  process.exit(name && name !== "help" ? 1 : 0);
}
process.exit(await command.run(args));
