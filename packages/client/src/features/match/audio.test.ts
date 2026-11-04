import { expect, test } from "bun:test";
import type { AudioPlayOptions, createAudioMixer } from "@open-neo-rts/render";
import type { SeatSnapshot } from "@open-neo-rts/sim";
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
