import { expect, test } from "bun:test";
import { type Definition, entitiesFeature, spawnEntity } from "../features/entities";
import type { GameplayWeapon } from "../features/entities/weapons";
import { initializeVision } from "../features/vision";
import { createKernel, register } from "../kernel";
import { flatMap } from "../testing/maps";
import { bigSqrt, traceProjectile } from "./trace";

test("relative swept circles catch moving crossings that endpoint snapshots miss", () => {
  const kernel = createKernel({ seed: 1, debug: false, map: flatMap(12) });
  const unit: Definition = {
    id: "unit:trace/test",
    health: 1,
    speed: 1,
    turnRate: 0,
    domain: "foot",
    radiusSubcells: 128,
  };
  register(kernel, entitiesFeature([unit]));
  initializeVision(kernel, {
    definitions: [unit],
    forces: [
      { index: 0, faction: "faction:trace" },
      { index: 1, faction: "faction:trace" },
    ],
  });
  const target = spawnEntity(kernel, 0, unit, {
    definition: unit.id,
    force: 1,
    x: 4 * 1024 + 512,
    y: 6 * 1024 + 512,
    facing: 0,
  });
  const weapon: GameplayWeapon = {
    id: "test",
    targets: ["ground"],
    rangeSubcells: [0, 10000],
    reloadTicks: 1,
    projectile: { kind: "bullet" },
    warheads: [{ type: "damage", amount: 1, tags: [] }],
  };
  const input = {
    a: { x: 2 * 1024 + 512, y: 4 * 1024 + 512 },
    b: { x: 6 * 1024 + 512, y: 4 * 1024 + 512 },
    shooter: 0,
    force: 0,
    air: false,
    level: 0,
    weapon,
  };
  expect(traceProjectile(kernel, [unit], input)).toBeUndefined();
  expect(
    traceProjectile(kernel, [unit], {
      ...input,
      motion: new Map([[target, { x: 4 * 1024 + 512, y: 2 * 1024 + 512 }]]),
    })?.entity,
  ).toBe(target);
});

test("contact square roots keep exact integer bounds beyond Number's precision", () => {
  for (const value of [0n, 1n, 2n, 81n, (1n << 100n) - 1n, 1n << 100n]) {
    const root = bigSqrt(value);
    expect(root * root <= value).toBe(true);
    expect((root + 1n) * (root + 1n) > value).toBe(true);
  }
});
