import { addString, addU32, createHasher, digest } from "@open-neo-rts/deterministic";
import { GROUP_SCHEMA, SCHEMAS } from "../schemas/definitions";
import { validate } from "../schemas/dsl";
import { checkPacks, type ModelCheck, type PackInput, type PackIssue } from "./check-packs";

type Data = Record<string, unknown>;
type Version = [number, number, number];

export interface PackIdentity {
  readonly id: string;
  readonly version: string;
  readonly gameplay: boolean;
  readonly gameplayHash: string | null;
  readonly cosmeticHash: string;
}

export interface ResolvedCatalog {
  readonly packs: readonly PackIdentity[];
  /** Validated, frozen JSON snapshots, keyed by `<pack>.<definition ID>`. Human units remain raw. */
  readonly definitions: ReadonlyMap<string, Readonly<Data>>;
  /** Reference lookup order: this pack first, then dependency depth-first preorder. */
  readonly referenceScopes: ReadonlyMap<string, readonly string[]>;
  readonly gameplayHash: string;
  readonly cosmeticHash: string;
  readonly issues: readonly PackIssue[];
  readonly models: readonly ModelCheck[];
}

export interface ResolvePackOptions {
  /** Runtime asset bytes, keyed by `<pack>/<relative file>`. Map layers may instead use PackInput.layers. */
  readonly bytes?: ReadonlyMap<string, Uint8Array>;
  readonly expectedGameplayHash?: string;
  readonly expectedCosmeticHash?: string;
}

export class PackResolutionError extends Error {
  constructor(readonly issues: readonly PackIssue[]) {
    super(issues.map((i) => `${i.file}: ${i.message}`).join("\n"));
    this.name = "PackResolutionError";
  }
}

const object = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function fail(file: string, message: string): never {
  throw new PackResolutionError([{ level: "error", file, message }]);
}

/** Stable numeric triplets only; prereleases, wildcards, partial and hyphen ranges are unsupported. */
function version(text: string): Version {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text))
    fail("versions", `unsupported version "${text}"`);
  const parts = text.split(".").map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n)))
    fail("versions", `version is too large: "${text}"`);
  return parts as Version;
}

const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Exact, =, <, <=, >, >=, ^, ~; whitespace AND and || OR. Every clause is parsed, even if absent. */
function range(text: string): (v: Version) => boolean {
  const alternatives = text.split("||").map((part) => {
    const tokens = part.trim().match(/(?:>=|<=|[=<>^~])?\s*\d+\.\d+\.\d+/g) ?? [];
    if (!tokens.length || tokens.join("").replace(/\s/g, "") !== part.replace(/\s/g, ""))
      fail(
        "versions",
        `unsupported version range "${text}"; use numeric triplets with comparisons, ^, ~, whitespace AND or ||`,
      );
    return tokens.map((token) => {
      const match = /^(>=|<=|[=<>^~])?\s*(\d+\.\d+\.\d+)$/.exec(token);
      if (!match) return fail("versions", `unsupported version range "${text}"`);
      const op = match[1] ?? "=";
      const target = version(match[2] as string);
      return (v: Version) => {
        const c = compare(v, target);
        if (op === "=") return c === 0;
        if (op === ">") return c > 0;
        if (op === ">=") return c >= 0;
        if (op === "<") return c < 0;
        if (op === "<=") return c <= 0;
        if (c < 0) return false;
        if (op === "~") return v[0] === target[0] && v[1] === target[1];
        return target[0] > 0
          ? v[0] === target[0]
          : target[1] > 0
            ? v[0] === 0 && v[1] === target[1]
            : v[0] === 0 && v[1] === 0 && v[2] === target[2];
      };
    });
  });
  return (v) => alternatives.some((clauses) => clauses.every((test) => test(v)));
}

/** Copy canonical JSON before validation/hashing so later caller mutations cannot invalidate identity. */
function snapshot(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!object(value) && !Array.isArray(value)) fail("JSON", "expected finite, plain JSON data");
  if (ancestors.has(value)) fail("JSON", "cyclic data is not JSON");
  ancestors.add(value);
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    fail("JSON", "expected plain JSON objects");
  const copy = Array.isArray(value)
    ? value.map((v) => snapshot(v, ancestors))
    : Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, snapshot(value[key], ancestors)]),
      );
  ancestors.delete(value);
  return Object.freeze(copy);
}

/** Only known definition/inline text and presentation fields are cosmetic; opaque effect data stays intact. */
function gameplay(def: Data): Data {
  const out = { ...def };
  for (const key of ["$schema", "name", "description", "presentation", "color"]) delete out[key];
  for (const key of ["abilities", "research"])
    if (Array.isArray(out[key]))
      out[key] = out[key].map((value) => (object(value) ? gameplay(value) : value));
  if (object(out.eraVariants))
    out.eraVariants = Object.fromEntries(
      Object.entries(out.eraVariants).map(([id, value]) => [
        id,
        object(value) ? gameplay(value) : value,
      ]),
    );
  return out;
}

