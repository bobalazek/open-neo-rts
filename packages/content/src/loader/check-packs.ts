// Cross-file checks for packs: manifest file lists, $schema, schema validation, IDs from folders,
// references, translations, maps, and co-located assets.

import type { ModelKind, ModelRequirements } from "../assets/validate-model";
import { checkTerrain, parseTerrain, type TerrainLayers } from "../maps";
import { EDGE_MARGIN } from "../rules/terrain";
import { GROUP_SCHEMA, SCHEMAS, type SchemaName } from "../schemas/definitions";
import { validate } from "../schemas/dsl";

export interface PackInput {
  id: string;
  /** Every file in the pack folder, relative to it. */
  files: string[];
  /** Parsed JSON for every `.json` file. */
  json: Map<string, unknown>;
  /** Bytes of every `.r8` map layer, by path relative to the pack. */
  layers?: Map<string, Uint8Array>;
}

export interface PackIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}

export interface ModelCheck {
  pack: string;
  /** Model path relative to the pack. */
  file: string;
  kind: ModelKind;
  requires: ModelRequirements;
}

type Def = Record<string, unknown>;
const ID = /^(?:([a-z0-9-]+)\.)?([a-z]+):([a-z0-9-]+(?:\/[a-z0-9-]+)?)$/;
const CELL = 2; // metres

/** The ID a definition must have, derived from where its file lives. */
const EXPECTED_ID: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^factions\/([a-z0-9-]+)\/faction\.json$/, (m) => `faction:${m[1]}`],
  [/^factions\/([a-z0-9-]+)\/units\/([a-z0-9-]+)\/unit\.json$/, (m) => `unit:${m[1]}/${m[2]}`],
  [
    /^factions\/([a-z0-9-]+)\/structures\/([a-z0-9-]+)\/structure\.json$/,
    (m) => `structure:${m[1]}/${m[2]}`,
  ],
  [/^neutral\/structures\/([a-z0-9-]+)\/structure\.json$/, (m) => `structure:neutral/${m[1]}`],
  [/^props\/([a-z0-9-]+)\/([a-z0-9-]+)\/prop\.json$/, (m) => `prop:${m[1]}/${m[2]}`],
  [/^maps\/([a-z0-9-]+)\/map\.json$/, (m) => `map:${m[1]}`],
];

const isObject = (v: unknown): v is Def => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const dir = (file: string) => file.slice(0, file.lastIndexOf("/") + 1);

/** `$schema` value for a file: relative path from the file to content/schemas/. */
export function schemaRef(file: string, name: SchemaName): string {
  return `${"../".repeat(file.split("/").length)}schemas/${name}.schema.json`;
}

