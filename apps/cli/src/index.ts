#!/usr/bin/env bun
// open-neo-rts CLI: tools that run without graphics. Usage: bun neo <command> [args]

import { bench } from "./commands/bench";
import { buildModels } from "./commands/build-models";
import { generateSandboxMaps } from "./commands/generate-sandbox-maps";
import { generateSchemas } from "./commands/generate-schemas";
import { generateTextures } from "./commands/generate-textures";
import { generateTrigTable } from "./commands/generate-trig-table";
import { makePlaceholders } from "./commands/make-placeholders";
import { run } from "./commands/run";
import { validateAssets } from "./commands/validate-assets";
import { validateContent } from "./commands/validate-content";

type Command = { summary: string; run: (args: string[]) => Promise<number> };

const commands: Record<string, Command> = {
  bench: {
    summary:
      "Measure flat sim/ECS or navigation [--workload flat|navigation] [--units N] [--ticks T]",
    run: bench,
  },
  run: {
    summary:
      "Run a scenario twice [--seed N] [--ticks T] [--trace file], or --compare trace-a trace-b",
    run,
  },
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
      "Generate block-model GLBs, wrecks and icons for definitions without art (default pack: core)",
    run: makePlaceholders,
  },
  "build-models": {
    summary:
      "Build brick-model sources (source/*.bricks.json) into GLBs, wrecks, icons, assets.json",
    run: buildModels,
  },
  "generate-schemas": {
    summary: "Write content/schemas from packages/content (--check: fail if stale)",
    run: generateSchemas,
  },
  "generate-sandbox-maps": {
    summary: "Write sandbox maps (optional single map ID; training-grounds is explicit-only)",
    run: generateSandboxMaps,
  },
  "generate-textures": {
    summary:
      "Write the palette and surface detail textures to content/<pack>/textures (default: core)",
    run: generateTextures,
  },
  "generate-trig-table": {
    summary:
      "Write the sine and CORDIC tables in packages/deterministic (run once; output is committed)",
    run: generateTrigTable,
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
