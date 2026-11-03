import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { parseMatchRecord, type SeatSnapshot, verifyMatchRecord } from "../../../packages/sim/src";
import type { start as startConstructionProof } from "./construction-proof";
import type { start } from "./deploy-fixture";
import type { start as startDeploymentProof } from "./deployment-proof";
import type { start as startDoorProof } from "./door-proof";

declare global {
  interface Window {
    deployFixture: Awaited<ReturnType<typeof start>>;
    deploymentProof: Awaited<ReturnType<typeof startDeploymentProof>>;
    constructionProof: Awaited<ReturnType<typeof startConstructionProof>>;
    constructionSnapshots: SeatSnapshot[];
    doorProof: Awaited<ReturnType<typeof startDoorProof>>;
    doorSnapshots: SeatSnapshot[];
  }
}
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = execFileSync(
  "bun",
  [
    "-e",
    `
  import plugin from "./apps/web/normal-catalog-plugin.ts";
  const result = await Bun.build({entrypoints:["./apps/web/e2e/deploy-fixture.ts"],target:"browser",plugins:[plugin]});
  if (!result.success) throw new Error(result.logs.join("\\n"));
  process.stdout.write(await result.outputs[0].text());
`,
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
const worker = execFileSync(
  "bun",
  ["build", "packages/client/src/worker/entry.ts", "--target=browser"],
  { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
const setup = JSON.parse(
  execFileSync(
    "bun",
    [
      "-e",
      `
  import { aiMatchScenario } from "./apps/cli/src/commands/ai-vs-ai.ts";
  process.stdout.write(JSON.stringify((await aiMatchScenario(42)).setup));
`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ),
);
setup.normal.bots = [];
for (const grant of setup.grants) grant.scopes.push("unit.abilities");
for (const force of setup.normal.forces)
  force.start.units.push(
    { unit: "core.unit:eastern-collective/dragon-tank", count: 1, pop: 3, role: "combat" },
    { unit: "core.unit:eastern-collective/metamorphic-apc", count: 1, pop: 2, role: "transport" },
  );
const tank = "core.unit:eastern-collective/dragon-tank";
const apc = "core.unit:eastern-collective/metamorphic-apc";

test("the original infantry earn visible ranks and private XP from actual damage, while Off preserves baseline health and replay", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded original-catalog veterancy journey");
  test.setTimeout(90_000);
  const soldier = "core.unit:eastern-collective/collective-soldier";
  const builder = "core.unit:eastern-collective/field-technician";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://veterancy.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Unit veterancy</title><canvas tabindex="0"></canvas>',
    });
  });
  for (const enabled of [true, false]) {
    const candidate = structuredClone(setup);
    candidate.normal.settings.fog = "off";
    candidate.normal.settings.veterancy = enabled;
    candidate.normal.settings.highGroundMissPerMille = 0;
    // Isolate XP from the original HQ's defensive guns using a real granted power command.
    candidate.grants.push({ seat: 1, force: 1, scopes: ["economy.build"], grantedAtTick: 0 });
    candidate.normal.forces[0].start.units = [
      { unit: builder, count: 2, pop: 1, role: "builder" },
      { unit: soldier, count: 1, pop: 1, role: "combat" },
    ];
    candidate.normal.forces[1].start.units = [{ unit: builder, count: 1, pop: 1, role: "builder" }];
    candidate.map.spawns.find((spawn: { id: string }) => spawn.id === "south-east").position = [
      34 * 1024,
      20 * 1024,
    ];
    await page.goto(`http://veterancy.test/?enabled=${enabled}`);
    await page.evaluate(async (setup) => {
      const moduleUrl = "/fixture.js";
      const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
      window.deployFixture = await start(setup);
      const headquarters = window.deployFixture
        .state()!
        .snapshot.entities.find(
          (row) => row.force === 1 && row.definition.endsWith("/command-center"),
        )!;
      const result = await window.deployFixture.command("economy.power", {
        entity: headquarters.handle,
        enabled: 0,
      });
      if (result !== "accepted") throw new Error(`HQ shutdown failed: ${result}`);
    }, candidate);
    try {
      const approach = await page.evaluate(
        async ({ soldier, builder }) => {
          const f = window.deployFixture;
          const rows = f.state()!.snapshot.entities;
          const source = rows.find((row) => row.force === 0 && row.definition === soldier)!;
          const target = rows.find((row) => row.force === 1 && row.definition === builder)!;
          const headquarters = rows.find(
            (row) => row.force === 1 && row.definition.endsWith("/command-center"),
          )!;
          const dx = target.x - (headquarters.x + 1536),
            dy = target.y - (headquarters.y + 1536);
          const goal =
            Math.abs(dx) >= Math.abs(dy)
              ? { x: target.x + Math.sign(dx) * 3 * 1024, y: target.y }
              : { x: target.x, y: target.y + Math.sign(dy) * 3 * 1024 };
          const moved = await f.command("unit.move", { entities: [source.handle], ...goal });
          let arrived = false;
          for (let tick = 0; tick < 900; tick++) {
            const current = f
              .state()!
              .snapshot.entities.find((row) => row.handle === source.handle)!;
            if (!current)
              throw new Error(
                JSON.stringify({
                  missing: source,
                  moved,
                  tick: f.state()!.snapshot.tick,
                  rows: f.state()!.snapshot.entities.map((row) => ({
                    handle: row.handle,
                    definition: row.definition,
                    force: row.force,
                    health: row.health,
                    x: row.x,
                    y: row.y,
                  })),
                }),
              );
            if ((current.x - goal.x) ** 2 + (current.y - goal.y) ** 2 <= 256 ** 2) {
              arrived = true;
              break;
            }
            await f.step(1);
          }
          f.select([soldier]);
          f.target(builder, 1);
          return { moved, arrived, source: source.handle, target: target.handle };
        },
        { soldier, builder },
      );
      expect(approach).toMatchObject({ moved: "accepted", arrived: true });
      await page.getByRole("button", { name: "W · Attack target", exact: true }).click();
      await page.locator("canvas").click();
      await expect(page.locator("[data-result]")).toContainText("Command accepted");
      const result = await page.evaluate(async ({ source, target }) => {
        const f = window.deployFixture;
        for (
          let tick = 0;
          tick < 300 && f.state()!.snapshot.entities.some((row) => row.handle === target);
          tick++
        )
          await f.step(1);
        return {
          unit: f.state()!.snapshot.entities.find((row) => row.handle === source),
          targetAlive: f.state()!.snapshot.entities.some((row) => row.handle === target),
        };
      }, approach);
      expect(result.targetAlive).toBe(false);
      expect(result.unit).toMatchObject({
        health: enabled ? 130 : 100,
        maxHealth: enabled ? 130 : 100,
      });
      if (enabled) {
        expect(result.unit?.veterancy).toEqual({ rank: 3, xp: 409600, nextXp: 409600 });
        await expect(page.locator("[data-details]")).toContainText("Rank 3/3");
        await expect(page.locator("[data-details]")).toContainText("XP 400/400");
      } else {
        expect(result.unit?.veterancy).toBeUndefined();
        await expect(page.locator("[data-details]")).not.toContainText("Rank");
      }
      expect(
        await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
      ).toBe("accepted");
      const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
      expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
      expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    } finally {
      await page.evaluate(() => window.deployFixture.dispose());
    }
  }
  expect(errors).toEqual([]);
});

