import { expect, test } from "bun:test";
import type { AudioPlayOptions, createAudioMixer } from "@open-neo-rts/render";
import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import lines from "../../../../../content/core/announcer/source/cues.json";
import { createMatchAnnouncer } from "./announcer";

const soldier: GameplayDefinition = {
  id: "unit:test/soldier",
  kind: "unit",
  role: "combat",
  health: 100,
  speed: 1,
  turnRate: 1,
  tags: [],
  construction: null,
  requires: [],
  producedBy: [],
  produces: [],
  builds: [],
  spawnsWith: [],
  weapons: [],
  abilities: [],
  research: [],
  adjacency: [],
};
const base: GameplayDefinition = {
  ...soldier,
  id: "structure:test/hq",
  kind: "structure",
  role: "headquarters",
  footprint: [2, 3],
};
const truck: GameplayDefinition = { ...soldier, id: "unit:test/truck", role: "harvester" };
const entity = (
  handle: string,
  definition = soldier.id,
  force = 0,
  x = 30,
  y = 30,
): PresentedEntity => ({
  handle,
  definition,
  force,
  x: x * 1024,
  y: y * 1024,
  facing: 16384,
  health: 100,
  maxHealth: 100,
  order: null,
});
function state(tick: number, entities: PresentedEntity[]): SeatSnapshot {
  return {
    tick,
    mode: "controlled",
    entities,
    victory: {
      rule: "annihilation",
      result: null,
      forces: [0, 1, 2].map((force) => ({
        force,
        team: force === 1 ? 1 : 0,
        reason: "active",
        tick: null,
      })),
    },
  };
}
function fixture(audible = true) {
  const played: AudioPlayOptions[] = [],
    subtitles: string[] = [],
    notices: string[] = [];
  let stopped = 0,
    disposed = false;
  const groups = new Map<number, string[]>();
  const scope: ReturnType<ReturnType<typeof createAudioMixer>["scope"]> = {
    async play(_source, options) {
      played.push(options);
      return audible;
    },
    stop() {
      stopped++;
    },
    dispose() {
      disposed = true;
    },
    retain() {},
    move() {
      return false;
    },
  };
  const owner = createMatchAnnouncer({
    force: 0,
    definitions: new Map([soldier, base, truck].map((item) => [item.id, item])),
    groups: (index) => groups.get(index) ?? [],
    source: "/announcer.ogg",
    lines,
    mixer: { scope: () => scope },
    subtitle: (value) => subtitles.push(value),
    notice: (value) => notices.push(value),
  });
  return {
    owner,
    played,
    subtitles,
    notices,
    groups,
    scope,
    stopCount: () => stopped,
    disposed: () => disposed,
    complete: () => played.at(-1)?.onEnded?.(),
  };
}

test("a cold first decode gets the bounded three-second start window instead of the silent-caption timeout", async () => {
  const f = fixture();
  const decoded = Promise.withResolvers<boolean>();
  f.scope.play = (_source, options) => {
    f.played.push(options);
    return decoded.promise;
  };
  const hq = entity("hq", base.id);
  f.owner.accept(state(0, [hq]), true, 0);
  const power = { ...state(1, [hq]), power: [{ force: 0, produced: 0, used: 10, brownout: true }] };
  f.owner.accept(power, true, 100);
  f.owner.frame(2200, true);
  expect(f.subtitles.at(-1)).toBe("Low power.");
  expect(f.stopCount()).toBe(0);
  decoded.resolve(true);
  await decoded.promise;
  f.complete();
  expect(f.subtitles.at(-1)).toBe("");
  f.owner.dispose();
});

