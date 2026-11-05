import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import soldier from "../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json" with {
  type: "json",
};
import {
  createMatch,
  createProjection,
  type Definition,
  type MatchSetup,
  spawnEntity,
  step,
  toDefinition,
} from "../../../packages/sim/src";
import { flatMap } from "../../../packages/sim/src/testing/maps";

function combatSnapshots(ground = false) {
  const hq: Definition = {
    id: "structure:proof/headquarters",
    role: "headquarters",
    health: 1000,
    armor: "structure",
    speed: 0,
    turnRate: 0,
    footprint: [1, 1],
  };
  const worker: Definition = {
    id: "unit:proof/builder",
    role: "builder",
    health: 100,
    speed: 100,
    turnRate: 65536,
    domain: "foot",
    radiusSubcells: 128,
    ...(ground && { visionSubcells: 6 * 1024 }),
  };
  const source = toDefinition(soldier);
  const actor: Definition = {
    ...source,
    armor: "infantry",
    // Explicit flight fixture keeps playback proof independent of authored balance activation.
    weapons: [
      {
        id: "proof-bullet",
        targets: ["ground"],
        rangeSubcells: [0, 5 * 1024],
        reloadTicks: 1000,
        projectile: { kind: "bullet", speedSubcellsPerTick: 1024 },
        warheads: ground
          ? [
              {
                type: "burn",
                amountPerSecond: 5,
                durationTicks: 20,
                radiusSubcells: 2 * 1024,
                tags: ["fire"],
              },
            ]
          : [{ type: "damage", amount: 10, tags: [] }],
      },
    ],
  };
  const victim: Definition = {
    ...source,
    id: "unit:proof/victim",
    health: ground ? 100 : 10,
    weapons: [],
  };
  const map = flatMap(32);
  const setup: MatchSetup = {
    seed: 1,
    debug: false,
    map: {
      ...map,
      spawns: [
        { id: "west", position: [8 * 1024, 8 * 1024], facing: 16384 },
        { id: "east", position: [24 * 1024, 8 * 1024], facing: 16384 },
      ],
    },
    definitions: [hq, worker, actor, victim],
    forces: [0, 1].map((index) => ({ index, faction: "faction:proof" })),
    seats: [1, 2],
    grants: [
      { seat: 1, force: 0, scopes: ["unit.orders"], grantedAtTick: 0 },
      { seat: 2, force: 1, scopes: ["unit.orders"], grantedAtTick: 0 },
    ],
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: {
        startingCredits: 1000,
        popCap: 100,
        structureCap: 100,
        fog: ground ? "standard" : "off",
        highGroundMissPerMille: 0,
      },
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: index ? "east" : "west",
        start: {
          structures: [hq.id],
          units: [{ unit: worker.id, count: 1, pop: 1, role: "builder" }],
          resources: { credits: 1000 },
        },
      })),
    },
  };
  const kernel = createMatch(setup);
  const shooter = spawnEntity(kernel, 2, actor, {
    definition: actor.id,
    force: 0,
    x: 13 * 1024 + 512,
    y: 16 * 1024 + 512,
    facing: 0,
  });
  const target = spawnEntity(kernel, 3, victim, {
    definition: victim.id,
    force: 1,
    x: 17 * 1024 + 512,
    y: 16 * 1024 + 512,
    facing: 32768,
  });
  const projection = createProjection(setup, 1, "controlled");
  const take = () => {
    const snapshot = projection.snapshot(kernel);
    return {
      ...snapshot,
      entities: snapshot.entities.filter((entity) =>
        [shooter, target].includes(projection.resolve(entity.handle) ?? -1),
      ),
    };
  };
  const snapshots = [take()];
  for (let tick = 0; tick < (ground ? 30 : 6); tick++) {
    if (ground && tick === 7) kernel.world.destroy(shooter);
    if (ground && tick === 9)
      spawnEntity(kernel, 1, worker, {
        definition: worker.id,
        force: 0,
        x: 15 * 1024 + 512,
        y: 16 * 1024 + 512,
        facing: 0,
      });
    step(kernel, []);
    snapshots.push(take());
  }
  return snapshots;
}

