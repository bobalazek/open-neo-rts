import { expect, test } from "bun:test";
import { parseDebugSeed, validateDebugForces } from "./configuration";

test("debug seed accepts exactly replay-safe unsigned integers", () => {
  expect(parseDebugSeed("0")).toBe(0);
  expect(parseDebugSeed("4294967295")).toBe(0xffffffff);
  for (const value of ["", " ", "1.5", "-1", "1x", "1e2", "0x10", "01", "4294967296", "Infinity"])
    expect(() => parseDebugSeed(value)).toThrow("Seed must be an integer");
});

test("Forces require original factions, colours, unique IDs and a declared controller", () => {
  const force = { index: 0, faction: "core.faction:eastern-collective", color: "#d8443a" };
  expect(() => validateDebugForces([force], 0)).not.toThrow();
  for (const [forces, controlled] of [
    [[], 0],
    [[force], 1],
    [[force, force], 0],
    [[{ ...force, faction: "faction:invented" }], 0],
    [[{ ...force, color: "red" }], 0],
  ] as const)
    expect(() => validateDebugForces(forces, controlled)).toThrow();
});
