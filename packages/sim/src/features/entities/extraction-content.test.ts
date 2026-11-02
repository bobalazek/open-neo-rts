import { expect, test } from "bun:test";
import { type PackInput, resolvePacks } from "@open-neo-rts/content";
import { compileGameplayCatalog } from "./content";
import { toDefinition } from "./definitions";

const extraction = {
  materials: { resource: "materials" as const, amountPerSecond: 1 },
  oil: { resource: "credits" as const, amountPerSecond: 2 },
};
const raw = {
  $schema: "../../../../schemas/structure.schema.json",
  id: "structure:neutral/producer",
  name: "Producer",
  description: "Test fixture.",
  role: "extractor",
  cost: { credits: 800 },
  buildTime: 20,
  health: 800,
  armor: "structure",
  footprint: [2, 2],
  nodeKinds: ["materials", "oil"] as const,
  power: -10,
  vision: 4,
  extraction,
  presentation: {
    model: "producer.glb",
    icon: "producer.png",
    materials: {},
    sockets: [],
    animations: [],
  },
};
function pack(definition: Record<string, unknown>): PackInput {
  const json = new Map<string, unknown>([
    [
      "manifest.json",
      {
        $schema: "../schemas/manifest.schema.json",
        id: "fixture",
        version: "0.1.0",
        engine: ">=0.1.0",
        name: "Fixture",
        description: "Test fixture.",
        dependencies: {},
        files: { structures: ["neutral/structures/producer/structure.json"] },
      },
    ],
    ["neutral/structures/producer/structure.json", definition],
  ]);
  const layers = new Map(
    ["producer.glb", "producer.png"].map((name) => [
      `neutral/structures/producer/${name}`,
      new Uint8Array([1]),
    ]),
  );
  return { id: "fixture", json, layers, files: [...json.keys(), ...layers.keys()] };
}

test("raw extraction data compiles exact per-second rates without mutating content", () => {
  const resolved = resolvePacks([pack(raw)], "0.1.0");
  const compiled = compileGameplayCatalog(resolved).definitions[0];
  expect(compiled).toMatchObject({
    id: "fixture.structure:neutral/producer",
    extraction,
    construction: { cost: { credits: 800 }, buildTicks: 400 },
  });
  expect(compiled?.extraction).not.toBe(extraction);
  expect(raw.buildTime).toBe(20);
  expect(raw.extraction.materials.amountPerSecond).toBe(1);
});

test("raw and compiled extraction contracts reject missing outputs, unsupported outputs and invalid rates", () => {
  for (const invalid of [
    {},
    { materials: extraction.materials },
    { ...extraction, oil: { resource: "power", amountPerSecond: 2 } },
    { ...extraction, oil: { resource: "credits", amountPerSecond: 0 } },
    { ...extraction, oil: { resource: "credits", amountPerSecond: 0.5 } },
    { ...extraction, oil: { resource: "credits", amountPerSecond: 0x80000000 } },
  ]) {
    expect(() => resolvePacks([pack({ ...raw, extraction: invalid })], "0.1.0")).toThrow();
    expect(() => toDefinition({ ...raw, extraction: invalid as typeof extraction })).toThrow();
  }
  expect(() => toDefinition({ ...raw, role: "production" })).toThrow("powered extractor");
  expect(() => toDefinition({ ...raw, nodeKinds: ["materials"] })).toThrow("powered extractor");
});
