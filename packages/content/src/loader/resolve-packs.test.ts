import { expect, test } from "bun:test";
import { type PackInput, schemaRef } from "./check-packs";
import { PackResolutionError, resolvePacks } from "./resolve-packs";

const PROP = "props/temperate/tree/prop.json";
const MODEL = "props/temperate/tree/tree.glb";
const MAP = "maps/test-map/map.json";

function pack(id: string, extra: Record<string, unknown> = {}, prop = false): PackInput {
  const json = new Map<string, unknown>([
    [
      "manifest.json",
      {
        $schema: schemaRef("manifest.json", "manifest"),
        id,
        version: "0.1.0",
        engine: ">=0.1.0",
        name: "Test pack",
        description: "Fixture.",
        dependencies: {},
        files: prop ? { props: [PROP] } : {},
        ...extra,
      },
    ],
  ]);
  if (prop)
    json.set(PROP, {
      $schema: schemaRef(PROP, "prop"),
      id: "prop:temperate/tree",
      name: "Tree",
      description: "A tree.",
      footprint: [1, 1],
      blocks: "movement",
      presentation: { model: "tree.glb", materials: {} },
    });
  return { id, files: [...json.keys(), ...(prop ? [MODEL] : [])], json };
}
const bytes = (id = "core", value = 1) => new Map([[`${id}/${MODEL}`, new Uint8Array([value])]]);
const manifest = (p: PackInput) => p.json.get("manifest.json") as Record<string, unknown>;
const prop = (p: PackInput) => p.json.get(PROP) as Record<string, unknown>;

test("prototype-named manifest groups fail as pack errors", () => {
  for (const key of ["constructor", "toString", "__proto__"]) {
    const p = pack("core");
    manifest(p).files = JSON.parse(`{"${key}":null}`);
    expect(() => resolvePacks([p], "0.1.0")).toThrow(PackResolutionError);
  }
});

function mapPack(id = "map-pack"): PackInput {
  const p = pack(id, { files: { maps: [MAP] } });
  p.json.set(MAP, {
    $schema: schemaRef(MAP, "map"),
    id: "map:test-map",
    name: "Map",
    description: "Fixture.",
    size: { width: 32, height: 32 },
    biome: "temperate",
    players: { min: 1, max: 1 },
    spawns: [{ id: "one", position: [8, 8], facing: 0 }],
    start: "empty",
    resources: [],
    objects: [],
  });
  p.files.push(MAP);
  return p;
}

test("dependency order uses ID ties, including present optional packs, independent of input order", () => {
  const a = pack("a", { dependencies: { z: "^0.1.0" } });
  const b = pack("b");
  const z = pack("z", { optionalDependencies: { absent: ">=1.0.0" } });
  const first = resolvePacks([a, z, b], "0.1.0");
  expect(first.packs.map((p) => p.id)).toEqual(["b", "z", "a"]);
  expect(resolvePacks([b, a, z], "0.1.0")).toEqual(first);
  manifest(a).dependencies = {};
  manifest(a).optionalDependencies = { z: "~0.1.0" };
  expect(resolvePacks([a, z], "0.1.0").packs.map((p) => p.id)).toEqual(["z", "a"]);
});

test("stable ranges support exact, comparisons, caret, tilde, AND and OR with zero-major bounds", () => {
  for (const [range, current, matches] of [
    ["1.2.3", "1.2.3", true],
    ["=1.2.3", "1.2.4", false],
    [">=1.2.0 <2.0.0", "1.9.0", true],
    [">1.0.0 <=1.2.3", "1.2.3", true],
    ["^1.2.3", "1.9.0", true],
    ["^1.2.3", "2.0.0", false],
    ["^0.2.3", "0.3.0", false],
    ["^0.0.3", "0.0.4", false],
    ["~1.2.3", "1.3.0", false],
    ["1.0.0 || >=2.0.0", "2.5.0", true],
  ] as const) {
    const load = () => resolvePacks([pack("core", { engine: range })], current);
    if (matches) expect(load).not.toThrow();
    else expect(load).toThrow("does not match");
  }
  for (const engine of ["*", "1.x", "1.2", "1.0.0-beta", "1.0.0 - 2.0.0", ">=01.0.0", "1.0.0 ||"])
    expect(() => resolvePacks([pack("core", { engine })], "1.2.3")).toThrow("unsupported");
  for (const v of ["01.0.0", "1.0.0+build", "9007199254740992.0.0"])
    expect(() => resolvePacks([pack("core", { version: v })], "1.0.0")).toThrow();
});