function hash(data: unknown, assets: ReadonlyMap<string, Uint8Array> = new Map()): string {
  const h = createHasher();
  addString(h, "content-identity-v1");
  addString(h, JSON.stringify(snapshot(data)));
  for (const file of [...assets.keys()].sort()) {
    const bytes = assets.get(file) as Uint8Array;
    addString(h, file);
    addU32(h, bytes.length);
    for (const byte of bytes) addU32(h, byte);
  }
  return digest(h).hex;
}

/** Resolve and validate without I/O. Hashes detect accidental mismatches; they are not security signatures. */
export function resolvePacks(
  inputs: readonly PackInput[],
  engineVersion: string,
  options: ResolvePackOptions = {},
): ResolvedCatalog {
  const engine = version(engineVersion);
  const packs = new Map<string, PackInput>();
  const manifests = new Map<string, Data>();
  for (const input of [...inputs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (packs.has(input.id)) fail(`${input.id}/manifest.json`, `duplicate pack ID "${input.id}"`);
    const layers = new Map(input.layers);
    for (const file of input.files) {
      const bytes = options.bytes?.get(`${input.id}/${file}`);
      if (bytes) layers.set(file, bytes);
    }
    const pack = {
      ...input,
      layers,
      files: [...input.files].sort(),
      json: new Map(
        [...input.json]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([file, value]) => [file, snapshot(value)]),
      ),
    };
    const manifest = pack.json.get("manifest.json");
    const issues = validate(SCHEMAS.manifest, manifest);
    if (issues.length)
      throw new PackResolutionError(
        issues.map((i) => ({
          level: "error",
          file: `${pack.id}/manifest.json`,
          message: `${i.path} ${i.message}`,
        })),
      );
    packs.set(pack.id, pack);
    manifests.set(pack.id, manifest as Data);
  }

  const dependencies = new Map<string, string[]>();
  for (const [id, manifest] of manifests) {
    const file = `${id}/manifest.json`;
    version(manifest.version as string);
    if (!range(manifest.engine as string)(engine))
      fail(file, `engine ${engineVersion} does not match "${manifest.engine}"`);
    const deps = new Set<string>();
    for (const field of ["dependencies", "optionalDependencies", "conflicts"]) {
      const entries = (manifest[field] ?? {}) as Record<string, string>;
      for (const name of Object.keys(entries).sort()) {
        const accepts = range(entries[name] as string);
        const other = manifests.get(name);
        if (!other) {
          if (field === "dependencies") fail(file, `depends on missing pack "${name}"`);
          continue;
        }
        const matches = accepts(version(other.version as string));
        if (field === "conflicts") {
          if (matches) fail(file, `conflicts with ${name}@${other.version} (${entries[name]})`);
        } else {
          if (!matches)
            fail(file, `${name}@${other.version} does not match ${field} range "${entries[name]}"`);
          deps.add(name);
        }
      }
    }
    dependencies.set(id, [...deps].sort());
  }

  const ordered: PackInput[] = [];
  const pending = new Set(packs.keys());
  while (pending.size) {
    const id = [...pending].find((name) =>
      dependencies.get(name)?.every((dep) => !pending.has(dep)),
    );
    if (id === undefined) fail("packs", `dependency cycle among: ${[...pending].join(", ")}`);
    pending.delete(id);
    const pack = packs.get(id) as PackInput;
    const manifest = manifests.get(id) as Data;
    // The existing reference validator follows dependencies; present optional packs have the same scope.
    ordered.push({
      ...pack,
      json: new Map(pack.json).set("manifest.json", {
        ...manifest,
        dependencies: Object.fromEntries((dependencies.get(id) ?? []).map((dep) => [dep, "0.0.0"])),
      }),
    });
  }

  for (const pack of ordered) {
    const manifest = manifests.get(pack.id) as Data;
    for (const [group, files] of Object.entries(manifest.files as Record<string, string[]>)) {
      const schema = GROUP_SCHEMA[group];
      if (!schema && files.length)
        fail(`${pack.id}/manifest.json`, `unsupported definition group "${group}"`);
      for (const file of files) {
        if (!schema) continue;
        const issues = validate(SCHEMAS[schema], pack.json.get(file));
        if (issues.length)
          throw new PackResolutionError(
            issues.map((i) => ({
              level: "error",
              file: `${pack.id}/${file}`,
              message: `${i.path} ${i.message}`,
            })),
          );
      }
    }
  }
  const checked = checkPacks(ordered);
  const errors = checked.issues.filter((issue) => issue.level === "error");
  if (errors.length) throw new PackResolutionError(errors);

  const definitions = new Map<string, Readonly<Data>>();
  const referenceScopes = new Map<string, readonly string[]>();
  const identities: PackIdentity[] = [];
  for (const pack of ordered) {
    const manifest = manifests.get(pack.id) as Data;
    const gameDefs: Data = {};
    const cosmeticDefs: Data = {};
    const gameAssets = new Map<string, Uint8Array>();
    const cosmeticAssets = new Map<string, Uint8Array>();
    const asset = (file: string, target: Map<string, Uint8Array>) => {
      if (
        file.includes("\\") ||
        file.split("/").some((part) => !part || part === "." || part === "..")
      )
        fail(`${pack.id}/${file}`, "runtime asset path must stay within its pack");
      if (!pack.files.includes(file))
        fail(`${pack.id}/${file}`, "referenced runtime asset is missing");
      const bytes = options.bytes?.get(`${pack.id}/${file}`) ?? pack.layers?.get(file);
      if (!bytes)
        fail(`${pack.id}/${file}`, "runtime asset bytes are required for content identity");
      const pointer = "version https://git-lfs.github.com/spec/v1";
      if ([...pointer].every((char, i) => bytes[i] === char.charCodeAt(0)))
        fail(
          `${pack.id}/${file}`,
          "Git LFS pointer found; actual runtime asset bytes are required",
        );
      target.set(file, bytes);
    };
    const presentationAssets = (def: Data, dir: string) => {
      if (object(def.presentation)) {
        const pres = def.presentation;
        const names = [
          pres.model,
          pres.icon,
          pres.wreck,
          ...Object.values(object(pres.sounds) ? pres.sounds : {}),
        ];
        for (const name of names) if (typeof name === "string") asset(dir + name, cosmeticAssets);
      }
      if (object(def.eraVariants))
        for (const variant of Object.values(def.eraVariants))
          if (object(variant)) presentationAssets(variant, dir);
    };
    for (const [group, files] of Object.entries(manifest.files as Record<string, string[]>)) {
      if (manifest.gameplay === false && group !== "locales" && files.length)
        fail(
          `${pack.id}/manifest.json`,
          "gameplay:false packs may contain locales only; definition overrides are not supported",
        );
      for (const file of [...files].sort()) {
        const def = pack.json.get(file) as Data;
        if (group === "locales") {
          cosmeticDefs[file] = def;
          continue;
        }
        const id = `${pack.id}.${def.id}`;
        if (definitions.has(id)) fail(`${pack.id}/${file}`, `duplicate definition ID "${id}"`);
        definitions.set(id, def);
        const game = gameplay(def);
        gameDefs[id] = game;
        cosmeticDefs[id] = def;
        const dir = file.slice(0, file.lastIndexOf("/") + 1);
        if (group === "maps" && object(def.layers))
          for (const name of Object.values(def.layers))
            if (typeof name === "string") asset(dir + name, gameAssets);
        presentationAssets(def, dir);
      }
    }
    const scope: string[] = [];
    const seen = new Set([pack.id]);
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      if (manifests.get(id)?.gameplay !== false) scope.push(id);
      for (const dep of dependencies.get(id) ?? []) visit(dep);
    };
    for (const dep of dependencies.get(pack.id) ?? []) visit(dep);
    const reachable: string[] = [];
    const visitReference = (id: string) => {
      if (reachable.includes(id)) return;
      reachable.push(id);
      for (const dep of dependencies.get(id) ?? []) visitReference(dep);
    };
    visitReference(pack.id);
    referenceScopes.set(pack.id, Object.freeze(reachable));
    identities.push(
      Object.freeze({
        id: pack.id,
        version: manifest.version as string,
        gameplay: manifest.gameplay !== false,
        gameplayHash:
          manifest.gameplay === false
            ? null
            : hash({ definitions: gameDefs, dependencies: scope }, gameAssets),
        cosmeticHash: hash({ manifest, definitions: cosmeticDefs }, cosmeticAssets),
      }),
    );
  }
  const gameplayHash = hash(
    identities
      .filter((p) => p.gameplay)
      .map((p) => [p.id, p.gameplayHash])
      .sort(([a], [b]) =>
        (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0,
      ),
  );
  const cosmeticHash = hash(
    identities
      .map((p) => [p.id, p.cosmeticHash])
      .sort(([a], [b]) =>
        (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0,
      ),
  );
  if (options.expectedGameplayHash !== undefined && options.expectedGameplayHash !== gameplayHash)
    fail(
      "identity",
      `gameplay hash mismatch: expected ${options.expectedGameplayHash}, got ${gameplayHash}`,
    );
  if (options.expectedCosmeticHash !== undefined && options.expectedCosmeticHash !== cosmeticHash)
    fail(
      "identity",
      `cosmetic hash mismatch: expected ${options.expectedCosmeticHash}, got ${cosmeticHash}`,
    );
  return {
    packs: Object.freeze(identities),
    definitions,
    referenceScopes,
    gameplayHash,
    cosmeticHash,
    ...checked,
  };
}
