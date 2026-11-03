import { expect, test } from "bun:test";
import { addString, createHasher, digest } from "@open-neo-rts/deterministic";
import { OwnerForce, Template, Transform } from "../features/entities";
import { checkpointHash, step, stream } from "../kernel";
import { createMatch, type MatchSetup } from "../match";
import { flatMap } from "../testing/maps";
import { createMatchRecord, verifyMatchRecord } from "./match-record";
import {
  createMatchSnapshot,
  MAX_SNAPSHOT_TICK,
  parseMatchSnapshot,
  restoreMatchSnapshot,
} from "./match-snapshot";

function fixture(seed = 7) {
  const setup: MatchSetup = {
    seed,
    debug: false,
    map: {
      ...flatMap(48),
      spawns: [0, 1].map((i) => ({
        id: `s${i}`,
        position: [(6 + 28 * i) * 1024, 8 * 1024] as const,
        facing: 16384,
      })),
    },
    definitions: [
      {
        id: "structure:snapshot/headquarters",
        role: "headquarters",
        health: 100,
        speed: 0,
        turnRate: 0,
        footprint: [1, 1],
        visionSubcells: 1024,
      },
      {
        id: "unit:snapshot/builder",
        role: "builder",
        health: 10,
        speed: 100,
        turnRate: 65536,
        domain: "foot",
        radiusSubcells: 0,
        visionSubcells: 1024,
      },
    ],
    forces: [0, 1].map((index) => ({ index, faction: "faction:snapshot" })),
    seats: [1, 2],
    grants: [0, 1].map((force) => ({
      seat: force + 1,
      force,
      scopes: ["unit.orders", "surrender"],
      grantedAtTick: 0,
    })),
    normal: {
      gameplayHash: "1234567890abcdef",
      mapSupport: { start: "faction", players: { min: 2, max: 2 } },
      settings: { startingCredits: 100, popCap: 200, structureCap: 150 },
      bots: [{ seat: 2, kind: "idle" }],
      forces: [0, 1].map((index) => ({
        index,
        team: index,
        spawn: `s${index}`,
        start: {
          structures: ["structure:snapshot/headquarters"],
          units: [{ unit: "unit:snapshot/builder", count: 1, pop: 1, role: "builder" }],
          resources: { credits: 100 },
        },
      })),
    },
  };
  return { setup, kernel: createMatch(setup) };
}

// Recompute the public file checksum to distinguish structural validation from accidental damage.
function seal<T extends object>(value: T): T {
  const { checksum: _checksum, ...body } = value as T & { checksum?: string };
  const sorted = JSON.stringify(body, (_key, input) =>
    input && typeof input === "object" && !Array.isArray(input)
      ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : input,
  );
  const hash = createHasher();
  addString(hash, sorted);
  return { ...body, checksum: digest(hash).hex } as T;
}

test("snapshot isolates its bytes, restores queued movement/bot state/fog and retains the full terminal record", () => {
  const { setup, kernel } = fixture();
  const actor = kernel.world
    .query(Template)
    .find((id) => kernel.world.get(id, Template, "definition") === 1)!;
  step(kernel, [
    {
      tick: 0,
      seat: 1,
      sequence: 0,
      type: "unit.move",
      payload: { entities: [actor], x: 16 * 1024 + 512, y: 20 * 1024 + 512 },
    },
    {
      tick: 0,
      seat: 1,
      sequence: 1,
      type: "unit.move",
      payload: { entities: [actor], x: 20 * 1024 + 512, y: 23 * 1024 + 512, append: 1 },
    },
  ]);
  const snapshot = createMatchSnapshot(kernel, setup);
  const loaded = restoreMatchSnapshot(JSON.parse(JSON.stringify(snapshot)), setup);
  expect(checkpointHash(loaded)).toBe(checkpointHash(kernel));
  expect(loaded.orders?.rows(actor)).toHaveLength(1);
  for (let i = 0; i < 30; i++) {
    step(kernel, []);
    step(loaded, []);
    expect(checkpointHash(loaded)).toBe(checkpointHash(kernel));
  }
  expect(snapshot.tick).toBe(1);
  expect(loaded.world.get(actor, Transform, "x")).toBe(kernel.world.get(actor, Transform, "x"));
  const surrender = {
    tick: kernel.tick,
    seat: 1,
    sequence: 2,
    type: "match.surrender",
    payload: { force: 0 },
  };
  step(kernel, [surrender]);
  step(loaded, [surrender]);
  const record = createMatchRecord(loaded, setup);
  expect(record.scenario.commands).toHaveLength(3);
  expect(verifyMatchRecord(record).hash).toBe(checkpointHash(kernel));
  expect(checkpointHash(restoreMatchSnapshot(createMatchSnapshot(loaded, setup), setup))).toBe(
    checkpointHash(kernel),
  );
});