test("announcer uses permitted ownership, specific attack classes and higher-priority interruption", () => {
  const f = fixture(),
    hq = entity("hq", base.id, 0, 8, 8),
    unit = entity("unit"),
    enemy = entity("enemy", soldier.id, 1);
  const hauler = entity("truck", truck.id, 0, 10, 10);
  f.owner.accept(state(0, [hq, unit, hauler, enemy]), true, 0);
  enemy.health = 1;
  f.owner.accept(state(1, [hq, unit, hauler, enemy]), true, 100);
  expect(f.played).toHaveLength(0);
  unit.health = 90;
  f.owner.accept(state(2, [hq, unit, hauler, enemy]), true, 200);
  expect(f.subtitles.at(-1)).toBe("Unit under attack.");
  const interrupted = f.played[0]!.onEnded!;
  hauler.health = 80;
  f.owner.accept(state(3, [hq, unit, hauler, enemy]), true, 300);
  expect(f.subtitles.at(-1)).toBe("Harvester under attack.");
  interrupted();
  expect(f.subtitles.at(-1)).toBe("Harvester under attack.");
  expect(f.stopCount()).toBeGreaterThan(0);
  f.complete();
  f.groups.set(2, [unit.handle]);
  unit.health = 70;
  f.owner.accept(state(4, [hq, unit, hauler, enemy]), true, 400);
  expect(f.subtitles.at(-1)).toBe("Group two under attack.");
  expect(f.played.at(-1)!.clip).toEqual({
    start: lines["group-2"].start,
    duration: lines["group-2"].duration,
  });
  f.owner.dispose();
  expect(f.disposed()).toBe(true);
});

test("area cooldowns coalesce local unit damage without suppressing a distant fight or an allied base", () => {
  const f = fixture(),
    hq = entity("hq", base.id, 0, 8, 8),
    a = entity("a"),
    b = entity("b", soldier.id, 0, 31, 30);
  const c = entity("c", soldier.id, 0, 45, 45),
    home = entity("home", soldier.id, 0, 10, 10);
  const ally = entity("ally", base.id, 2, 40, 8);
  const entities = [hq, a, b, c, home, ally];
  f.owner.accept(state(0, entities), true, 0);
  a.health = 90;
  f.owner.accept(state(1, entities), true, 100);
  f.complete();
  b.health = 90;
  home.health = 90;
  f.owner.accept(state(2, entities), true, 500);
  expect(f.played).toHaveLength(1);
  c.health = 90;
  f.owner.accept(state(3, entities), true, 600);
  f.complete();
  expect(f.played).toHaveLength(2);
  b.health = 80;
  f.owner.accept(state(4, entities), true, 20101);
  f.complete();
  expect(f.played).toHaveLength(3);
  ally.health = 50;
  f.owner.accept(state(5, entities), true, 20200);
  expect(f.subtitles.at(-1)).toBe("Ally under attack.");
  f.owner.dispose();
});

test("same-priority completion queue is bounded to two and drops speech older than three seconds", async () => {
  const f = fixture();
  const sites = [0, 1, 2, 3].map((n) => ({
    ...entity(`site${n}`, base.id, 0, 10 + n * 3, 10),
    constructionSite: true as const,
  }));
  f.owner.accept(state(0, sites), true, 0);
  f.owner.accept(
    state(
      1,
      sites.map((site) => ({ ...site, constructionSite: undefined })),
    ),
    true,
    100,
  );
  expect(f.played).toHaveLength(1);
  await Promise.resolve();
  f.owner.frame(200, true);
  f.complete();
  expect(f.played).toHaveLength(2);
  await Promise.resolve();
  f.owner.frame(4000, true);
  expect(f.played).toHaveLength(2);
  expect(f.subtitles.at(-1)).toBe("");
  expect(f.notices).toEqual(["Construction complete.", "Construction complete."]);
  f.owner.dispose();
});