test("paid original infantry earn industrial capacity and activate the authored Force Surge through HUD and replay", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded original-catalog HUD integration");
  test.setTimeout(90_000);
  const candidate = structuredClone(setup);
  candidate.normal.settings.fog = "off";
  candidate.normal.forces[0].start.units = [
    { unit: "core.unit:eastern-collective/field-technician", count: 2, pop: 1, role: "builder" },
  ];
  const errors: string[] = [];
  const renderFixture = execFileSync(
    "bun",
    ["build", "apps/web/e2e/door-proof.ts", "--target=browser"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("http://industrial-surge.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/barracks-complex.glb")
      return route.fulfill({
        contentType: "model/gltf-binary",
        body: readFileSync(
          `${root}/content/core/factions/eastern-collective/structures/barracks-complex/barracks-complex.glb`,
        ),
      });
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/renderer.js"
            ? renderFixture
            : path === "/sim-worker.js"
              ? worker
              : '<!doctype html><title>Industrial production</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://industrial-surge.test/");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
    window.deployFixture.select(["core.structure:eastern-collective/command-center"]);
    window.doorSnapshots = [];
    const canvas = document.querySelector("canvas")!;
    canvas.width = 960;
    canvas.height = 640;
    canvas.style.width = "960px";
    canvas.style.height = "640px";
    const rendererUrl = "/renderer.js";
    const { start: render } = (await import(rendererUrl)) as typeof import("./door-proof");
    window.doorProof = await render(canvas);
  }, candidate);
  try {
    const surge = page.locator("[data-surge]");
    await expect(surge).toHaveText("Mass Production Surge");
    await expect(surge).toBeDisabled();
    await expect(surge).toHaveAttribute("title", /20 industrial capacity/i);
    const earned = await page.evaluate(async () => {
      const f = window.deployFixture;
      const barracks = "core.structure:eastern-collective/barracks-complex";
      const infantry = "core.unit:eastern-collective/collective-soldier";
      const builders = f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 0 && row.definition.endsWith("/field-technician"),
        )
        .map((row) => row.handle);
      const built = await f.command("economy.build", {
        definition: barracks,
        force: 0,
        builders,
        x: 22 * 1024,
        y: 18 * 1024,
        facing: 16384,
      });
      const producer = () =>
        f
          .state()!
          .snapshot.entities.find(
            (row) => row.force === 0 && row.definition === barracks && !row.constructionSite,
          );
      for (let tick = 0; tick < 600 && !producer(); tick++) await f.step(1);
      const handle = producer()?.handle;
      if (!handle) throw new Error("Original Barracks did not complete");
      const rally = await f.command("production.rally", {
        entity: handle,
        x: 30 * 1024 + 512,
        y: 22 * 1024 + 512,
      });
      const units = () =>
        f
          .state()!
          .snapshot.entities.filter((row) => row.force === 0 && row.definition === infantry);
      const receipts: unknown[] = [];
      window.doorSnapshots.push(structuredClone(f.state()!.snapshot));
      for (let tick = 0; tick < 1800 && units().length < 20; tick++) {
        if (receipts.length < 20 && (producer()?.production?.queue.length ?? 5) < 5)
          receipts.push(
            await f.command("production.enqueue", { entity: handle, definition: infantry }),
          );
        else await f.step(1);
        if (
          window.doorSnapshots.length === 1 &&
          f.state()!.snapshot.productionExits?.includes(handle)
        )
          window.doorSnapshots.push(structuredClone(f.state()!.snapshot));
      }
      f.select(["core.structure:eastern-collective/command-center"]);
      return {
        built,
        rally,
        receipts,
        count: units().length,
        bank: f.state()!.snapshot.banks?.find((row) => row.force === 0)?.resources,
        handle,
      };
    });
    const door = await page.evaluate(async () => {
      const proof = window.doorProof;
      const before = await proof.accept(window.doorSnapshots[0]!, 0);
      const packet = window.doorSnapshots[1]!;
      if (!packet) throw new Error("No actual producer exit observed");
      await proof.accept(packet, 50);
      return { before, exits: packet.productionExits };
    });
    await page.evaluate(() => window.doorProof.render(500));
    await page.locator("canvas").screenshot({ path: info.outputPath("door-opening.png") });
    const open = await page.evaluate(() => window.doorProof.render(1400));
    await page.locator("canvas").screenshot({ path: info.outputPath("door-open.png") });
    const closed = await page.evaluate(() => window.doorProof.render(3000));
    await page.locator("canvas").screenshot({ path: info.outputPath("door-closed.png") });
    expect(door.exits).toHaveLength(1);
    expect(open[0]!.left).toBeGreaterThan(door.before[0]!.left + 1);
    expect(closed[0]!.left).toBeCloseTo(door.before[0]!.left);
    await info.attach("door-renderer-backend", {
      body: await page.evaluate(() => window.doorProof.backend),
      contentType: "text/plain",
    });
    expect(earned.built).toBe("accepted");
    expect(earned.rally).toBe("accepted");
    expect(earned.receipts).toEqual(Array.from({ length: 20 }, () => "accepted"));
    expect(earned.count).toBe(20);
    expect(earned.bank?.credits).toBe(2500);
    expect(earned.bank?.["industrial-capacity"]).toBe(20);
    await expect(surge).toBeEnabled();
    const before = await page.evaluate(async (handle) => {
      const f = window.deployFixture;
      for (let i = 0; i < 2; i++) {
        const result = await f.command("production.enqueue", {
          entity: handle,
          definition: "core.unit:eastern-collective/collective-soldier",
        });
        if (result !== "accepted") throw new Error(`Queue failed: ${result}`);
      }
      const snapshot = f.state()!.snapshot;
      return {
        tick: snapshot.tick,
        queue: snapshot.entities.find((row) => row.handle === handle)?.production?.queue,
      };
    }, earned.handle);
    await surge.click();
    await expect(surge).toHaveAttribute("aria-pressed", "true");
    await expect(surge).toBeDisabled();
    await expect(page.locator("[data-details]")).toContainText("Production +50%");
    const active = await page.evaluate((handle) => {
      const snapshot = window.deployFixture.state()!.snapshot;
      return {
        provider: snapshot.entities.find((row) => row.productionSurge)?.productionSurge,
        bank: snapshot.banks?.find((row) => row.force === 0)?.resources,
        queue: snapshot.entities.find((row) => row.handle === handle)?.production?.queue,
      };
    }, earned.handle);
    expect(active.provider).toMatchObject({
      id: "production-surge",
      until: before.tick + 400,
      readyAt: before.tick + 2400,
      perMille: 1500,
    });
    expect(active.bank?.["industrial-capacity"]).toBe(0);
    expect(active.bank?.credits).toBe(2300);
    expect(active.queue).toHaveLength(2);
    active.queue!.forEach((item, index) => {
      const prior = before.queue![index]!;
      expect(
        (item.completedTicks - prior.completedTicks) * 1000 + item.remainder - prior.remainder,
      ).toBe(1500);
    });
    const expired = await page.evaluate(async (until) => {
      const f = window.deployFixture;
      while (f.state()!.snapshot.tick <= until) await f.step(1);
      return f.state()!.snapshot.banks?.find((row) => row.force === 0)?.resources;
    }, active.provider!.until);
    expect(expired?.["industrial-capacity"]).toBe(2);
    await expect(surge).toHaveAttribute("aria-pressed", "false");
    await expect(surge).toBeDisabled();
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.doorProof?.dispose());
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("authored Siege and Bunker modes work through the actual worker and HUD", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const errors: string[] = [];
  const renderFixture = execFileSync(
    "bun",
    ["build", "apps/web/e2e/deployment-proof.ts", "--target=browser"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://deploy-modes.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(".glb")) {
      const name = path.slice(1, -4);
      return route.fulfill({
        contentType: "model/gltf-binary",
        body: readFileSync(
          `${root}/content/core/factions/eastern-collective/units/${name}/${name}.glb`,
        ),
      });
    }
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/renderer.js"
            ? renderFixture
            : path === "/sim-worker.js"
              ? worker
              : '<!doctype html><title>Deploy modes</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://deploy-modes.test/");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
    const canvas = document.querySelector("canvas")!;
    canvas.width = 960;
    canvas.height = 640;
    canvas.style.width = "960px";
    canvas.style.height = "640px";
    const rendererUrl = "/renderer.js";
    const { start: render } = (await import(rendererUrl)) as typeof import("./deployment-proof");
    window.deploymentProof = await render(canvas, window.deployFixture.state()!.snapshot);
  }, setup);
  try {
    const packed = await page
      .locator("canvas")
      .screenshot({ path: info.outputPath("vehicles-packed.png") });
    await page.evaluate(([tank, apc]) => window.deployFixture.select([tank!, apc!]), [tank, apc]);
    const deploy = page.locator("[data-deploy]");
    await expect(deploy).toBeEnabled();
    await deploy.click();
    await expect(deploy).toHaveAttribute("aria-pressed", "true");
    await expect(deploy).toBeDisabled();
    await expect(page.locator("[data-details]")).toContainText("Siege Mode");
    await expect(page.locator("[data-details]")).toContainText("Bunker Mode");
    const deployed = await page.evaluate(() =>
      window.deployFixture
        .state()!
        .snapshot.entities.filter((entity) => entity.force === 0 && entity.deploy),
    );
    expect(deployed).toHaveLength(2);
    expect(deployed.every((entity) => entity.deploy?.active && entity.deploy.readyAt === 60)).toBe(
      true,
    );
    const stance = await page.evaluate(async () => {
      const proof = window.deploymentProof;
      await proof.accept(window.deployFixture.state()!.snapshot, 50);
      proof.render(1550);
      const partial = proof.poses();
      proof.render(3050);
      return { partial, deployed: proof.poses() };
    });
    expect(stance.partial.every((row) => row.y < 0)).toBe(true);
    expect(stance.deployed.find((row) => row.definition === tank)?.y).toBeCloseTo(-0.125);
    expect(stance.deployed.find((row) => row.definition === apc)?.y).toBeCloseTo(-0.23);
    expect(
      await page.locator("canvas").screenshot({ path: info.outputPath("vehicles-deployed.png") }),
    ).not.toEqual(packed);
    const receipts = await page.evaluate(
      async (entities) => {
        const fixture = window.deployFixture;
        return [
          await fixture.command("unit.deploy", { entities }),
          await fixture.command("unit.move", { entities, x: 32 * 1024, y: 32 * 1024 }),
          await fixture.command("unit.attackMove", { entities, x: 32 * 1024, y: 32 * 1024 }),
        ];
      },
      deployed.map((entity) => entity.handle),
    );
    expect(receipts).toEqual(["cooldown", "immobile", "immobile"]);
    await page.evaluate(() => window.deployFixture.step(60));
    const stationary = await page.evaluate(() =>
      window.deployFixture
        .state()!
        .snapshot.entities.filter((entity) => entity.force === 0 && entity.deploy),
    );
    expect(stationary.map(({ x, y }) => [x, y])).toEqual(deployed.map(({ x, y }) => [x, y]));
    await expect(deploy).toBeEnabled();
    await page.locator("canvas").focus();
    await page.keyboard.press("d");
    await expect(deploy).toHaveAttribute("aria-pressed", "false");
    await expect(deploy).toBeDisabled();
    const restored = await page.evaluate(async () => {
      const proof = window.deploymentProof;
      await proof.accept(window.deployFixture.state()!.snapshot, 3100);
      proof.render(6100);
      return proof.poses();
    });
    expect(restored.every((row) => row.y === 0)).toBe(true);
    await page.locator("canvas").screenshot({ path: info.outputPath("vehicles-repacked.png") });
    const moved = await page.evaluate(
      async (entities) => {
        const fixture = window.deployFixture;
        const before = fixture
          .state()!
          .snapshot.entities.filter((entity) => entities.includes(entity.handle));
        const target = before[0]!;
        const receipt = await fixture.command("unit.move", {
          entities,
          x: target.x + 3 * 1024,
          y: target.y,
        });
        await fixture.step(30);
        const after = fixture
          .state()!
          .snapshot.entities.filter((entity) => entities.includes(entity.handle));
        return {
          receipt,
          changed: after.some(
            (entity, i) => entity.x !== before[i]!.x || entity.y !== before[i]!.y,
          ),
        };
      },
      deployed.map((entity) => entity.handle),
    );
    expect(moved).toEqual({ receipt: "accepted", changed: true });
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(
      record.scenario.commands.filter((command) => command.type === "unit.deploy"),
    ).toHaveLength(2);
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deploymentProof?.dispose());
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("the actual APC boards the original infantry through HUD targeting and unloads with U", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded transport HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://transport.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>APC transport</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://transport.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
    window.deployFixture.select([
      "core.unit:eastern-collective/collective-soldier",
      "core.unit:eastern-collective/field-technician",
    ]);
    window.deployFixture.target("core.unit:eastern-collective/metamorphic-apc");
  }, setup);
  try {
    await page.locator("[data-load]").click();
    await expect(page.locator("canvas")).toHaveAttribute("data-command-mode", "unit.load");
    await page.locator("canvas").click();
    await expect(page.locator("[data-result]")).toHaveText(
      "Command accepted. Work and clearance may still be waiting.",
    );
    await page.evaluate(() => window.deployFixture.step(300));
    const cargo = await page.evaluate(
      () =>
        window.deployFixture
          .state()!
          .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)?.cargo,
    );
    expect(cargo?.passengers).toHaveLength(5);
    expect(cargo?.boarding).toBe(0);
    await page.evaluate((apc) => window.deployFixture.select([apc]), apc);
    await expect(page.locator("[data-details]")).toContainText("Cargo 5/5");
    await expect(page.locator("[data-unload]")).toBeEnabled();
    await page.locator("canvas").focus();
    await page.keyboard.press("u");
    await expect(page.locator("[data-unload]")).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.deployFixture
              .state()!
              .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)?.cargo
              ?.passengers.length,
        ),
      )
      .toBe(0);
    expect(
      await page.evaluate(() =>
        window.deployFixture
          .state()!
          .snapshot.entities.filter(
            (entity) =>
              entity.force === 0 &&
              [
                "core.unit:eastern-collective/collective-soldier",
                "core.unit:eastern-collective/field-technician",
              ].includes(entity.definition),
          ),
      ),
    ).toHaveLength(5);
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("the authored Rocket Trooper fires from Bunker Mode beyond the APC gun range and replays", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "Bounded original-content mounted-fire proof runs in Chromium",
  );
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const combatSetup = structuredClone(setup);
  const rocketId = "core.unit:eastern-collective/rocket-trooper";
  const rocket = combatSetup.definitions.find(
    (definition: { id: string }) => definition.id === rocketId,
  );
  combatSetup.normal.forces[0].start.units = combatSetup.normal.forces[0].start.units.filter(
    (item: { unit: string }) =>
      ["core.unit:eastern-collective/field-technician", apc].includes(item.unit),
  );
  combatSetup.normal.forces[0].start.units.push({
    unit: rocketId,
    count: 1,
    pop: rocket.pop,
    role: rocket.role,
  });
  combatSetup.normal.settings.fog = "off";
  combatSetup.normal.settings.friendlyFire = false;
  combatSetup.map.spawns.find((spawn: { id: string }) => spawn.id === "south-east").position = [
    34 * 1024,
    20 * 1024,
  ];
  await page.route("http://passenger-fire.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Bunker passenger fire</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://passenger-fire.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
    window.deployFixture.select(["core.unit:eastern-collective/rocket-trooper"]);
    window.deployFixture.target("core.unit:eastern-collective/metamorphic-apc");
  }, combatSetup);
  try {
    await page.locator("[data-load]").click();
    await page.locator("canvas").click();
    await expect(page.locator("[data-result]")).toHaveText(
      "Command accepted. Work and clearance may still be waiting.",
    );
    await page.evaluate(async () => {
      const fixture = window.deployFixture;
      for (let ticks = 0; ticks < 300; ticks++) {
        if (
          fixture
            .state()!
            .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)
            ?.cargo?.passengers.some(
              (passenger) => passenger.definition === "core.unit:eastern-collective/rocket-trooper",
            )
        )
          return;
        await fixture.step(1);
      }
      throw new Error("Rocket Trooper did not board");
    });
    const firing = await page.evaluate(async (setup) => {
      const fixture = window.deployFixture;
      const target = fixture
        .state()!
        .snapshot.entities.find(
          (entity) =>
            entity.force === 1 &&
            entity.definition === "core.structure:eastern-collective/command-center",
        )!;
      const definition = setup.definitions.find(
        (definition: { id: string }) => definition.id === target.definition,
      );
      const rotated = (((target.facing >>> 14) + 3) & 1) !== 0;
      const center = {
        x: target.x + (rotated ? definition.footprint[1] : definition.footprint[0]) * 512,
        y: target.y + (rotated ? definition.footprint[0] : definition.footprint[1]) * 512,
      };
      const candidates = [];
      for (let x = -6; x <= -4; x++)
        for (let y = -3; y <= 3; y++) {
          const point = {
            x: (Math.floor(center.x / 1024) + x) * 1024 + 512,
            y: (Math.floor(center.y / 1024) + y) * 1024 + 512,
          };
          const distance = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
          if (distance > 25 * 1024 ** 2 && distance <= 36 * 1024 ** 2)
            candidates.push({ ...point, distance });
        }
      candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
      const carrier = fixture
        .state()!
        .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)!;
      const receipt = await fixture.command("unit.move", {
        entities: [carrier.handle],
        x: candidates[0]!.x,
        y: candidates[0]!.y,
      });
      for (let ticks = 0; ticks < 400; ticks++) {
        if (
          !fixture.state()!.snapshot.entities.find((entity) => entity.handle === carrier.handle)
            ?.order
        )
          break;
        await fixture.step(1);
      }
      const arrived = fixture
        .state()!
        .snapshot.entities.find((entity) => entity.handle === carrier.handle)!;
      const otherWeaponsClear = fixture
        .state()!
        .snapshot.entities.filter(
          (entity) => entity.force === 0 && entity.handle !== carrier.handle,
        )
        .every((entity) => {
          const own = setup.definitions.find(
            (definition: { id: string }) => definition.id === entity.definition,
          );
          if (!own.weapons?.length) return true;
          const rotated = (((entity.facing >>> 14) + 3) & 1) !== 0;
          const x =
              entity.x +
              (own.footprint ? (rotated ? own.footprint[1] : own.footprint[0]) * 512 : 0),
            y =
              entity.y +
              (own.footprint ? (rotated ? own.footprint[0] : own.footprint[1]) * 512 : 0);
          return (
            (x - center.x) ** 2 + (y - center.y) ** 2 >
            Math.max(
              ...own.weapons.map((weapon: { rangeSubcells: number[] }) => weapon.rangeSubcells[1]!),
            ) **
              2
          );
        });
      return {
        receipt,
        otherWeaponsClear,
        center,
        distance: (arrived.x - center.x) ** 2 + (arrived.y - center.y) ** 2,
        target: target.handle,
        health: fixture
          .state()!
          .snapshot.entities.find((entity) => entity.handle === target.handle)!.health,
      };
    }, combatSetup);
    expect(firing.receipt).toBe("accepted");
    expect(firing.otherWeaponsClear).toBe(true);
    expect(firing.distance).toBeGreaterThan(25 * 1024 ** 2);
    expect(firing.distance).toBeLessThanOrEqual(36 * 1024 ** 2);
    await page.evaluate((apc) => window.deployFixture.select([apc]), apc);
    await page.locator("[data-deploy]").click();
    await expect(page.locator("[data-details]")).toContainText("Passenger fire on");
    await page.evaluate(() =>
      window.deployFixture.target("core.structure:eastern-collective/command-center", 1),
    );
    await page.locator("canvas").focus();
    await page.keyboard.press("w");
    await page.locator("canvas").click();
    await expect(page.locator("[data-result]")).toHaveText(
      "Command accepted. Work and clearance may still be waiting.",
    );
    const result = await page.evaluate(async ({ target, health }) => {
      const fixture = window.deployFixture;
      for (let ticks = 0; ticks < 120; ticks++) {
        const actual = fixture
          .state()!
          .snapshot.entities.find((entity) => entity.handle === target);
        if (actual && actual.health < health)
          return {
            health: actual.health,
            cargo: fixture
              .state()!
              .snapshot.entities.find((entity) => entity.force === 0 && entity.cargo)?.cargo,
            rocketVisible: fixture
              .state()!
              .snapshot.entities.some(
                (entity) =>
                  entity.force === 0 &&
                  entity.definition === "core.unit:eastern-collective/rocket-trooper",
              ),
          };
        await fixture.step(1);
      }
      throw new Error("No mounted rocket damage outside APC gun range");
    }, firing);
    expect(result.health).toBeLessThan(firing.health);
    expect(result.cargo?.firing).toBe(true);
    expect(result.cargo?.passengers[0]?.definition).toBe(rocketId);
    expect(result.rocketVisible).toBe(false);
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("the original Tesla weapon disables a Dragon Tank through the real worker and HUD", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const candidate = structuredClone(setup);
  const tesla = "core.unit:eastern-collective/tesla-trooper";
  candidate.normal.settings.fog = "off";
  candidate.normal.settings.highGroundMissPerMille = 0;
  candidate.normal.forces[0].start.units = [
    { unit: "core.unit:eastern-collective/field-technician", count: 1, pop: 1, role: "builder" },
    { unit: tank, count: 1, pop: 3, role: "combat" },
  ];
  candidate.normal.forces[1].start.units = [
    { unit: "core.unit:eastern-collective/field-technician", count: 1, pop: 1, role: "builder" },
    { unit: tesla, count: 1, pop: 1, role: "combat" },
  ];
  const east = candidate.map.spawns.find((spawn: { id: string }) => spawn.id === "south-east");
  east.position = [28 * 1024, 20 * 1024];
  // This fixture controls both sides to stage an actual original-weapon impact.
  candidate.grants.push({ seat: 1, force: 1, grantedAtTick: 0, scopes: ["unit.orders"] });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://emp-warhead.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>EMP warhead</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://emp-warhead.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
  }, candidate);
  try {
    const impact = await page.evaluate(
      async ([tank, tesla]) => {
        const f = window.deployFixture;
        const target = f
          .state()!
          .snapshot.entities.find((row) => row.force === 0 && row.definition === tank)!;
        const shooter = f
          .state()!
          .snapshot.entities.find((row) => row.force === 1 && row.definition === tesla)!;
        const receipt = await f.command("unit.move", {
          entities: [shooter.handle],
          x: target.x + 2 * 1024,
          y: target.y,
        });
        let observed = f.state()!.snapshot.entities.find((row) => row.handle === target.handle);
        for (let i = 0; i < 500 && observed && !observed.disabled; i++) {
          await f.step(1);
          observed = f.state()!.snapshot.entities.find((row) => row.handle === target.handle);
        }
        f.select([tank!]);
        return {
          receipt,
          before: target.health,
          after: observed?.health,
          disabled: observed?.disabled,
          handle: target.handle,
        };
      },
      [tank, tesla],
    );
    expect(impact.receipt).toBe("accepted");
    expect(impact.disabled).toBe(true);
    expect(impact.after).toBeLessThan(impact.before);
    await expect(page.locator("[data-details]")).toContainText("Disabled by EMP");
    const recovery = await page.evaluate(async (handle) => {
      const f = window.deployFixture;
      let elapsed = 0;
      while (
        elapsed < 21 &&
        f.state()!.snapshot.entities.find((row) => row.handle === handle)?.disabled
      ) {
        await f.step(1);
        elapsed++;
      }
      return {
        elapsed,
        disabled:
          f.state()!.snapshot.entities.find((row) => row.handle === handle)?.disabled ?? false,
      };
    }, impact.handle);
    // The first observed snapshot already includes the impact tick of its one-second EMP.
    expect(recovery.elapsed).toBe(19);
    expect(recovery.disabled).toBe(false);
    await expect(page.locator("[data-details]")).not.toContainText("Disabled by EMP");
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("the original Flame Tank delivers its authored beam and persistent burn through worker and HUD", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const candidate = structuredClone(setup),
    flame = "core.unit:eastern-collective/flame-tank";
  candidate.normal.settings.fog = "off";
  candidate.normal.settings.highGroundMissPerMille = 0;
  for (const force of candidate.normal.forces)
    force.start.units = [
      { unit: "core.unit:eastern-collective/field-technician", count: 1, pop: 1, role: "builder" },
      {
        unit: force.index === 0 ? tank : flame,
        count: 1,
        pop: force.index === 0 ? 3 : 2,
        role: "combat",
      },
    ];
  candidate.map.spawns.find((spawn: { id: string }) => spawn.id === "south-east").position = [
    28 * 1024,
    20 * 1024,
  ];
  candidate.grants.push({ seat: 1, force: 1, grantedAtTick: 0, scopes: ["unit.orders"] });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://burn-warhead.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Burn warhead</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://burn-warhead.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
  }, candidate);
  try {
    const impact = await page.evaluate(
      async ([tank, flame]) => {
        const f = window.deployFixture;
        const target = f
          .state()!
          .snapshot.entities.find((row) => row.force === 0 && row.definition === tank)!;
        const shooter = f
          .state()!
          .snapshot.entities.find((row) => row.force === 1 && row.definition === flame)!;
        const receipt = await f.command("unit.move", {
          entities: [shooter.handle],
          x: target.x + 2 * 1024,
          y: target.y,
        });
        let observed = f.state()!.snapshot.entities.find((row) => row.handle === target.handle);
        for (let i = 0; i < 500 && observed && !observed.burning; i++) {
          await f.step(1);
          observed = f.state()!.snapshot.entities.find((row) => row.handle === target.handle);
        }
        f.select([tank!]);
        return {
          receipt,
          before: target.health,
          after: observed?.health,
          burning: observed?.burning,
          target: target.handle,
          shooter: shooter.handle,
        };
      },
      [tank, flame],
    );
    expect(impact.receipt).toBe("accepted");
    expect(impact.burning).toBe(true);
    expect(impact.after).toBeLessThan(impact.before);
    await expect(page.locator("[data-details]")).toContainText("On fire");
    const remaining = await page.evaluate(async ({ target, shooter }) => {
      const f = window.deployFixture;
      const headquarters = f
        .state()!
        .snapshot.entities.find(
          (row) => row.force === 0 && row.definition.endsWith("/command-center"),
        )!;
      // An actual replacement target stops refreshing the tank's attached burn.
      const receipt = await f.command("unit.attack", {
        entities: [shooter],
        entity: headquarters.handle,
      });
      let elapsed = 0;
      while (
        elapsed < 61 &&
        f.state()!.snapshot.entities.find((row) => row.handle === target)?.burning
      ) {
        await f.step(1);
        elapsed++;
      }
      return {
        receipt,
        elapsed,
        burning:
          f.state()!.snapshot.entities.find((row) => row.handle === target)?.burning ?? false,
      };
    }, impact);
    expect(remaining).toEqual({ receipt: "accepted", elapsed: 58, burning: false });
    await expect(page.locator("[data-details]")).not.toContainText("On fire");
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.deployFixture.dispose());
  }
});

