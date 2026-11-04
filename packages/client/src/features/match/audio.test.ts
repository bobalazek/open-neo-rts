import { expect, test } from "bun:test";
import type { AudioPlayOptions, createAudioMixer } from "@open-neo-rts/render";
import type { PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { createMatchAudio } from "./audio";

test("match audio deduplicates ticks, refuses unseen events, revokes tails and discards paused/history work", async () => {
  const played: { source: string | AudioBuffer; options: AudioPlayOptions }[] = [];
  let stops = 0,
    disposed = false,
    retained = 0;
  const scope: ReturnType<ReturnType<typeof createAudioMixer>["scope"]> = {
    async play(source, options) {
      played.push({ source, options });
      return true;
    },
    stop() {
      stops++;
    },
    dispose() {
      disposed = true;
    },
    retain(allowed) {
      retained = played.filter((p) => allowed(p.options.position)).length;
    },
  };
  const audio = createMatchAudio(
    { scope: () => scope },
    new Map([["unit:test", { fire: "/fire.ogg", death: "/death.ogg" }]]),
  );
  const entity = {
    handle: "e1",
    definition: "unit:test",
    force: 0,
    x: 512,
    y: 512,
    facing: 0,
    health: 10,
    maxHealth: 10,
    order: null,
  };
  const snapshot = (tick: number, visible = true): SeatSnapshot => ({
    tick,
    mode: "controlled",
    entities: [entity],
    fog: [
      {
        group: 0,
        width: 2,
        height: 2,
        cells: new Uint8Array(visible ? [2, 0, 0, 0] : [1, 0, 0, 0]),
      },
    ],
    combatEvents: [{ type: "launch", entity: "e1", x: 512, y: 512 }],
  });
  audio.accept(snapshot(0), true);
  expect(played).toHaveLength(0);
  audio.accept(snapshot(1), true);
  audio.accept(snapshot(1), true);
  expect(played).toHaveLength(1);
  expect(played[0]).toEqual({
    source: "/fire.ogg",
    options: { bus: "effects", priority: 0, position: { x: 1, y: 0, z: 1 } },
  });
  audio.accept(snapshot(2, false), true);
  expect(played).toHaveLength(1);
  expect(retained).toBe(0);
  audio.accept(snapshot(3), false);
  audio.accept(snapshot(3), true);
  expect(played).toHaveLength(1);
  const death = snapshot(4);
  death.entities = [];
  death.combatEvents = [{ type: "death", entity: "e1", x: 512, y: 512 }];
  audio.accept(death, true);
  expect(played.at(-1)?.source).toBe("/death.ogg");
  audio.accept(snapshot(0), true);
  expect(stops).toBe(1);
  expect(played).toHaveLength(2);
  audio.dispose();
  expect(disposed).toBe(true);
});

test("impacts follow only continuously visible launches, including instant shots and dead shooters", () => {
  const played: { source: string | AudioBuffer; options: AudioPlayOptions }[] = [];
  const audio = createMatchAudio(
    {
      scope: () => ({
        async play(source, options) {
          played.push({ source, options });
          return true;
        },
        stop() {},
        retain() {},
        dispose() {},
      }),
    },
    new Map([["unit:test", { fire: "/fire.ogg", impact: "/impact.ogg" }]]),
  );
  const snapshot: SeatSnapshot = {
    tick: 0,
    mode: "controlled",
    entities: [
      {
        handle: "e1",
        definition: "unit:test",
        force: 0,
        x: 512,
        y: 512,
        facing: 0,
        health: 10,
        maxHealth: 10,
        order: null,
      },
    ],
    fog: [{ group: 0, width: 2, height: 1, cells: new Uint8Array([2, 0]) }],
  };
  const accept = (events: NonNullable<SeatSnapshot["combatEvents"]>, active = true) => {
    snapshot.tick++;
    snapshot.combatEvents = events;
    audio.accept(snapshot, active);
  };
  const launch = { type: "launch", handle: "p1", entity: "e1", x: 512, y: 512 } as const;
  const flight = { type: "flight", handle: "p1", x: 512, y: 512 } as const;
  const impact = { type: "impact", handle: "p1", x: 700, y: 512 } as const;
  audio.accept(snapshot, true);
  accept([launch, impact, impact]);
  expect(played.map((p) => p.source)).toEqual(["/fire.ogg", "/impact.ogg"]);
  expect(played[1]?.options).toEqual({
    bus: "effects",
    priority: 1,
    position: { x: 700 / 512, y: 0, z: 1 },
  });
  accept([launch, flight]);
  snapshot.entities = [];
  accept([flight]);
  accept([impact]);
  expect(played.at(-1)?.source).toBe("/impact.ogg");
  expect(played).toHaveLength(4);
  // The shooter is no longer known, so later launches cannot infer its definition.
  accept([launch, impact]);
  expect(played).toHaveLength(4);
  snapshot.entities = [
    {
      handle: "e1",
      definition: "unit:test",
      force: 0,
      x: 512,
      y: 512,
      facing: 0,
      health: 10,
      maxHealth: 10,
      order: null,
    },
  ];
  accept([launch]);
  accept([{ ...flight, x: 1536 }]);
  accept([impact]);
  expect(played).toHaveLength(5);
  // A visible impact whose launch was hidden gets no invented weapon identity.
  accept([{ ...launch, x: 1536 }, impact]);
  expect(played).toHaveLength(5);
  accept([launch]);
  accept([]);
  accept([impact]);
  expect(played).toHaveLength(6);
  accept([launch]);
  accept([flight], false);
  accept([impact]);
  expect(played).toHaveLength(7);
  accept([launch]);
  snapshot.tick = 0;
  audio.accept(snapshot, true);
  accept([impact]);
  expect(played).toHaveLength(8);
  accept([launch]);
  snapshot.mode = "debug-no-fog";
  accept([impact]);
  expect(played).toHaveLength(9);
  audio.dispose();
});

function workFixture() {
  const played: { source: string | AudioBuffer; owner: number; options: AudioPlayOptions }[] = [];
  const disposed: number[] = [];
  let next = 0;
  const audio = createMatchAudio(
    {
      scope() {
        const owner = next++;
        return {
          async play(source, options) {
            played.push({ source, owner, options });
            return true;
          },
          dispose() {
            disposed.push(owner);
          },
          stop() {},
          retain() {},
        };
      },
    },
    new Map<string, Record<string, string>>([
      ["truck", { harvest: "/harvest.ogg", unload: "/unload.ogg" }],
      ["builder", { build: "/build.ogg", build_complete: "/complete.ogg" }],
    ]),
  );
  return {
    audio,
    played,
    disposed,
    accept(tick: number, entities: PresentedEntity[], active = true, visible = true) {
      audio.accept(
        {
          tick,
          entities,
          mode: "controlled",
          fog: [
            { group: 0, width: 2, height: 1, cells: new Uint8Array(visible ? [2, 2] : [1, 1]) },
          ],
        },
        active,
      );
    },
  };
}
const worker = (handle: string, definition: string): PresentedEntity => ({
  handle,
  definition,
  force: 0,
  x: 512,
  y: 512,
  facing: 0,
  health: 100,
  maxHealth: 100,
  order: null,
});

test("public harvesting cues have a bounded cadence and unloading stops on stalled progress, fog and pause", () => {
  const f = workFixture();
  const truck = { ...worker("t1", "truck"), workAnimation: "harvest" as const };
  f.accept(0, [truck]);
  expect(f.played).toHaveLength(0);
  f.accept(1, [truck]);
  f.accept(1, [truck]);
  f.accept(20, [truck]);
  expect(f.played.map((p) => p.source)).toEqual(["/harvest.ogg"]);
  f.accept(21, [truck]);
  expect(f.played).toHaveLength(2);
  f.accept(22, [worker("t1", "truck")]);
  expect(f.disposed).toContain(1);
  const unload = (progress: number) => ({
    ...worker("t1", "truck"),
    workAnimation: "unload" as const,
    workProgressTicks: progress,
  });
  f.accept(23, [unload(1)]);
  f.accept(24, [unload(1)]);
  expect(f.disposed).toContain(2);
  f.accept(25, [unload(1)]);
  expect(f.played).toHaveLength(3);
  f.accept(26, [unload(2)]);
  f.accept(36, [unload(12)]);
  expect(f.played.map((p) => p.source)).toEqual([
    "/harvest.ogg",
    "/harvest.ogg",
    "/unload.ogg",
    "/unload.ogg",
    "/unload.ogg",
  ]);
  f.accept(36, [unload(12)], false);
  expect(f.disposed).toContain(3);
  f.accept(36, [unload(12)], true);
  expect(f.played).toHaveLength(5);
  f.accept(37, [truck]);
  f.accept(37, [truck], true, false);
  expect(f.disposed).toContain(4);
  f.accept(38, [], true);
  expect(f.played).toHaveLength(6);
  f.accept(39, [truck]);
  f.accept(40, [{ ...truck, disabled: true }]);
  expect(f.disposed).toContain(5);
  f.accept(60, [{ ...truck, disabled: true }]);
  expect(f.played).toHaveLength(7);
  f.accept(61, [truck]);
  expect(f.played).toHaveLength(8);
  f.audio.dispose();
  expect(f.disposed).toContain(0);
});

test("construction clicks follow actual site progress once per site and chime only on a visible completion", () => {
  const f = workFixture();
  const builder = (id: string): PresentedEntity => ({
    ...worker(id, "builder"),
    constructionOrder: { site: "s1", state: "working" },
  });
  const site = (progress: number): PresentedEntity => ({
    ...worker("s1", "structure"),
    x: 1536,
    constructionSite: true,
    construction: { completedTicks: progress, quarter: 0, totalTicks: 100, buildersWorking: 2 },
  });
  const builders = [builder("b1"), builder("b2")];
  f.accept(0, [...builders, site(0)]);
  f.accept(1, [...builders, site(1)]);
  f.accept(2, [...builders, site(2)]);
  f.accept(13, [...builders, site(13)]);
  expect(f.played.map((p) => p.source)).toEqual(["/build.ogg", "/build.ogg"]);
  expect(f.played[0]?.options.position).toEqual({ x: 3, y: 0, z: 1 });
  f.accept(14, [...builders, site(13)]);
  expect(f.disposed).toContain(1);
  f.accept(15, [...builders, site(13)]);
  expect(f.played).toHaveLength(2);
  f.accept(16, [worker("s1", "structure")]);
  f.accept(16, [worker("s1", "structure")]);
  expect(f.played.at(-1)).toMatchObject({ source: "/complete.ogg", owner: 0 });
  expect(f.played).toHaveLength(3);
  f.accept(18, [...builders, site(1)]);
  f.accept(19, []);
  expect(f.played.at(-1)?.source).toBe("/build.ogg");
  f.accept(20, [...builders, site(2)]);
  f.accept(21, [worker("s1", "structure")], true, false);
  expect(f.played.filter((p) => p.source === "/complete.ogg")).toHaveLength(1);
  f.accept(22, [...builders, site(3)]);
  f.accept(23, [worker("s1", "structure")], false);
  expect(f.played.filter((p) => p.source === "/complete.ogg")).toHaveLength(1);
  f.accept(24, [...builders, site(4)]);
  f.accept(24, [...builders, site(4)], true, false);
  f.accept(25, [worker("s1", "structure")]);
  expect(f.played.filter((p) => p.source === "/complete.ogg")).toHaveLength(1);
  f.audio.dispose();
});

test("public visible construction needs no private order/progress, deduplicates builders and revokes stopped or hidden work", () => {
  const f = workFixture();
  const builders = ["b1", "b2"].map((id) => ({
    ...worker(id, "builder"),
    force: 1,
    buildTarget: "s1",
  }));
  const site = {
    ...worker("s1", "structure"),
    force: 1,
    x: 1536,
    constructionSite: true as const,
    constructionStage: 20,
  };
  const complete = { ...worker("s1", "structure"), force: 1, x: 1536 };
  f.accept(0, [...builders, site]);
  f.accept(1, [...builders, site]);
  f.accept(1, [...builders, site]);
  f.accept(12, [...builders, site]);
  f.accept(13, [...builders, { ...site, constructionStage: 30 }]);
  expect(f.played.map((cue) => cue.source)).toEqual(["/build.ogg", "/build.ogg"]);
  expect(f.played[0]?.options.position).toEqual({ x: 3, y: 0, z: 1 });
  f.accept(14, [...builders.map(({ buildTarget: _, ...builder }) => builder), site]);
  expect(f.disposed).toContain(1);
  f.accept(15, [complete]);
  expect(f.played).toHaveLength(2);
  f.accept(16, [...builders, site]);
  f.accept(17, [complete]);
  f.accept(17, [complete]);
  expect(f.played.map((cue) => cue.source)).toEqual([
    "/build.ogg",
    "/build.ogg",
    "/build.ogg",
    "/complete.ogg",
  ]);
  f.accept(18, [...builders, site]);
  f.accept(18, [...builders, site], true, false);
  expect(f.disposed).toContain(3);
  f.accept(19, [complete]);
  expect(f.played.filter((cue) => cue.source === "/complete.ogg")).toHaveLength(1);
  f.accept(20, [...builders, site]);
  f.accept(21, [{ ...complete, force: 2 }]);
  f.accept(22, [...builders, site]);
  f.accept(23, [complete], false);
  f.accept(24, [...builders, site]);
  f.accept(24, [...builders.map(({ buildTarget: _, ...builder }) => builder), site]);
  f.accept(25, [complete]);
  expect(f.played.filter((cue) => cue.source === "/complete.ogg")).toHaveLength(1);
  f.audio.dispose();
});
