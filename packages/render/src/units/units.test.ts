import { expect, test } from "bun:test";
import { Color3, NullEngine, PBRMaterial, Scene } from "@babylonjs/core";
import { setTeamColor } from ".";

test("team recolouring preserves fixed materials and another model's colour", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const materials = [
      "team",
      "team_dark",
      "team_light",
      "team_emissive",
      "metal",
      "glass",
      "palette",
    ].map((name) => new PBRMaterial(name, scene));
    const other = new PBRMaterial("team", scene);
    const fixed = materials.slice(4).map((m) => m.albedoColor.clone());
    setTeamColor([other], "#ff0000");
    setTeamColor(materials, "#0080ff");
    expect(materials[0]?.albedoColor.equals(Color3.FromHexString("#0080ff").toLinearSpace())).toBe(
      true,
    );
    expect(
      materials[1]?.albedoColor.equals(Color3.FromHexString("#0080ff").scale(0.55).toLinearSpace()),
    ).toBe(true);
    expect(materials[2]?.albedoColor.b).toBe(1);
    expect(materials[3]?.emissiveColor.equals(materials[0]?.albedoColor ?? Color3.Black())).toBe(
      true,
    );
    expect(materials.slice(4).map((m) => m.albedoColor)).toEqual(fixed);
    expect(other.albedoColor.equals(new Color3(1, 0, 0))).toBe(true);
    const before = materials.map((m) => m.albedoColor.clone());
    expect(() => setTeamColor(materials, "blue")).toThrow("#RRGGBB");
    expect(materials.map((m) => m.albedoColor)).toEqual(before);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
