import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import faction from "../../../content/core/factions/eastern-collective/faction.json" with {
  type: "json",
};
import headquarters from "../../../content/core/factions/eastern-collective/structures/command-center/structure.json" with {
  type: "json",
};
import reactor from "../../../content/core/factions/eastern-collective/structures/industrial-reactor/structure.json" with {
  type: "json",
};
import soldier from "../../../content/core/factions/eastern-collective/units/collective-soldier/unit.json" with {
  type: "json",
};
import builder from "../../../content/core/factions/eastern-collective/units/field-technician/unit.json" with {
  type: "json",
};
import truck from "../../../content/core/factions/eastern-collective/units/supply-truck/unit.json" with {
  type: "json",
};
import type { OfflineState } from "../../../packages/client/src/worker";
import {
  createMatch,
  createNormalMatchSetup,
  createProjection,
  type GameplayDefinition,
  OwnerForce,
  Template,
  toDefinition,
} from "../../../packages/sim/src";
import { flatMap } from "../../../packages/sim/src/testing/maps";

// Minimal authored startup/build catalog; full gameplay compilation is validated separately.
const definitions = [headquarters, soldier, builder, truck, reactor].map((raw) => ({
  ...toDefinition({ ...raw, id: `core.${raw.id}` }),
  kind: raw.id.startsWith("unit:") ? "unit" : "structure",
  role: raw.role,
  pop: "pop" in raw ? raw.pop : 0,
  tags: [],
  construction: raw === reactor ? { cost: reactor.cost, buildTicks: reactor.buildTime * 20 } : null,
  requires: [],
  producedBy: [],
  produces: [],
  builds: raw === builder ? [`core.${reactor.id}`] : [],
  spawnsWith: [],
  weapons: [],
  abilities: [],
  research: [],
  adjacency: [],
})) as GameplayDefinition[];
const map = {
  ...flatMap(32),
  spawns: [
    { id: "north", position: [8 * 1024, 8 * 1024] as const, facing: 0 },
    { id: "south", position: [24 * 1024, 24 * 1024] as const, facing: 0 },
  ],
  resources: [
    { kind: "ore" as const, position: [16 * 1024, 16 * 1024] as const, amount: 1000, radius: 1024 },
  ],
};
const setup = createNormalMatchSetup({
  map,
  mapSupport: { start: "faction", players: { min: 2, max: 2 } },
  seed: 42,
  catalog: {
    gameplayHash: "1234567890abcdef",
    definitions,
    factions: [
      {
        id: `core.${faction.id}`,
        start: {
          structures: faction.start.structures.map((id) => `core.${id}`),
          units: faction.start.units.map(({ unit, count }) => ({ unit: `core.${unit}`, count })),
          resources: faction.start.resources,
        },
      },
    ],
  },
  forces: [0, 1].map((index) => ({
    index,
    faction: `core.${faction.id}`,
    spawn: index ? "south" : "north",
    team: index,
  })),
  seats: [1, 2],
  grants: [0, 1].map((force) => ({
    seat: force + 1,
    force,
    scopes: ["unit.orders", "economy.build"],
    grantedAtTick: 0,
  })),
});
const build = (relative: string) =>
  execFileSync(
    "bun",
    ["build", fileURLToPath(new URL(relative, import.meta.url)), "--target=browser"],
    { encoding: "utf8" },
  );
const worker = build("../../../packages/client/src/worker/entry.ts");
const client = build("../../../packages/client/src/worker/index.ts");

