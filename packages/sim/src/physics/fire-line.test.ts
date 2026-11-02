import { expect, test } from "bun:test";
import { type Definition, entitiesFeature, spawnEntity } from "../features/entities";
import type { GameplayWeapon } from "../features/entities/weapons";
import { createKernel, register } from "../kernel";
import { flatMap } from "../testing/maps";
import { clearFireLine } from "./fire-line";

test("launch rays inspect diagonal corner terrain and respect projectile-specific blockers", () => {
  const map = flatMap(8),
    level = [...map.terrain.level];
  level[2 * 8 + 3] = 1;
  const kernel = createKernel({
    seed: 1,
    debug: false,
    map: { ...map, terrain: { ...map.terrain, level } },
  });
  const unit: Definition = {
    id: "unit:line/fixture",
    health: 1,
    speed: 1,
    turnRate: 0,
    radiusSubcells: 128,
    domain: "foot",
  };
  register(kernel, entitiesFeature([unit]));
  const spawn = (x: number, y: number) =>
    spawnEntity(kernel, 0, unit, {
      definition: unit.id,
      force: 0,
      x: x * 1024 + 512,
      y: y * 1024 + 512,
      facing: 0,
    });
  const a = spawn(1, 1),
    b = spawn(5, 5);
  const weapon: GameplayWeapon = {
    id: "test",
    targets: ["ground"],
    rangeSubcells: [0, 10000],
    reloadTicks: 1,
    projectile: { kind: "bullet", blockedBy: ["terrain"] },
    warheads: [{ type: "damage", amount: 1, tags: [] }],
  };
  expect(clearFireLine(kernel, [unit], a, b, weapon)).toBe(false);
  expect(
    clearFireLine(kernel, [unit], a, b, {
      ...weapon,
      projectile: { kind: "arc", blockedBy: ["terrain"] },
    }),
  ).toBe(true);
  expect(clearFireLine(kernel, [unit], a, b, { ...weapon, projectile: { kind: "instant" } })).toBe(
    true,
  );
  const c = spawn(1, 6),
    d = spawn(6, 6),
    blocker = spawn(4, 6);
  const unitBlocked = { ...weapon, projectile: { kind: "bullet", blockedBy: ["units"] } };
  expect(clearFireLine(kernel, [unit], c, d, unitBlocked)).toBe(false);
  kernel.world.destroy(blocker);
  expect(clearFireLine(kernel, [unit], c, d, unitBlocked)).toBe(true);
});
