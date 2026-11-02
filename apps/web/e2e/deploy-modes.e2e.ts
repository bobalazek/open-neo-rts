import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { parseMatchRecord, verifyMatchRecord } from "../../../packages/sim/src";
import type { start } from "./deploy-fixture";

declare global {
  interface Window {
    deployFixture: Awaited<ReturnType<typeof start>>;
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

test("authored Siege and Bunker modes work through the actual worker and HUD", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Bounded HUD integration runs in Chromium");
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://deploy-modes.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
      body:
        path === "/fixture.js"
          ? fixture
          : path === "/sim-worker.js"
            ? worker
            : '<!doctype html><title>Deploy modes</title><canvas tabindex="0"></canvas>',
    });
  });
  await page.goto("http://deploy-modes.test/");
  await page.evaluate(async (setup) => {
    const moduleUrl = "/fixture.js";
    const { start } = (await import(moduleUrl)) as typeof import("./deploy-fixture");
    window.deployFixture = await start(setup);
  }, setup);
  try {
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