test("economic warnings follow actual stall transitions and brownout, not each repeated snapshot", () => {
  for (const status of ["funds", "population"] as const) {
    const f = fixture(),
      producer = entity("hq", base.id, 0, 8, 8);
    const stalled = {
      ...producer,
      production: {
        slots: 1,
        rally: null,
        queue: [
          {
            handle: "item",
            definition: soldier.id,
            slot: null,
            state: status,
            completedTicks: 0,
            remainder: 0,
            totalTicks: 20,
            gift: false,
          },
        ],
      },
    };
    f.owner.accept(state(0, [producer]), true, 0);
    f.owner.accept(state(1, [stalled]), true, 100);
    expect(f.subtitles.at(-1)).toBe(
      status === "funds" ? "Insufficient funds." : "Population limit reached.",
    );
    f.complete();
    f.owner.accept(state(2, [stalled]), true, 40000);
    expect(f.played).toHaveLength(1);
    const power = {
      ...state(3, [stalled]),
      power: [{ force: 0, used: 10, produced: 0, brownout: true }],
    };
    f.owner.accept(power, true, 40100);
    expect(f.subtitles.at(-1)).toBe("Low power.");
    f.complete();
    f.owner.accept({ ...power, tick: 4 }, true, 80100);
    expect(f.played).toHaveLength(2);
    f.owner.dispose();
  }
});

test("pause/history/mute keep captions useful without replaying old work or inventing deaths", () => {
  const f = fixture(false),
    unit = entity("unit");
  const producer = entity("producer", base.id, 0, 8, 8);
  f.owner.accept(state(0, [unit, producer]), true, 0);
  f.owner.accept(
    { ...state(1, [unit, producer, entity("born")]), productionExits: [producer.handle] },
    false,
    100,
  );
  f.owner.accept(state(2, [unit, producer, entity("born")]), true, 200);
  expect(f.played).toHaveLength(0);
  f.owner.accept(
    { ...state(3, [unit, producer, entity("new")]), productionExits: [producer.handle] },
    true,
    300,
  );
  expect(f.subtitles.at(-1)).toBe("Unit ready.");
  f.owner.frame(400, false);
  expect(f.subtitles.at(-1)).toBe("");
  f.owner.accept(
    {
      ...state(4, []),
      combatEvents: [{ type: "death", entity: unit.handle, x: unit.x, y: unit.y }],
    },
    true,
    4000,
  );
  expect(f.subtitles.at(-1)).toBe("Unit lost.");
  f.owner.accept(state(0, [unit]), true, 4100);
  expect(f.subtitles.at(-1)).toBe("");
  f.owner.accept({ ...state(1, [unit]), mode: "debug-no-fog" }, true, 4200);
  expect(f.subtitles.at(-1)).toBe("");
  f.owner.dispose();
});

test("terminal outcome interrupts low-priority speech and does not repeat on identical snapshots", () => {
  const f = fixture();
  const producer = entity("producer", base.id);
  f.owner.accept(state(0, [producer]), true, 0);
  f.owner.accept(
    { ...state(1, [producer, entity("unit")]), productionExits: [producer.handle] },
    true,
    100,
  );
  const oldEnd = f.played[0]!.onEnded!;
  const ended = state(2, []);
  ended.victory!.result = { tick: 2, winner: 0, reason: "lastManStanding" };
  f.owner.accept(ended, true, 200);
  expect(f.subtitles.at(-1)).toBe("Victory.");
  oldEnd();
  expect(f.subtitles.at(-1)).toBe("Victory.");
  f.owner.accept(ended, true, 250);
  expect(f.played).toHaveLength(2);
  f.owner.dispose();
  f.complete();
  expect(f.subtitles.at(-1)).toBe("");
});

test("new or re-observed owned actors are not production; only observed own producer exits announce ready", () => {
  const f = fixture(),
    producer = entity("producer", base.id),
    enemy = entity("enemy", base.id, 1);
  f.owner.accept(state(0, [producer, enemy]), true, 0);
  f.owner.accept(state(1, [producer, enemy, entity("unloaded")]), true, 100);
  expect(f.played).toHaveLength(0);
  f.owner.accept({ ...state(2, [producer, enemy]), productionExits: [enemy.handle] }, true, 200);
  expect(f.played).toHaveLength(0);
  f.owner.accept({ ...state(3, [producer, enemy]), productionExits: [producer.handle] }, true, 300);
  expect(f.subtitles.at(-1)).toBe("Unit ready.");
  f.owner.dispose();
});