test("paid original reactors gain and lose their adjacency output through worker, HUD and replay", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const candidate = structuredClone(setup),
    reactor = "core.structure:eastern-collective/industrial-reactor";
  candidate.normal.settings.fog = "off";
  candidate.normal.forces[0].start.units = [
    { unit: "core.unit:eastern-collective/field-technician", count: 2, pop: 1, role: "builder" },
  ];
  const errors: string[] = [];
  const renderFixture = execFileSync(
    "bun",
    ["build", "apps/web/e2e/construction-proof.ts", "--target=browser"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("http://reactor-adjacency.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/industrial-reactor.glb")
      return route.fulfill({
        contentType: "model/gltf-binary",
        body: readFileSync(
          `${root}/content/core/factions/eastern-collective/structures/industrial-reactor/industrial-reactor.glb`,
        ),
      });
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/renderer.js"
            ? renderFixture
            : path === "/sim-worker.js"
              ? worker
              : '<!doctype html><title>Reactor adjacency</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://reactor-adjacency.test/");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
    window.constructionSnapshots = [];
    const canvas = document.querySelector("canvas")!;
    canvas.width = 960;
    canvas.height = 640;
    canvas.style.width = "960px";
    canvas.style.height = "640px";
    const rendererUrl = "/renderer.js";
    const { start: render } = (await import(rendererUrl)) as typeof import("./construction-proof");
    window.constructionProof = await render(canvas);
  }, candidate);
  try {
    const built = await page.evaluate(async (reactor) => {
      const f = window.deployFixture;
      const builders = f
        .state()!
        .snapshot.entities.filter(
          (row) => row.force === 0 && row.definition.endsWith("/field-technician"),
        )
        .map((row) => row.handle);
      const receipts = [],
        produced = [],
        building = [];
      for (const [index, x] of [22, 25].entries()) {
        receipts.push(
          await f.command("economy.build", {
            definition: reactor,
            force: 0,
            builders,
            x: x * 1024,
            y: 18 * 1024,
            facing: 16384,
          }),
        );
        for (
          let i = 0;
          i < 40 &&
          !f
            .state()!
            .snapshot.entities.some(
              (row) => row.force === 0 && row.definition === reactor && row.constructionSite,
            );
          i++
        )
          await f.step(1);
        f.select([reactor]);
        building.push(document.querySelector("[data-details]")?.textContent ?? "");
        window.constructionSnapshots.push(structuredClone(f.state()!.snapshot));
        for (
          let i = 0;
          i < 500 &&
          !f
            .state()!
            .snapshot.entities.some(
              (row) =>
                row.force === 0 &&
                row.definition === reactor &&
                (row.constructionStage ?? -1) >= 50,
            );
          i++
        )
          await f.step(1);
        window.constructionSnapshots.push(structuredClone(f.state()!.snapshot));
        const complete = () =>
          f
            .state()!
            .snapshot.entities.filter(
              (row) => row.force === 0 && row.definition === reactor && !row.constructionSite,
            );
        for (let i = 0; i < 500 && complete().length < index + 1; i++) await f.step(1);
        window.constructionSnapshots.push(structuredClone(f.state()!.snapshot));
        produced.push(f.state()!.snapshot.power?.find((row) => row.force === 0)?.produced);
      }
      f.select([reactor]);
      return {
        receipts,
        produced,
        building,
        reactors: f
          .state()!
          .snapshot.entities.filter((row) => row.force === 0 && row.definition === reactor),
        credits: f.state()!.snapshot.banks?.find((row) => row.force === 0)?.resources.credits,
      };
    }, reactor);
    expect(built.receipts).toEqual(["accepted", "accepted"]);
    expect(built.produced).toEqual([160, 328]);
    expect(built.building[0]).toContain("0 power");
    expect(built.building[0]).not.toContain("Brownout");
    expect(built.credits).toBe(3200);
    expect(built.reactors).toHaveLength(2);
    await info.attach("construction-renderer-backend", {
      body: await page.evaluate(() => window.constructionProof.backend),
      contentType: "text/plain",
    });
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const frame = await page.evaluate(
        (index) => window.constructionProof.accept(window.constructionSnapshots[index]!),
        i,
      );
      frames.push(frame);
      await page.locator("canvas").screenshot({ path: info.outputPath(`construction-${i}.png`) });
    }
    expect(frames[0]?.[0]).toMatchObject({ stage: 0, scaffold: true });
    expect(frames[1]?.[0]?.stage).toBeGreaterThanOrEqual(50);
    expect(frames[1]?.[0]?.plane[1]).toBe(1);
    expect(frames[2]?.[0]?.scaffold).toBe(false);
    expect(frames[2]?.[0]?.plane[1]).toBe(0);
    expect(frames[4]?.filter((row) => row.scaffold)).toHaveLength(1);
    expect(frames[4]?.filter((row) => row.plane[1] === 0)).toHaveLength(1);
    expect(frames[5]?.every((row) => !row.scaffold && row.plane[1] === 0)).toBe(true);
    expect(
      built.reactors.every(
        (row) =>
          row.power?.amount === 154 &&
          row.power.baseAmount === 140 &&
          row.power.sources?.length === 1,
      ),
    ).toBe(true);
    await expect(page.locator("[data-details]")).toContainText("154 power");
    await expect(page.locator("[data-details]")).toContainText("Base 140 · Adjacency:");
    const off = await page.evaluate(async (handle) => {
      const f = window.deployFixture;
      return {
        receipt: await f.command("economy.power", { entity: handle, enabled: 0 }),
        produced: f.state()!.snapshot.power?.find((row) => row.force === 0)?.produced,
      };
    }, built.reactors[0]!.handle);
    expect(off).toEqual({ receipt: "accepted", produced: 160 });
    await expect(page.locator("[data-details]")).not.toContainText("Adjacency:");
    await expect(page.locator("[data-details]")).toContainText("0 power");
    const restored = await page.evaluate(async (handle) => {
      const f = window.deployFixture;
      return {
        receipt: await f.command("economy.power", { entity: handle, enabled: 1 }),
        produced: f.state()!.snapshot.power?.find((row) => row.force === 0)?.produced,
      };
    }, built.reactors[0]!.handle);
    expect(restored).toEqual({ receipt: "accepted", produced: 328 });
    await expect(page.locator("[data-details]")).toContainText("Adjacency:");
    expect(
      await page.evaluate(() => window.deployFixture.command("match.surrender", { force: 0 })),
    ).toBe("accepted");
    const record = parseMatchRecord(await page.evaluate(() => window.deployFixture.record()));
    expect(verifyMatchRecord(record)).toMatchObject({ tick: record.tick, hash: record.hash });
    expect(await page.evaluate(() => window.deployFixture.errors())).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.constructionProof?.dispose());
    await page.evaluate(() => window.deployFixture.dispose());
  }
});