/** Packs in dependency order; each pack's dependencies come before it. */
export function checkPacks(packs: PackInput[]): { issues: PackIssue[]; models: ModelCheck[] } {
  const issues: PackIssue[] = [];
  const models: ModelCheck[] = [];
  const add = (level: PackIssue["level"], pack: string, file: string, message: string) =>
    issues.push({ level, file: `${pack}/${file}`, message });

  const known = new Set(packs.map((p) => p.id));
  const deps = new Map<string, string[]>();
  const defs = new Map<string, Map<string, { file: string; def: Def }>>();
  const translations = new Map<string, Map<string, string>>(); // pack -> key -> file

  for (const pack of packs) {
    const manifest = pack.json.get("manifest.json");
    const local = new Map<string, { file: string; def: Def }>();
    defs.set(pack.id, local);
    if (!isObject(manifest)) {
      add("error", pack.id, "manifest.json", "missing or not an object");
      continue;
    }
    for (const i of validate(SCHEMAS.manifest, manifest))
      add("error", pack.id, "manifest.json", `${i.path} ${i.message}`);
    if (manifest.$schema !== schemaRef("manifest.json", "manifest")) {
      add(
        "error",
        pack.id,
        "manifest.json",
        `$schema must be "${schemaRef("manifest.json", "manifest")}"`,
      );
    }
    if (manifest.id !== pack.id)
      add("error", pack.id, "manifest.json", `id "${manifest.id}" must equal the folder name`);
    const depList = Object.keys(isObject(manifest.dependencies) ? manifest.dependencies : {});
    for (const d of depList)
      if (!known.has(d)) add("error", pack.id, "manifest.json", `depends on unknown pack "${d}"`);
    deps.set(pack.id, depList);

    const listed = new Set<string>();
    const keys = new Map<string, string>();
    translations.set(pack.id, keys);
    for (const [group, files] of Object.entries(isObject(manifest.files) ? manifest.files : {})) {
      const schemaName = GROUP_SCHEMA[group];
      for (const file of list(files)) {
        listed.add(file);
        const data = pack.json.get(file);
        if (data === undefined) {
          add("error", pack.id, file, "listed in manifest.json but missing");
          continue;
        }
        if (!schemaName) {
          add("warning", pack.id, file, `no schema for "${group}" yet; not validated`);
          continue;
        }
        for (const i of validate(SCHEMAS[schemaName], data))
          add("error", pack.id, file, `${i.path} ${i.message}`);
        if (schemaName === "locale") {
          if (isObject(data)) for (const k of Object.keys(data)) keys.set(k, file);
          continue;
        }
        if (!isObject(data)) continue;
        if (data.$schema !== schemaRef(file, schemaName))
          add("error", pack.id, file, `$schema must be "${schemaRef(file, schemaName)}"`);
        const rule = EXPECTED_ID.find(([re]) => re.test(file));
        const expected = rule ? rule[1](rule[0].exec(file) as RegExpExecArray) : undefined;
        if (expected && data.id !== expected)
          add("error", pack.id, file, `id must be "${expected}" to match its folder`);
        if (typeof data.id === "string") {
          if (local.has(data.id)) add("error", pack.id, file, `duplicate ID "${data.id}"`);
          local.set(data.id, { file, def: data });
        }
      }
    }
    for (const file of pack.files) {
      if (
        file.endsWith(".json") &&
        file !== "manifest.json" &&
        !file.endsWith("/assets.json") &&
        !file.includes("/source/") &&
        !listed.has(file)
      ) {
        add("error", pack.id, file, "not listed in manifest.json files");
      }
    }
  }

  const reachable = (pack: string): string[] => {
    const out: string[] = [];
    const visit = (p: string) => {
      if (out.includes(p)) return;
      out.push(p);
      for (const d of deps.get(p) ?? []) visit(d);
    };
    visit(pack);
    return out;
  };
  const resolve = (pack: string, ref: string) => {
    const m = ID.exec(ref);
    if (!m) return undefined;
    const [, prefix, kind, name] = m;
    const scope = prefix ? (reachable(pack).includes(prefix) ? [prefix] : []) : reachable(pack);
    for (const p of scope) {
      const hit = defs.get(p)?.get(`${kind}:${name}`);
      if (hit) return hit;
    }
    return undefined;
  };

  for (const pack of packs) {
    for (const [key, file] of translations.get(pack.id) ?? []) {
      const id = key.slice(0, key.indexOf("."));
      if (!resolve(pack.id, id))
        add("warning", pack.id, file, `translation for unknown definition "${id}"`);
    }
    checkRoles([...(defs.get(pack.id) ?? [])], (file, m) => add("error", pack.id, file, m));
    for (const [id, { file, def }] of defs.get(pack.id) ?? []) {
      for (const ref of references(def)) {
        if (ref !== id && !resolve(pack.id, ref))
          add("error", pack.id, file, `unknown reference "${ref}"`);
      }
      const [w, d] = Array.isArray(def.footprint) ? (def.footprint as number[]) : [];
      const rows = list(def.cells);
      if (Array.isArray(def.nodeKinds) && new Set(def.nodeKinds).size !== def.nodeKinds.length)
        add("error", pack.id, file, "nodeKinds must be distinct");
      if (rows.length > 0 && (rows.length !== d || rows.some((r) => r.length !== w)))
        add("error", pack.id, file, `cells must be ${d} rows of ${w} letters, matching footprint`);
      if (id.startsWith("map:"))
        checkMap(
          def,
          (name) => pack.layers?.get(dir(file) + name),
          (m) => add("error", pack.id, file, m),
        );
      const pres = def.presentation;
      if (!isObject(pres)) continue;
      const here = dir(file);
      for (const name of [pres.model, pres.icon, pres.wreck].filter(
        (p): p is string => typeof p === "string",
      )) {
        if (!pack.files.includes(here + name))
          add(
            "warning",
            pack.id,
            file,
            `asset "${name}" doesn't exist yet (bun neo make-placeholders)`,
          );
      }
      const sockets = new Set(list(pres.sockets));
      for (const w of Array.isArray(def.weapons) ? (def.weapons as Def[]) : []) {
        const socket = typeof w.socket === "string" ? w.socket : "socket_muzzle";
        if (!sockets.has(socket)) {
          add(
            "error",
            pack.id,
            file,
            `weapon "${w.id}" fires from "${socket}", which presentation.sockets doesn't list`,
          );
        }
      }
      const kind: ModelKind = id.startsWith("structure:")
        ? "structure"
        : id.startsWith("prop:")
          ? "prop"
          : "unit";
      if (typeof pres.model === "string" && pack.files.includes(here + pres.model)) {
        models.push({
          pack: pack.id,
          file: here + pres.model,
          kind,
          requires: requirements(def, pres, kind),
        });
      }
    }
  }
  return { issues, models };
}

