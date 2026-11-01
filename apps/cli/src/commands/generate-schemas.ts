// bun neo generate-schemas [--check]: writes content/schemas/*.schema.json from packages/content. --check fails if they're stale.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCHEMAS, toJsonSchema } from "@open-neo-rts/content";

const DIR = "content/schemas";

export async function generateSchemas(args: string[]): Promise<number> {
  const check = args.includes("--check");
  let stale = 0;
  for (const file of readdirSync(DIR)) {
    if (!(file.replace(".schema.json", "") in SCHEMAS)) {
      if (check) {
        console.log(`✖ ${join(DIR, file)} has no schema definition; run bun neo generate-schemas`);
        stale++;
      } else rmSync(join(DIR, file));
    }
  }
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const file = join(DIR, `${name}.schema.json`);
    const text = `${JSON.stringify(toJsonSchema(schema, name), null, 2)}\n`;
    if (check) {
      if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
        console.log(`✖ ${file} is out of date; run bun neo generate-schemas`);
        stale++;
      }
    } else {
      writeFileSync(file, text);
    }
  }
  console.log(
    check
      ? `${Object.keys(SCHEMAS).length} schemas checked, ${stale} stale`
      : `wrote ${Object.keys(SCHEMAS).length} schemas to ${DIR}`,
  );
  return stale > 0 ? 1 : 0;
}
