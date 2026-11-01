import { expect, test } from "bun:test";
import {
  checkpointHash,
  createMatch,
  createProjection,
  step,
  toDefinition,
} from "@open-neo-rts/sim";
import { createCommandLog, flatMap } from "@open-neo-rts/sim/testing";
import { createDebugDiagnostics, isOverlayOptions } from "./diagnostics";
import { isOverlayData } from "./protocol";

test("debug diagnostics are opt-in, cached, copied and observational across live blockers and paths", () => {
  const unit = toDefinition({
    id: "unit:fixture",
    health: 10,
    radius: 0,
    movement: { domain: "foot", speed: 1 },
  });
  const block = toDefinition({ id: "structure:fixture", health: 100, footprint: [1, 1] });
  const setup = {
    map: flatMap(16),
    seed: 1,
    debug: true,
    forces: [{ index: 1, faction: "faction:fixture" }],
    seats: [1],
    grants: [{ seat: 1, force: 1, scopes: ["unit.orders" as const], grantedAtTick: 0 }],
    definitions: [unit, block],
  };
  const kernel = createMatch(setup);
  const projection = createProjection(setup, 1, "debug-no-fog");
  const diagnostics = createDebugDiagnostics(kernel, setup.definitions, projection.resolve);
  expect(diagnostics.copy(projection.snapshot(kernel))).toBeUndefined();
  const hash = checkpointHash(kernel);
  diagnostics.configure({ terrain: true, navigation: "foot", paths: true });
  const first = diagnostics.copy(projection.snapshot(kernel));
  expect(first?.terrain?.width).toBe(16);
  expect(first?.navigation?.cost[6 * 16 + 8]).toBe(2);
  expect(isOverlayData(first)).toBe(true);
  expect(checkpointHash(kernel)).toBe(hash);
  const repeated = diagnostics.copy(projection.snapshot(kernel));
  expect(repeated?.terrain).toBeUndefined();
  expect(repeated?.navigation).toBeUndefined();
  const copied = structuredClone(first);
  if (!copied?.terrain) throw new Error("Missing copied terrain");
  Reflect.set(copied.terrain.level, "0", 7);
  expect(kernel.map?.terrain.level[0]).toBe(0);
  const c = createCommandLog();
  step(kernel, [c.spawn(0, 0, unit.id, 1, 2560, 6656), c.move(0, 1, [1], 12800, 6656)]);
  const moving = diagnostics.copy(projection.snapshot(kernel));
  expect(moving?.paths?.[0]?.handle).toBe("e1");
  expect(moving?.paths?.[0]?.points.length).toBeGreaterThan(1);
  expect(moving?.paths?.[0]).not.toHaveProperty("entity");
  step(kernel, [c.spawn(1, 0, block.id, 1, 8192, 6144)]);
  const blocked = diagnostics.copy(projection.snapshot(kernel));
  expect(blocked?.navigation?.cost[6 * 16 + 8]).toBe(0);
  expect(blocked?.navigation?.revision).toBeGreaterThan(first?.navigation?.revision ?? 0);
  const after = checkpointHash(kernel);
  diagnostics.configure({ terrain: false, navigation: "naval", paths: false });
  const naval = diagnostics.copy(projection.snapshot(kernel));
  expect(naval?.navigation?.cost.every((cost) => cost === 0)).toBe(true);
  expect(checkpointHash(kernel)).toBe(after);
  diagnostics.configure({ terrain: false, navigation: null, paths: false });
  expect(diagnostics.copy(projection.snapshot(kernel))).toBeUndefined();
  expect(isOverlayOptions({ terrain: true, navigation: "air", paths: false })).toBe(false);
  expect(isOverlayData({ ...first, navigation: { ...first?.navigation, cost: [] } })).toBe(false);
});
