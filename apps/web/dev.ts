import index from "./index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 4320),
  development: true,
  routes: {
    "/replay-worker.js": async () => {
      const result = await Bun.build({
        entrypoints: ["../../packages/client/src/worker/replay-entry.ts"],
        target: "browser",
      });
      if (!result.success) return new Response(result.logs.join("\n"), { status: 500 });
      return new Response(result.outputs[0], { headers: { "content-type": "text/javascript" } });
    },
    "/sim-worker.js": async () => {
      const result = await Bun.build({
        entrypoints: ["../../packages/client/src/worker/entry.ts"],
        target: "browser",
      });
      if (!result.success) return new Response(result.logs.join("\n"), { status: 500 });
      return new Response(result.outputs[0], { headers: { "content-type": "text/javascript" } });
    },
    "/*": index,
  },
});
console.log(`Client: ${server.url}`);
