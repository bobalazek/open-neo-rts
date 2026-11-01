import { expect, test } from "bun:test";
import { checkTerrain, RAMP, WATER } from "@open-neo-rts/content";
import { SANDBOX_MAPS } from "./generate-sandbox-maps";

for (const [id, build] of Object.entries(SANDBOX_MAPS)) {
  test(`${id} follows the terrain rules, with spawns on dry land off ramps`, () => {
    const { terrain: t, spawns } = build();
    expect(checkTerrain(t)).toEqual([]);
    for (const s of spawns) {
      const i = s.position[1] * t.width + s.position[0];
      expect([s.id, t.water[i], t.ramp[i]]).toEqual([s.id, WATER.none, RAMP.none]);
    }
  });
}
