import { describe, expect, test } from "bun:test";
import { type Gltf, parseGlb } from "./glb";
import { validateModel } from "./validate-model";

function glb(json: object): Uint8Array {
  const text = JSON.stringify(json);
  const padded = text.padEnd(Math.ceil(text.length / 4) * 4, " ");
  const body = new TextEncoder().encode(padded);
  const out = new Uint8Array(20 + body.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, body.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

const tank: Gltf = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: "hull", mesh: 0, children: [1, 2] },
    { name: "turret", mesh: 0 },
    { name: "socket_muzzle_0" },
  ],
  meshes: [{ name: "body", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [{ count: 300 }, { count: 900 }],
  materials: [{ name: "palette" }, { name: "team" }],
  animations: [{ name: "fire_recoil" }],
};

const errors = (g: Gltf, kind: "unit" | "structure" = "unit", requires = {}) =>
  validateModel(g, kind, requires)
    .filter((i) => i.level === "error")
    .map((i) => i.message);

describe("parseGlb", () => {
  test("round-trips the JSON chunk", () => {
    expect(parseGlb(glb(tank)).nodes?.[1]?.name).toBe("turret");
  });
  test("decodes non-ASCII node names", () => {
    const nodes = [{ name: "turm_ü_🚀" }];
    expect(parseGlb(glb({ ...tank, nodes })).nodes?.[0]?.name).toBe("turm_ü_🚀");
  });
  test("rejects non-GLB bytes", () => {
    expect(() => parseGlb(new Uint8Array(24))).toThrow("bad magic");
  });
});

describe("validateModel", () => {
  test("a conforming unit passes", () => {
    expect(errors(tank, "unit", { parts: ["hull", "turret"], sockets: ["socket_muzzle"] })).toEqual(
      [],
    );
  });
  test("rejects foreign materials", () => {
    expect(errors({ ...tank, materials: [{ name: "chrome" }] })[0]).toContain(
      'material "chrome" maps to unknown slot "chrome"',
    );
  });
  test("maps artist material names to slots through the definition", () => {
    const materials = [{ name: "Body" }, { name: "Trim" }, { name: "Visor" }];
    const map = { Body: "team", Trim: "team_dark", Visor: "glass" };
    expect(errors({ ...tank, materials }, "unit", { materials: map })).toEqual([]);
    expect(errors({ ...tank, materials }, "unit", { materials: { Body: "team" } })).toEqual([
      'material "Trim" has no slot in the definition\'s material map',
      'material "Visor" has no slot in the definition\'s material map',
    ]);
  });
  test("rejects sockets with geometry", () => {
    const nodes = [...(tank.nodes ?? []), { name: "socket_exhaust", mesh: 0 }];
    expect(errors({ ...tank, nodes })).toContain('socket "socket_exhaust" must be an empty node');
  });
  test("enforces the triangle budget", () => {
    expect(errors({ ...tank, accessors: [{ count: 300 }, { count: 6000 }] })[0]).toContain(
      "budget for unit is 3000",
    );
  });
  test("reports missing parts, sockets and clips", () => {
    expect(
      errors(tank, "unit", {
        parts: ["barrel"],
        sockets: ["socket_exhaust"],
        animations: ["idle"],
      }),
    ).toEqual([
      'missing part node "barrel"',
      'missing socket "socket_exhaust"',
      'missing animation "idle"',
    ]);
  });
  test("caps bone influences", () => {
    const meshes = [{ name: "body", primitives: [{ attributes: { POSITION: 0, JOINTS_1: 2 } }] }];
    expect(errors({ ...tank, meshes })).toContain(
      'mesh "body" uses more than 4 bone influences per vertex',
    );
  });

  test("owned models need team colour on geometry, not just an unused material", () => {
    const model = {
      ...tank,
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 1 }] }],
    };
    expect(errors(model, "unit", { teamColor: true })).toEqual([]);
    expect(errors(tank, "unit", { teamColor: true })).toContain(
      "needs team colour on mesh geometry (team, team_dark, team_light or team_emissive)",
    );
    expect(
      errors({ ...model, materials: [{ name: "palette" }, { name: "Paint" }] }, "unit", {
        teamColor: true,
        materials: { palette: "palette", Paint: "team_dark" },
      }),
    ).toEqual([]);
  });
  test("required clips need usable transform keyframes", () => {
    const model: Gltf = {
      ...tank,
      accessors: [...(tank.accessors ?? []), { count: 2, min: [0], max: [1] }, { count: 2 }],
      animations: [
        {
          name: "idle",
          samplers: [{ input: 2, output: 3 }],
          channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
        },
      ],
    };
    expect(errors(model, "unit", { animations: ["idle"] })).toEqual([]);
    expect(
      errors({ ...model, animations: [{ name: "idle" }] }, "unit", { animations: ["idle"] }),
    ).toEqual(['animation "idle" needs a keyed transform channel']);
    const animation = model.animations?.[0];
    expect(
      errors(
        {
          ...model,
          animations: [
            { ...animation, channels: [{ sampler: 8, target: { node: 0, path: "translation" } }] },
          ],
        },
        "unit",
        { animations: ["idle"] },
      ),
    ).toEqual(['animation "idle" needs a keyed transform channel']);
  });
});
