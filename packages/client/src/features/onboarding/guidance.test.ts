import { expect, test } from "bun:test";
import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";
import { createContextHints } from ".";
import {
  defaultGuidance,
  GUIDANCE_KEY,
  readGuidance,
  saveGuidance,
  validateGuidance,
} from "./profile";

const builder: GameplayDefinition = {
  id: "core.unit:fixture/builder",
  kind: "unit",
  role: "builder",
  armor: "heavy",
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
const enemy: GameplayDefinition = {
  ...builder,
  id: "core.unit:fixture/enemy",
  role: "combat",
  weapons: [
    {
      id: "cannon",
      targets: ["ground"],
      rangeSubcells: [0, 1024],
      reloadTicks: 20,
      projectile: { kind: "instant" },
      warheads: [{ type: "damage", amount: 10, versusPerMille: { heavy: 1500 }, tags: [] }],
    },
  ],
};
const actor: PresentedEntity = {
  handle: "owned",
  definition: builder.id,
  force: 0,
  x: 0,
  y: 0,
  facing: 0,
  health: 100,
  maxHealth: 100,
  order: null,
};
const snapshot = (tick: number, entities = [actor]): SeatSnapshot => ({
  tick,
  mode: "controlled",
  entities,
});
const detector = (foe = enemy) =>
  createContextHints(
    0,
    new Map([
      [builder.id, builder],
      [foe.id, foe],
    ]),
  );

test("guidance profile is bounded, copied and separate; blocked writes preserve saved history", () => {
  let raw: string | null = null;
  const storage = {
    getItem: (key: string) => {
      expect(key).toBe(GUIDANCE_KEY);
      return raw;
    },
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const profile = defaultGuidance();
  profile.seen.push("low-power");
  saveGuidance(profile, storage);
  profile.seen.length = 0;
  expect(readGuidance(storage).seen).toEqual(["low-power"]);
  for (const bad of [
    null,
    [],
    {},
    { ...profile, format: 2 },
    { ...profile, level: "spam" },
    { ...profile, seen: ["unknown"] },
    { ...profile, seen: ["counter", "counter"] },
    { ...profile, extra: true },
  ])
    expect(() => validateGuidance(bad)).toThrow();
  expect(() =>
    saveGuidance(profile, {
      setItem: () => {
        throw Error("quota");
      },
    }),
  ).toThrow("quota");
  expect(readGuidance(storage).seen).toEqual(["low-power"]);
  raw = "{";
  expect(readGuidance(storage)).toEqual(defaultGuidance());
  raw = "x".repeat(1025);
  expect(readGuidance(storage)).toEqual(defaultGuidance());
});

test("hint levels, idle dwell, visibility and twenty-second spacing use simulation time", () => {
  const hints = detector(),
    profile = { ...defaultGuidance(), level: "all" as const };
  expect(hints.update(snapshot(0), profile)).toBeUndefined();
  expect(hints.update(snapshot(199), profile)).toBeUndefined();
  expect(hints.update(snapshot(200), profile, false)).toBeUndefined();
  expect(hints.update(snapshot(200), profile)).toEqual({
    id: "idle-builder",
    definition: builder.id,
  });
  profile.seen.push("idle-builder");
  hints.dismiss();
  expect(
    hints.update(
      { ...snapshot(201), power: [{ force: 1, produced: 0, used: 1, brownout: true }] },
      profile,
    ),
  ).toBeUndefined();
  expect(
    hints.update(
      { ...snapshot(599), power: [{ force: 0, produced: 0, used: 1, brownout: true }] },
      profile,
    ),
  ).toBeUndefined();
  expect(
    hints.update(
      { ...snapshot(600), power: [{ force: 0, produced: 0, used: 1, brownout: true }] },
      profile,
    )?.id,
  ).toBe("low-power");
  expect(hints.update(snapshot(601), { ...profile, level: "off" })).toBeUndefined();
  const important = detector();
  important.update(snapshot(0), defaultGuidance());
  expect(important.update(snapshot(1000), defaultGuidance())).toBeUndefined();
  expect(hints.update({ ...snapshot(602), mode: "debug-no-fog" }, profile)).toBeUndefined();
});

test("health loss requires a prior owned actor; counter advice respects actual target domains and explicit zero", () => {
  const hints = detector(),
    profile = defaultGuidance();
  expect(hints.update(snapshot(0, [{ ...actor, health: 50 }]), profile)).toBeUndefined();
  expect(hints.update(snapshot(1, [{ ...actor, health: 49 }]), profile)?.id).toBe("under-attack");
  const lethal = detector();
  lethal.update(snapshot(0), profile);
  expect(
    lethal.update(
      { ...snapshot(1, []), combatEvents: [{ type: "death", entity: actor.handle, x: 0, y: 0 }] },
      profile,
    )?.id,
  ).toBe("under-attack");
  const disappears = detector();
  disappears.update(snapshot(0), profile);
  expect(disappears.update(snapshot(1, []), profile)).toBeUndefined();
  const visibleEnemy = { ...actor, handle: "enemy", definition: enemy.id, force: 1 };
  expect(detector().update(snapshot(0, [actor, visibleEnemy]), profile)).toEqual({
    id: "counter",
    definition: enemy.id,
  });
  expect(detector().update(snapshot(0, [actor]), profile)).toBeUndefined();
  for (const weapon of [
    { ...enemy.weapons[0]!, targets: ["air"] },
    {
      ...enemy.weapons[0]!,
      warheads: [
        { type: "damage", amount: 10, versusPerMille: { heavy: 0, default: 2000 }, tags: [] },
      ],
    },
  ])
    expect(
      detector({ ...enemy, weapons: [weapon] }).update(snapshot(0, [actor, visibleEnemy]), profile),
    ).toBeUndefined();
});
