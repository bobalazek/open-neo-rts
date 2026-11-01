#!/usr/bin/env bun
// open-neo-rts CLI: tools that run without graphics. Usage: bun neo <command> [args]

import { validateAssets } from "./commands/validate-assets";

const commands: Record<string, { summary: string; run: (args: string[]) => Promise<number> }> = {
  "validate-assets": {
    summary: "Check pack assets: glTF validity, model conventions, provenance",
    run: validateAssets,
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