test("required/optional mismatches, missing dependencies, conflicts and invalid absent ranges fail", () => {
  const base = pack("base");
  for (const field of ["dependencies", "optionalDependencies"])
    expect(() =>
      resolvePacks([base, pack("mod", { [field]: { base: ">=1.0.0" } })], "0.1.0"),
    ).toThrow("does not match");
  expect(() => resolvePacks([pack("mod", { dependencies: { base: "0.1.0" } })], "0.1.0")).toThrow(
    "missing pack",
  );
  expect(() =>
    resolvePacks([base, pack("mod", { conflicts: { base: "^0.1.0" } })], "0.1.0"),
  ).toThrow("conflicts with");
  expect(() =>
    resolvePacks([base, pack("mod", { conflicts: { base: ">=1.0.0" } })], "0.1.0"),
  ).not.toThrow();
  expect(() =>
    resolvePacks([pack("mod", { optionalDependencies: { absent: "*" } })], "0.1.0"),
  ).toThrow("unsupported");
});

test("cycles, duplicate pack IDs, duplicate definition IDs, invalid schemas and references fail", () => {
  expect(() =>
    resolvePacks(
      [pack("a", { dependencies: { b: "0.1.0" } }), pack("b", { dependencies: { a: "0.1.0" } })],
      "0.1.0",
    ),
  ).toThrow("cycle");
  expect(() => resolvePacks([pack("a"), pack("a")], "0.1.0")).toThrow("duplicate pack ID");
  const p = pack("core", { files: { props: [PROP, PROP] } }, true);
  expect(() => resolvePacks([p], "0.1.0", { bytes: bytes() })).toThrow("duplicate ID");
  manifest(p).files = { props: [PROP] };
  prop(p).blocks = "typo";
  expect(() => resolvePacks([p], "0.1.0", { bytes: bytes() })).toThrow(PackResolutionError);
  const map = mapPack();
  (map.json.get(MAP) as Record<string, unknown>).objects = [
    { definition: "core.prop:temperate/tree", position: [16, 16], owner: "neutral" },
  ];
  expect(() => resolvePacks([map], "0.1.0")).toThrow("unknown reference");
});

test("present optional dependencies supply reference scope and full IDs prevent cross-pack collisions", () => {
  const base = pack("base", {}, true);
  const other = pack("other", {}, true);
  const map = mapPack();
  manifest(map).optionalDependencies = { base: "0.1.0" };
  (map.json.get(MAP) as Record<string, unknown>).objects = [
    { definition: "base.prop:temperate/tree", position: [16, 16], owner: "neutral" },
  ];
  const allBytes = new Map([...bytes("base"), ...bytes("other")]);
  const catalog = resolvePacks([map, base, other], "0.1.0", { bytes: allBytes });
  expect([...catalog.definitions.keys()]).toContain("base.prop:temperate/tree");
  expect([...catalog.definitions.keys()]).toContain("other.prop:temperate/tree");
  manifest(map).optionalDependencies = {};
  expect(() => resolvePacks([map, base, other], "0.1.0", { bytes: allBytes })).toThrow(
    "unknown reference",
  );
});

test("canonical data snapshots survive caller mutation and JSON key/Map/file insertion order", () => {
  const p = pack("core", {}, true);
  const initial = resolvePacks([p], "0.1.0", { bytes: bytes() });
  p.json = new Map([...p.json].reverse());
  p.files.reverse();
  p.json.set(PROP, Object.fromEntries(Object.entries(prop(p)).reverse()));
  expect(resolvePacks([p], "0.1.0", { bytes: bytes() }).gameplayHash).toBe(initial.gameplayHash);
  prop(p).name = "Changed";
  const stored = initial.definitions.get("core.prop:temperate/tree");
  expect(stored?.name).toBe("Tree");
  expect(Object.isFrozen(stored)).toBe(true);
  expect(Object.isFrozen(stored?.footprint)).toBe(true);
  expect(initial.models).toHaveLength(1);
});

test("text, version and model bytes change cosmetic identity without changing gameplay identity", () => {
  const p = pack("core", {}, true);
  const initial = resolvePacks([p], "0.1.0", { bytes: bytes() });
  prop(p).name = "Renamed tree";
  manifest(p).version = "0.1.1";
  const cosmetic = resolvePacks([p], "0.1.0", { bytes: bytes("core", 2) });
  expect(cosmetic.gameplayHash).toBe(initial.gameplayHash);
  expect(cosmetic.cosmeticHash).not.toBe(initial.cosmeticHash);
  prop(p).footprint = [2, 2];
  expect(resolvePacks([p], "0.1.0", { bytes: bytes() }).gameplayHash).not.toBe(
    initial.gameplayHash,
  );
});

test("dependency reachability changes gameplay identity even for the same loaded definitions", () => {
  const a = pack("a");
  const b = pack("b");
  const initial = resolvePacks([a, b], "0.1.0");
  manifest(b).dependencies = { a: "0.1.0" };
  expect(resolvePacks([a, b], "0.1.0").gameplayHash).not.toBe(initial.gameplayHash);
  const languageA = pack("language-a", { gameplay: false, dependencies: { a: "0.1.0" } });
  const languageB = pack("language-b", { gameplay: false, dependencies: { b: "0.1.0" } });
  const main = pack("main", { dependencies: { "language-a": "0.1.0" } });
  const all = [a, b, languageA, languageB, main];
  const indirect = resolvePacks(all, "0.1.0");
  manifest(main).dependencies = { "language-b": "0.1.0" };
  expect(resolvePacks(all, "0.1.0").gameplayHash).not.toBe(indirect.gameplayHash);
});

