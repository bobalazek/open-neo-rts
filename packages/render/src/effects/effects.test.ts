import { expect, test } from "bun:test";
import { NullEngine, Scene } from "@babylonjs/core";
import { parseTerrain } from "@open-neo-rts/content";
import type { SeatSnapshot } from "@open-neo-rts/sim";
import { createCombatEffects, MAX_COMBAT_EFFECTS } from ".";

const snapshot = (tick: number, combatEvents: SeatSnapshot["combatEvents"] = []): SeatSnapshot => ({
  tick,
  mode: "controlled",
  entities: [],
  combatEvents,
});
test("projected rounds own separate pN handles, deduplicate ticks, stop at impacts and never extrapolate an absent round", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const layer = createCombatEffects(scene, parseTerrain(16, 16, {}));
  try {
    const first = snapshot(0, [
      { type: "launch", handle: "p1", projectile: "bullet", x: 1024, y: 1024 },
    ]);
    layer.accept(first, 0);
    const round = () => scene.getMeshByName("combat round");
    expect(round()?.position.x).toBe(2);
    layer.accept(first, 20);
    expect(scene.meshes.filter((mesh) => mesh.name === "combat round")).toHaveLength(1);
    layer.accept(
      snapshot(1, [{ type: "flight", handle: "p1", projectile: "bullet", x: 2048, y: 1024 }]),
      50,
    );
    layer.render(75);
    expect(round()?.position.x).toBe(3);
    layer.setPlaybackRate(0);
    layer.render(1000);
    expect(round()).not.toBeNull();
    layer.setPlaybackRate(1);
    layer.accept(
      snapshot(2, [{ type: "impact", handle: "p1", projectile: "bullet", x: 2048, y: 1024 }]),
      1000,
    );
    expect(round()).toBeNull();
    expect(scene.getMeshByName("combat impact")).not.toBeNull();
    layer.render(1200);
    expect(scene.getMeshByName("combat impact")).toBeNull();
    layer.accept(snapshot(3, [{ type: "flight", handle: "p2", x: 4096, y: 1024 }]), 1250);
    layer.accept(snapshot(4), 1300);
    expect(round()).toBeNull();
  } finally {
    layer.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  }
});

test("fog revocation removes effects, hidden gaps snap without fabricated paths, and cosmetic capacity stays bounded", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const layer = createCombatEffects(scene, parseTerrain(8, 8, {}));
  const fog = (tick: number, cells: Uint8Array, x: number): SeatSnapshot => ({
    ...snapshot(tick, [{ type: "flight", handle: "p1", x, y: 1024 }]),
    fog: [{ group: 0, width: 8, height: 8, cells }],
  });
  try {
    const cells = new Uint8Array(64);
    cells[9] = 2;
    cells[11] = 2;
    layer.accept(fog(0, cells, 1024), 0);
    layer.accept(fog(1, cells, 3072), 50);
    layer.render(75);
    expect(scene.getMeshByName("combat round")?.position.x).toBe(6);
    layer.accept(fog(2, new Uint8Array(64), 3072), 100);
    expect(scene.getMeshByName("combat round")).toBeNull();
    layer.accept(
      snapshot(
        3,
        Array.from({ length: MAX_COMBAT_EFFECTS + 10 }, (_, i) => ({
          type: "damage",
          amount: i ? 10 : 0,
          x: 1024,
          y: 1024,
        })),
      ),
      150,
    );
    expect(scene.meshes.filter((mesh) => mesh.name === "combat damage")).toHaveLength(
      MAX_COMBAT_EFFECTS,
    );
  } finally {
    layer.dispose();
    scene.dispose();
    engine.dispose();
  }
});
