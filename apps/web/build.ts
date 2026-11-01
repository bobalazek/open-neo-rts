const results = await Promise.all([
  Bun.build({
    entrypoints: ["./index.html"],
    outdir: "./dist",
    target: "browser",
    minify: true,
    plugins: [catalogPlugin],
  }),
  Bun.build({
    entrypoints: ["../../packages/client/src/worker/entry.ts"],
    outdir: "./dist",
    target: "browser",
    minify: true,
    naming: "sim-worker.js",
  }),
]);
for (const result of results) {
  if (!result.success) throw new AggregateError(result.logs, "Client build failed");
}

import catalogPlugin from "./catalog-plugin";