test("normal worker starts the kit, constructs with builders and keeps debug gated", async ({
  page,
}) => {
  await page.route("http://normal-match.test/**", (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith("sim-worker.js")
        ? "text/javascript"
        : "text/html",
      body: route.request().url().endsWith("sim-worker.js")
        ? worker
        : "<!doctype html><title>Normal match fixture</title>",
    }),
  );
  await page.goto("http://normal-match.test/");
  const actual = await page.evaluate(
    async ({ client, setup }) => {
      const url = URL.createObjectURL(new Blob([client], { type: "text/javascript" }));
      const { createOfflineMatch } = (await import(
        url
      )) as typeof import("../../../packages/client/src/worker");
      URL.revokeObjectURL(url);
      let state: OfflineState | undefined;
      const match = createOfflineMatch((next) => {
        state = next;
      });
      try {
        const blocked = {
          ...setup,
          map: {
            ...setup.map,
            terrain: { ...setup.map.terrain, water: setup.map.terrain.water.map(() => 2) },
          },
        };
        const failed = await match.init({ setup: blocked, seat: 1, mode: "controlled" }).then(
          () => false,
          () => true,
        );
        await match.init({ setup, seat: 1, mode: "controlled" });
        const initial = state;
        const gated = await match.command("debug.spawn", {
          definition: setup.definitions[0]?.id,
          force: 0,
          x: 0,
          y: 0,
          facing: 0,
        });
        const handle = state?.snapshot.entities[0]?.handle;
        const headquarters = state?.snapshot.entities.find((entity) => entity.power);
        const toggle = match.command("economy.power", { entity: headquarters?.handle, enabled: 0 });
        const order = match.command("unit.stop", { entities: [handle] });
        await match.step();
        const result = await order;
        const toggled = await toggle;
        const builders =
          state?.snapshot.entities
            .filter(
              (entity) => entity.definition === "core.unit:eastern-collective/field-technician",
            )
            .map((entity) => entity.handle) ?? [];
        const placing = match.command("economy.build", {
          force: 0,
          definition: "core.structure:eastern-collective/industrial-reactor",
          builders,
          x: 12 * 1024,
          y: 6 * 1024,
          facing: 16384,
        });
        await match.step();
        const placed = await placing;
        const site = state?.snapshot.entities.find((entity) => entity.constructionSite);
        const paid = state?.snapshot.banks?.[0]?.resources.credits;
        const siteSupply = state?.snapshot.power?.[0]?.produced;
        const canceling = match.command("economy.cancelConstruction", { entity: site?.handle });
        await match.step();
        const canceled = await canceling;
        const refunded = state?.snapshot.banks?.[0]?.resources.credits;
        const siteGone = !state?.snapshot.entities.some((entity) => entity.constructionSite);
        const rebuilding = match.command("economy.build", {
          force: 0,
          definition: "core.structure:eastern-collective/industrial-reactor",
          builders,
          x: 12 * 1024,
          y: 6 * 1024,
          facing: 16384,
        });
        await match.step();
        const rebuilt = await rebuilding;
        let unfinished = state?.snapshot.entities.find((entity) => entity.constructionSite);
        for (let ticks = 0; ticks < 240 && !unfinished?.construction?.completedTicks; ticks++) {
          await match.step();
          unfinished = state?.snapshot.entities.find((entity) => entity.constructionSite);
        }
        const progressBeforeStop = unfinished?.construction?.completedTicks ?? 0;
        const stopping = match.command("unit.stop", { entities: builders });
        await match.step();
        const stopped = await stopping;
        const progressWhenStopped = state?.snapshot.entities.find(
          (entity) => entity.constructionSite,
        )?.construction;
        for (let ticks = 0; ticks < 10; ticks++) await match.step();
        const pausedProgress = state?.snapshot.entities.find(
          (entity) => entity.constructionSite,
        )?.construction;
        const resuming = match.command("economy.assistConstruction", {
          entity: unfinished?.handle,
          builders,
        });
        await match.step();
        const resumed = await resuming;
        for (
          let ticks = 0;
          ticks < 480 && state?.snapshot.entities.some((entity) => entity.constructionSite);
          ticks++
        )
          await match.step();
        const completed = state?.snapshot.entities.find(
          (entity) => entity.definition === "core.structure:eastern-collective/industrial-reactor",
        );
        const lateCancel = match.command("economy.cancelConstruction", {
          entity: completed?.handle,
        });
        await match.step();
        const completedCancel = await lateCancel;
        const exportGated = await match.exportLog().then(
          () => false,
          () => true,
        );
        return {
          failed,
          initial,
          gated,
          result,
          placed,
          site: !!site,
          paid,
          siteSupply,
          canceled,
          refunded,
          siteGone,
          rebuilt,
          progressBeforeStop,
          stopped,
          progressWhenStopped,
          pausedProgress,
          resumed,
          completed,
          completedCancel,
          finalCredits: state?.snapshot.banks?.[0]?.resources.credits,
          toggled,
          power: state?.snapshot.power,
          tick: state?.snapshot.tick,
          exportGated,
        };
      } finally {
        match.dispose();
      }
    },
    { client, setup },
  );
  expect(actual.failed).toBe(true);
  expect(actual.initial?.snapshot.entities).toHaveLength(7);
  expect(actual.initial?.snapshot.entities.every((entity) => entity.force === 0)).toBe(true);
  expect(actual.initial?.hash).toBeUndefined();
  expect(actual.initial?.snapshot.banks).toEqual([
    {
      force: 0,
      resources: { credits: 5000, materials: 0, "industrial-capacity": 0, "salvage-points": 0 },
    },
  ]);
  expect(actual.gated).toBe("debug_only");
  expect(actual.initial?.snapshot.power).toEqual([
    { force: 0, produced: 20, used: 0, brownout: false },
  ]);
  expect(actual.toggled).toBe("accepted");
  expect(actual.power).toEqual([{ force: 0, produced: 140, used: 0, brownout: false }]);
  expect(actual.result).toBe("accepted");
  expect(actual.placed).toBe("accepted");
  expect(actual.site).toBe(true);
  expect(actual.paid).toBe(4100);
  expect(actual.siteSupply).toBe(0);
  expect(actual.canceled).toBe("accepted");
  expect(actual.refunded).toBe(5000);
  expect(actual.siteGone).toBe(true);
  expect(actual.rebuilt).toBe("accepted");
  expect(actual.progressBeforeStop).toBeGreaterThan(0);
  expect(actual.stopped).toBe("accepted");
  expect(actual.pausedProgress?.completedTicks).toBe(actual.progressWhenStopped?.completedTicks);
  expect(actual.pausedProgress?.quarter).toBe(actual.progressWhenStopped?.quarter);
  expect(actual.resumed).toBe("accepted");
  expect(actual.completed).toBeDefined();
  expect(actual.completed?.constructionSite).toBeUndefined();
  expect(actual.completedCancel).toBe("bad_payload");
  expect(actual.finalCredits).toBe(4100);
  expect(actual.tick).toBeGreaterThan(3);
  expect(actual.exportGated).toBe(true);
  const kernel = createMatch(setup);
  expect(actual.initial?.snapshot).toEqual(
    createProjection(setup, 1, "controlled").snapshot(kernel),
  );
  expect(kernel.world.query(Template, OwnerForce)).toHaveLength(14);
});