test("real projected combat events play original clips and disposable flight, impact, damage and death with pause/repeat safety", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "One bounded WebGL combat proof");
  test.setTimeout(60000);
  const directory = mkdtempSync(resolve(tmpdir(), "neo-combat-proof-"));
  try {
    execFileSync(
      "bun",
      ["build", "apps/web/e2e/combat-proof.ts", "--target=browser", "--outdir", directory],
      { cwd: resolve(import.meta.dirname, "../../..") },
    );
    const script = readFileSync(resolve(directory, "combat-proof.js"), "utf8");
    const model = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../content/core/factions/eastern-collective/units/collective-soldier/collective-soldier.glb",
      ),
    );
    await page.route("**/combat-proof", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body style="margin:0"><canvas width="960" height="640" style="width:960px;height:640px"></canvas><script type="module" src="/combat-proof.js"></script></body></html>',
      }),
    );
    await page.route("**/combat-proof.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: script }),
    );
    await page.route("**/proof-soldier.glb", (route) =>
      route.fulfill({ contentType: "model/gltf-binary", body: model }),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 960, height: 640 });
    await page.goto("/combat-proof");
    await page.waitForFunction(() => !!Reflect.get(window, "combatProof"));
    const snapshots = combatSnapshots();
    const send = (index: number, time: number) =>
      page.evaluate(
        async ({ snapshot, time }) => {
          await Reflect.get(window, "combatProof").accept(snapshot, time);
        },
        { snapshot: snapshots[index], time },
      );
    await send(0, 0);
    await send(1, 50);
    await page.evaluate(() => Reflect.get(window, "combatProof").render(150));
    const launched = await page.evaluate(() => Reflect.get(window, "combatProof").state());
    expect(launched.clips.some((clip: { name: string }) => clip.name === "attack")).toBe(true);
    expect(launched.effects).toContain("combat round");
    await page.screenshot({ path: info.outputPath("combat-launch.png") });
    await page.evaluate(() => Reflect.get(window, "combatProof").pause());
    await send(1, 150);
    await page.evaluate(() => Reflect.get(window, "combatProof").render(1000));
    const paused = await page.evaluate(() => Reflect.get(window, "combatProof").state());
    expect(paused.clips.filter((clip: { name: string }) => clip.name === "attack")).toEqual(
      launched.clips.filter((clip: { name: string }) => clip.name === "attack"),
    );
    expect(paused.effects).toEqual(launched.effects);
    await page.evaluate(() => Reflect.get(window, "combatProof").resume());
    for (let i = 2; i <= 4; i++) await send(i, 1000 + i * 50);
    const death = snapshots.findIndex((snapshot) =>
      snapshot.combatEvents?.some((event) => event.type === "death"),
    );
    expect(death).toBeGreaterThan(0);
    for (let i = 5; i <= death; i++) await send(i, 1000 + i * 50);
    const hit = await page.evaluate(() => Reflect.get(window, "combatProof").state());
    expect(hit.clips.some((clip: { name: string }) => clip.name === "death")).toBe(true);
    expect(hit.effects).toContain("combat impact");
    expect(hit.effects).toContain("combat damage");
    expect(hit.labels).toBe(1);
    await page.evaluate(
      (time) => Reflect.get(window, "combatProof").render(time),
      1000 + death * 50 + 80,
    );
    await page.screenshot({ path: info.outputPath("combat-contact-death.png") });
    await page.evaluate(() => Reflect.get(window, "combatProof").render(5000));
    const settled = await page.evaluate(() => Reflect.get(window, "combatProof").state());
    expect(settled.effects).toEqual([]);
    expect(settled.actors).toHaveLength(1);
    const ground = combatSnapshots(true);
    expect(ground[6]?.groundFire?.cells.some(Boolean)).toBe(true);
    expect(ground[8]?.groundFire?.cells.some(Boolean)).toBe(false);
    expect(ground[10]?.groundFire?.cells.some(Boolean)).toBe(true);
    expect(ground[30]?.groundFire?.cells.some(Boolean)).toBe(false);
    await page.evaluate(() => Reflect.get(window, "combatProof").reset());
    const sendGround = (index: number, time: number) =>
      page.evaluate(
        async ({ snapshot, time }) => {
          await Reflect.get(window, "combatProof").accept(snapshot, time);
        },
        { snapshot: ground[index], time },
      );
    await sendGround(6, 5000);
    const fire = await page.evaluate(() => Reflect.get(window, "combatProof").state().groundFire);
    expect(fire.visible).toBe(true);
    expect(fire.count).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath("burning-ground.png") });
    await page.evaluate(() => Reflect.get(window, "combatProof").pause());
    await page.evaluate(() => Reflect.get(window, "combatProof").render(6000));
    expect(
      await page.evaluate(() => Reflect.get(window, "combatProof").state().groundFire),
    ).toEqual(fire);
    await page.evaluate(() => Reflect.get(window, "combatProof").resume());
    await sendGround(8, 6100);
    expect(
      (await page.evaluate(() => Reflect.get(window, "combatProof").state().groundFire)).visible,
    ).toBe(false);
    await sendGround(10, 6200);
    expect(
      (await page.evaluate(() => Reflect.get(window, "combatProof").state().groundFire)).count,
    ).toBeGreaterThan(0);
    await sendGround(30, 7200);
    expect(
      (await page.evaluate(() => Reflect.get(window, "combatProof").state().groundFire)).visible,
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => Reflect.get(window, "combatProof")?.dispose());
    rmSync(directory, { recursive: true, force: true });
  }
});
