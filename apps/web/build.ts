const results = await Promise.all([
  Bun.build({
    entrypoints: ["../../packages/client/src/worker/replay-entry.ts"],
    outdir: "./dist",
    target: "browser",
    minify: true,
    naming: "replay-worker.js",
  }),
  Bun.build({
    entrypoints: ["./index.html"],
    outdir: "./dist",
    publicPath: "/",
    target: "browser",
    minify: true,
    plugins: [catalogPlugin, normalCatalogPlugin],
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
import normalCatalogPlugin from "./normal-catalog-plugin";