test("cosmetic-only packs accept locales, leave gameplay identity alone and reject gameplay definitions", () => {
  const base = pack("core", {}, true);
  const locale = pack("language", {
    gameplay: false,
    dependencies: { core: "0.1.0" },
    files: { locales: ["locales/de.json"] },
  });
  locale.json.set("locales/de.json", { "prop:temperate/tree.name": "Baum" });
  locale.files.push("locales/de.json");
  const initial = resolvePacks([base], "0.1.0", { bytes: bytes() });
  const withLocale = resolvePacks([base, locale], "0.1.0", { bytes: bytes() });
  expect(withLocale.gameplayHash).toBe(initial.gameplayHash);
  expect(withLocale.cosmeticHash).not.toBe(initial.cosmeticHash);
  expect(withLocale.packs.find((p) => p.id === "language")?.gameplayHash).toBeNull();
  expect(() =>
    resolvePacks([pack("core", { gameplay: false }, true)], "0.1.0", { bytes: bytes() }),
  ).toThrow("locales only");
});

test("referenced asset bytes are required; unused source bytes do not affect identity", () => {
  const p = pack("core", {}, true);
  expect(() => resolvePacks([p], "0.1.0")).toThrow("bytes are required");
  const pointer = Uint8Array.from("version https://git-lfs.github.com/spec/v1\n", (c) =>
    c.charCodeAt(0),
  );
  expect(() =>
    resolvePacks([p], "0.1.0", { bytes: new Map([[`core/${MODEL}`, pointer]]) }),
  ).toThrow("Git LFS pointer");
  const initial = resolvePacks([p], "0.1.0", { bytes: bytes() });
  p.files.push("props/temperate/tree/source/tree.blend");
  const allBytes = new Map([
    ...bytes(),
    ["core/props/temperate/tree/source/tree.blend", new Uint8Array([9])],
  ]);
  expect(resolvePacks([p], "0.1.0", { bytes: allBytes }).cosmeticHash).toBe(initial.cosmeticHash);
  p.files.splice(p.files.indexOf(MODEL), 1);
  expect(() => resolvePacks([p], "0.1.0", { bytes: bytes() })).toThrow("runtime asset is missing");
});

test("map layer bytes change gameplay identity and byte-map layers also undergo validation", () => {
  const p = mapPack();
  const def = p.json.get(MAP) as Record<string, unknown>;
  def.layers = { height: "height.r8" };
  p.files.push("maps/test-map/height.r8");
  p.layers = new Map([["maps/test-map/height.r8", new Uint8Array(32 * 32)]]);
  const initial = resolvePacks([p], "0.1.0");
  const changed = new Uint8Array(32 * 32).fill(1);
  const modified = resolvePacks([p], "0.1.0", {
    bytes: new Map([["map-pack/maps/test-map/height.r8", changed]]),
  });
  expect(modified.gameplayHash).not.toBe(initial.gameplayHash);
  expect(() =>
    resolvePacks([p], "0.1.0", {
      bytes: new Map([["map-pack/maps/test-map/height.r8", new Uint8Array(1)]]),
    }),
  ).toThrow();
});

test("opaque era presentation cannot reference paths outside the pack", () => {
  const file = "neutral/structures/test/structure.json";
  const p = pack("core", { files: { structures: [file] } });
  p.json.set(file, {
    $schema: schemaRef(file, "structure"),
    id: "structure:neutral/test",
    name: "Test",
    description: "Fixture.",
    role: "support",
    health: 1,
    armor: "structure",
    footprint: [1, 1],
    power: 0,
    vision: 1,
    presentation: { model: "test.glb", materials: {} },
    eraVariants: { "era:future": { presentation: { model: "../outside.glb" } } },
  });
  p.files.push(file, "neutral/structures/test/test.glb", "neutral/structures/test/../outside.glb");
  const runtime = new Map([["core/neutral/structures/test/test.glb", new Uint8Array([1])]]);
  expect(() => resolvePacks([p], "0.1.0", { bytes: runtime })).toThrow("path must stay within");
});

test("expected gameplay/cosmetic identity mismatches fail clearly", () => {
  const p = pack("core");
  const catalog = resolvePacks([p], "0.1.0");
  expect(() =>
    resolvePacks([p], "0.1.0", {
      expectedGameplayHash: catalog.gameplayHash,
      expectedCosmeticHash: catalog.cosmeticHash,
    }),
  ).not.toThrow();
  expect(() => resolvePacks([p], "0.1.0", { expectedGameplayHash: "wrong" })).toThrow(
    "gameplay hash mismatch",
  );
  expect(() => resolvePacks([p], "0.1.0", { expectedCosmeticHash: "wrong" })).toThrow(
    "cosmetic hash mismatch",
  );
});