function checkMap(
  map: Def,
  layer: (file: string) => Uint8Array | undefined,
  error: (message: string) => void,
) {
  const size = isObject(map.size) ? map.size : {};
  const [w, h] = [Number(size.width ?? 0), Number(size.height ?? 0)];
  const spawns = Array.isArray(map.spawns) ? (map.spawns as Def[]) : [];
  const ids = spawns.map((s) => String(s.id));
  const players = isObject(map.players) ? map.players : {};
  /** Why a position (in cells, `radius` around it) is misplaced, if it is. */
  const misplaced = (p: unknown, radius = 0) => {
    const [x = Number.NaN, y = Number.NaN] = Array.isArray(p) ? p.map(Number) : [];
    if (!(x <= w && y <= h)) return `is outside the ${w} × ${h} map`;
    if (Math.min(x, y, w - x, h - y) - radius < EDGE_MARGIN)
      return `is closer than ${EDGE_MARGIN} cells to the map edge`;
  };
  if (new Set(ids).size !== ids.length) error("spawn IDs must be unique");
  if (spawns.length < Number(players.max ?? 0))
    error(`players.max is ${players.max} but there are only ${spawns.length} spawns`);
  if (Number(players.min ?? 0) > Number(players.max ?? 0))
    error("players.min is larger than players.max");
  for (const s of spawns) {
    const why = misplaced(s.position);
    if (why) error(`spawn "${s.id}" ${why}`);
  }
  for (const r of Array.isArray(map.resources) ? (map.resources as Def[]) : []) {
    const why = misplaced(r.position, Number(r.radius ?? 0));
    if (why) error(`resource at ${JSON.stringify(r.position)} ${why}`);
  }
  for (const o of Array.isArray(map.objects) ? (map.objects as Def[]) : []) {
    const why = misplaced(o.position);
    if (why) error(`object "${o.definition}" ${why}`);
    if (o.owner !== "neutral" && !ids.includes(String(o.owner)))
      error(`object owner "${o.owner}" isn't a spawn`);
  }
  for (const team of Array.isArray(map.teams) ? (map.teams as string[][]) : []) {
    for (const s of team) if (!ids.includes(s)) error(`team layout names unknown spawn "${s}"`);
  }

  const layers: TerrainLayers = {};
  let complete = true;
  for (const [name, file] of Object.entries(isObject(map.layers) ? map.layers : {})) {
    const bytes = layer(String(file));
    if (bytes) layers[name as keyof TerrainLayers] = bytes;
    else {
      error(`layers.${name} "${file}" doesn't exist`);
      complete = false;
    }
  }
  if (!complete) return;
  try {
    for (const m of checkTerrain(parseTerrain(w, h, layers, String(map.biome)))) error(m);
  } catch (e) {
    error((e as Error).message);
  }
}

/** Every string that looks like a definition ID. */
/** Each faction has exactly one headquarters and a builder trained there, or it can't rebuild. */
function checkRoles(
  defs: [string, { file: string; def: Def }][],
  fail: (file: string, message: string) => void,
) {
  for (const [id, { file }] of defs) {
    if (!id.startsWith("faction:")) continue;
    const name = id.slice("faction:".length);
    const withRole = (kind: string, role: string) =>
      defs.filter(([i, { def }]) => i.startsWith(`${kind}:${name}/`) && def.role === role);
    const hqs = withRole("structure", "headquarters").map(([i]) => i);
    if (hqs.length !== 1) fail(file, `needs exactly one headquarters structure, has ${hqs.length}`);
    if (
      !withRole("unit", "builder").some(([, { def }]) =>
        list(def.producedBy).some((p) => hqs.includes(p)),
      )
    )
      fail(file, "needs a builder unit trained at its headquarters");
  }
}

function references(def: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (key === "id" || key === "$schema" || key === "eraVariants") return;
    if (typeof v === "string" && ID.test(v)) out.push(v);
    else if (Array.isArray(v)) for (const x of v) walk(x);
    else if (isObject(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(def);
  return out;
}

function requirements(def: Def, pres: Def, kind: ModelKind): ModelRequirements {
  const materials =
    isObject(pres.materials) && Object.keys(pres.materials).length > 0
      ? (pres.materials as Record<string, string>)
      : undefined;
  const footprint = Array.isArray(def.footprint) ? (def.footprint as number[]) : [];
  const size =
    footprint.length === 2
      ? { width: (footprint[0] ?? 1) * CELL, depth: (footprint[1] ?? 1) * CELL }
      : typeof def.radius === "number"
        ? { width: def.radius * 2 * CELL, depth: def.radius * 2 * CELL }
        : undefined;
  return {
    parts: list(pres.parts),
    sockets: list(pres.sockets),
    animations: [
      ...new Set([
        ...(kind === "unit" ? ["idle", "move"] : []),
        ...(kind === "unit" && Array.isArray(def.weapons) && def.weapons.length > 0
          ? ["attack"]
          : []),
        ...(kind === "unit" && def.family === "infantry" ? ["death"] : []),
        ...list(pres.animations),
      ]),
    ],
    teamColor: kind === "unit" || kind === "structure",
    ...(materials && { materials }),
    ...(size && kind !== "prop" && { size }),
  };
}