test("failed imports leave the live host untouched and reject identity, damage and forged state", () => {
  const { setup, kernel } = fixture();
  const snapshot = createMatchSnapshot(kernel, setup),
    before = checkpointHash(kernel);
  expect(() => restoreMatchSnapshot(snapshot, { ...setup, seed: 99 })).toThrow("setup");
  expect(() => restoreMatchSnapshot({ ...snapshot, tick: 1 }, setup)).toThrow("checksum");
  expect(() =>
    restoreMatchSnapshot(seal({ ...snapshot, tick: MAX_SNAPSHOT_TICK + 1 }), setup),
  ).toThrow("incompatible");
  expect(() =>
    restoreMatchSnapshot(seal({ ...snapshot, movement: { routes: [], scheduler: {} } }), setup),
  ).toThrow("input history");
  const forged = JSON.parse(JSON.stringify(snapshot));
  const actor = kernel.world.query(Template)[0]!;
  const originalX = kernel.world.get(actor, Transform, "x");
  kernel.world.set(actor, Transform, "x", 9 * 1024);
  const changed = createMatchSnapshot(kernel, setup);
  expect(() => restoreMatchSnapshot(changed, setup)).toThrow("input history");
  kernel.world.set(actor, Transform, "x", originalX);
  expect(checkpointHash(kernel)).toBe(before);
  expect(() => parseMatchSnapshot({ ...forged, extra: 1 })).toThrow("incompatible");
  expect(() =>
    parseMatchSnapshot({
      ...snapshot,
      get world() {
        throw new Error("getter ran");
      },
    }),
  ).toThrow("own data");
  expect(checkpointHash(kernel)).toBe(before);
});

test("non-serializable custom controllers and unrecorded PRNG changes refuse instead of losing state", () => {
  const { setup, kernel } = fixture();
  kernel.controllers.set(1, () => []);
  expect(() => createMatchSnapshot(kernel, setup)).toThrow("serializable");
  kernel.controllers.delete(1);
  stream(kernel, "unrecorded");
  expect(() => restoreMatchSnapshot(createMatchSnapshot(kernel, setup), setup)).toThrow(
    "input history",
  );
});

test("signed PRNG words save as unsigned without changing canonical state", () => {
  const { setup, kernel } = fixture(12);
  const before = checkpointHash(kernel);
  expect(
    [...kernel.streams.values()].some(
      (words) => words.a < 0 || words.b < 0 || words.c < 0 || words.d < 0,
    ),
  ).toBe(true);
  const saved = createMatchSnapshot(kernel, setup);
  expect(
    saved.streams.every((words) => words.a >= 0 && words.b >= 0 && words.c >= 0 && words.d >= 0),
  ).toBe(true);
  expect(checkpointHash(restoreMatchSnapshot(saved, setup))).toBe(before);
});

test("a forged refused command cannot become accepted history in the resumed replay", () => {
  const { setup, kernel } = fixture();
  step(kernel, []);
  const saved = createMatchSnapshot(kernel, setup);
  const actor = kernel.world
    .query(Template, OwnerForce)
    .find(
      (id) =>
        kernel.world.get(id, OwnerForce, "force") === 1 &&
        kernel.world.get(id, Template, "definition") === 1,
    )!;
  const forged = seal({
    ...saved,
    scenario: {
      ...saved.scenario,
      commands: [
        {
          tick: 0,
          seat: 1,
          sequence: 0,
          type: "unit.hold",
          payload: { entities: [actor] },
        },
      ],
    },
  });
  expect(() => restoreMatchSnapshot(forged, setup)).toThrow("refused external inputs");
});
