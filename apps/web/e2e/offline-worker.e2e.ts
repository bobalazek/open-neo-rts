import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { OfflineState } from "../../../packages/client/src/worker";
import type { MatchSetup } from "../../../packages/sim/src/match";
import { runScenario, type Scenario } from "../../../packages/sim/src/snapshots";

const app = fileURLToPath(new URL("..", import.meta.url));
const clientCode = execFileSync(
  "bun",
  ["build", "../../packages/client/src/worker/index.ts", "--target=browser"],
  { cwd: app, encoding: "utf8" },
);
const setup: MatchSetup = {
  seed: 1,
  debug: true,
  forces: [
    { index: 0, faction: "faction:eastern-collective" },
    { index: 1, faction: "faction:eastern-collective" },
  ],
  seats: [1],
  grants: [{ seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 }],
  definitions: [
    { id: "unit:eastern-collective/dragon-tank", health: 900, speed: 92, turnRate: 65536 },
  ],
};

for (const production of [false, true]) {
  test(`real offline worker: ${production ? "production bundle" : "development route"}`, async ({
    page,
  }, testInfo) => {
    const productionPort = 4321 + testInfo.workerIndex;
    expect(clientCode).not.toContain("createMatch");
    let server: ReturnType<typeof spawn> | undefined;
    if (production) {
      execFileSync("bun", ["./build.ts"], { cwd: app });
      server = spawn(
        "bun",
        [
          "-e",
          `Bun.serve({ port: ${productionPort}, fetch: req => new Response(Bun.file(new URL(req.url).pathname === "/sim-worker.js" ? "dist/sim-worker.js" : "dist/index.html")) });`,
        ],
        { cwd: app, stdio: "ignore" },
      );
    }
    try {
      await expect(async () => {
        await page.goto(`http://localhost:${production ? productionPort : 4320}`);
      }).toPass();
      const result = await page.evaluate(
        async ({ code, setup }) => {
          const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
          const { createOfflineMatch } = (await import(
            url
          )) as typeof import("../../../packages/client/src/worker");
          URL.revokeObjectURL(url);
          let state = {} as OfflineState;
          const match = createOfflineMatch((next) => {
            state = next;
          });
          await match.init({ setup, seat: 1, mode: "debug-no-fog" });
          const bad = await match.command("unit.move", { entities: ["missing"], x: 20, y: 20 });
          const spawn = match.command("debug.spawn", {
            definition: setup.definitions[0]?.id,
            force: 0,
            x: 10,
            y: 20,
            facing: 0,
          });
          await match.step();
          const spawned = await spawn;
          const handle = state.snapshot.entities[0]?.handle;
          if (!handle) throw new Error("Missing spawned entity");
          const move = match.command("unit.move", { entities: [handle], x: 1000, y: 20 });
          await match.step();
          const moved = await move;
          const enemy = match.command("debug.spawn", {
            definition: setup.definitions[0]?.id,
            force: 1,
            x: 30,
            y: 20,
            facing: 0,
          });
          await match.step();
          await enemy;
          const denied = match.command("unit.stop", {
            entities: [state.snapshot.entities[1]?.handle],
          });
          await match.step();
          const noGrant = await denied;
          const log = await match.exportLog();
          const tick = state.snapshot.tick;
          const hash = state.hash;
          await match.speed(8);
          await match.pause(false);
          await new Promise((resolve) => setTimeout(resolve, 80));
          await match.pause(true);
          const paced = state.snapshot.tick > tick;
          const pending = match
            .command("unit.stop", { entities: [handle] })
            .catch((e: Error) => e.message);
          match.dispose();
          const disposed = await pending;
          const tickAtDispose = state.snapshot.tick;
          await new Promise((resolve) => setTimeout(resolve, 70));
          const staleIgnored = state.snapshot.tick === tickAtDispose;
          const normal = createOfflineMatch((next) => {
            state = next;
          });
          const noFogGate = await normal
            .init({ setup: { ...setup, debug: false }, seat: 1, mode: "debug-no-fog" })
            .catch((e: Error) => e.message);
          const unknownSeat = await normal
            .init({ setup, seat: 99, mode: "controlled" })
            .catch((e: Error) => e.message);
          await normal.init({ setup: { ...setup, debug: false }, seat: 1, mode: "controlled" });
          const privateView = state.snapshot.entities.length === 0 && state.hash === undefined;
          const gated = await normal.command("debug.spawn", {
            definition: setup.definitions[0]?.id,
            force: 0,
            x: 10,
            y: 20,
            facing: 0,
          });
          normal.dispose();
          return {
            noFogGate,
            unknownSeat,
            bad,
            spawned,
            moved,
            noGrant,
            log,
            tick,
            hash,
            paced,
            disposed,
            staleIgnored,
            privateView,
            gated,
          };
        },
        { code: clientCode, setup },
      );
      expect(result).toMatchObject({
        noFogGate: "No-fog requires debug mode",
        unknownSeat: "Unknown player seat",
        bad: "bad_payload",
        spawned: "accepted",
        moved: "accepted",
        noGrant: "no_grant",
        paced: true,
        disposed: "Match disposed",
        staleIgnored: true,
        privateView: true,
        gated: "debug_only",
      });
      expect(runScenario(result.log as Scenario, { ticks: result.tick }).at(-1)?.hash).toBe(
        result.hash,
      );
    } finally {
      server?.kill();
    }
  });
}

test("a throwing projection consumer cannot strand a worker acknowledgement", async ({ page }) => {
  let workerRequests = 0;
  await page.route("**/sim-worker.js", async (route) => {
    workerRequests++;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("http://localhost:4320");
  const result = await page.evaluate(
    async ({ code, setup }) => {
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      const { createOfflineMatch } = (await import(
        url
      )) as typeof import("../../../packages/client/src/worker");
      URL.revokeObjectURL(url);
      let calls = 0;
      let tick = -1;
      let received!: () => void;
      const firstState = new Promise<void>((resolve) => {
        received = resolve;
      });
      const match = createOfflineMatch((state) => {
        tick = state.snapshot.tick;
        received();
        if (++calls === 1) throw new Error("Projection consumer failed once");
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const initialized = match.init({ setup, seat: 1, mode: "debug-no-fog" });
        await Promise.race([firstState, initialized]);
        await Promise.race([
          initialized,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Initialization acknowledgement stranded")),
              1000,
            );
          }),
        ]);
        const initializedTick = tick;
        await match.step();
        const steppedTick = tick;
        match.dispose();
        const disposed = await match.step().catch((error: Error) => error.message);
        return { initializedTick, steppedTick, calls, disposed };
      } finally {
        clearTimeout(timeout);
        match.dispose();
      }
    },
    { code: clientCode, setup },
  );
  expect(result).toMatchObject({ initializedTick: 0, steppedTick: 1, disposed: "Match disposed" });
  expect(result.calls).toBeGreaterThan(1);
  expect(errors).toEqual(["Projection consumer failed once"]);
  expect(workerRequests).toBe(1);
});
