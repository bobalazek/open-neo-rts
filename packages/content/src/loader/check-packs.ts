// Cross-file checks for packs: manifest file lists, $schema, schema validation, IDs, references, locales, assets.

import type { ModelKind, ModelRequirements } from "../assets/validate-model";
import { GROUP_SCHEMA, SCHEMAS, type SchemaName } from "../schemas/definitions";
import { validate } from "../schemas/dsl";

export interface PackInput {
  id: string;
  /** Every file in the pack folder, relative to it (`units/tank.json`, `assets/units/tank/tank.glb`). */
  files: string[];
  /** Parsed JSON for every `.json` file. */
  json: Map<string, unknown>;
}

export interface PackIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}

export interface ModelCheck {
  pack: string;
  file: string;
  kind: ModelKind;
  requires: ModelRequirements;
}

const ID = /^(?:([a-z0-9-]+)\.)?([a-z]+):([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SINGULAR: Record<string, string> = {
  factions: "faction",
  units: "unit",
  structures: "structure",
  weapons: "weapon",
  abilities: "ability",
  research: "research",
  profiles: "profile",
  presets: "preset",
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function schemaRef(file: string, name: SchemaName): string {
  return `${"../".repeat(file.split("/").length + 1)}schemas/${name}.schema.json`;
}

/** Packs in dependency order; `dependencies` of each pack are resolved before it. */
export function checkPacks(packs: PackInput[]): { issues: PackIssue[]; models: ModelCheck[] } {
  const issues: PackIssue[] = [];
  const models: ModelCheck[] = [];
  const add = (level: PackIssue["level"], pack: string, file: string, message: string) =>
    issues.push({ level, file: `${pack}/${file}`, message });

  const byId = new Map(packs.map((p) => [p.id, p]));
  const deps = new Map<string, string[]>();
  const ids = new Map<string, Map<string, { file: string; def: Record<string, unknown> }>>();
  const keys = new Map<string, Set<string>>();

  for (const pack of packs) {
    const manifest = pack.json.get("manifest.json");
    if (!isObject(manifest)) {
      add("error", pack.id, "manifest.json", "missing or not an object");
      continue;
    }
    for (const i of validate(SCHEMAS.manifest, manifest))
      add("error", pack.id, "manifest.json", `${i.path} ${i.message}`);
    if (manifest.id !== pack.id)
      add("error", pack.id, "manifest.json", `id "${manifest.id}" must equal the folder name`);
    const depList = Object.keys(isObject(manifest.dependencies) ? manifest.dependencies : {});
    for (const d of depList)
      if (!byId.has(d)) add("error", pack.id, "manifest.json", `depends on unknown pack "${d}"`);
    deps.set(pack.id, depList);

    const listed = new Set<string>();
    const local = new Map<string, { file: string; def: Record<string, unknown> }>();
    const localKeys = new Set<string>();
    const groups = isObject(manifest.files) ? manifest.files : {};

    for (const [group, list] of Object.entries(groups)) {
      for (const file of Array.isArray(list) ? (list as string[]) : []) {
        listed.add(file);
        const data = pack.json.get(file);
        if (data === undefined) {
          add("error", pack.id, file, "listed in manifest.json but missing");
          continue;
        }
        const rule = GROUP_SCHEMA[group];
        if (!rule) {
          add("warning", pack.id, file, `no schema for "${group}" yet; not validated`);
          continue;
        }
        const name = typeof rule === "function" ? rule(file) : rule;
        if (name === "locale") {
          if (isObject(data)) for (const k of Object.keys(data)) localKeys.add(k);
        } else if (!isObject(data) || data.$schema !== schemaRef(file, name)) {
          add("error", pack.id, file, `$schema must be "${schemaRef(file, name)}"`);
        }
        for (const i of validate(SCHEMAS[name], data))
          add("error", pack.id, file, `${i.path} ${i.message}`);
        collectIds(pack.id, file, group, data, local, add);
      }
    }
    for (const file of pack.files) {
      if (
        file.endsWith(".json") &&
        file !== "manifest.json" &&
        !listed.has(file) &&
        !file.startsWith("assets/")
      ) {
        add("error", pack.id, file, "not listed in manifest.json files");
      }
    }
    ids.set(pack.id, local);
    keys.set(pack.id, localKeys);
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
      const hit = ids.get(p)?.get(`${kind}:${name}`);
      if (hit) return hit;
    }
    return undefined;
  };

  for (const pack of packs) {
    const scopeKeys = new Set(reachable(pack.id).flatMap((p) => [...(keys.get(p) ?? [])]));
    for (const [id, { file, def }] of ids.get(pack.id) ?? []) {
      for (const ref of references(def)) {
        if (ref !== id && !resolve(pack.id, ref))
          add("error", pack.id, file, `unknown reference "${ref}"`);
      }
      for (const field of ["name", "description"]) {
        const k = def[field];
        if (typeof k === "string" && !scopeKeys.has(k))
          add("error", pack.id, file, `${field}: no English string for "${k}"`);
      }
      const pres = def.presentation;
      if (!isObject(pres)) continue;
      for (const path of [pres.model, pres.icon, pres.wreck].filter(
        (p): p is string => typeof p === "string",
      )) {
        if (!pack.files.includes(path))
          add("warning", pack.id, file, `asset "${path}" doesn't exist yet`);
      }
      const kind = id.startsWith("structure:") ? "structure" : "unit";
      const sockets = new Set(Array.isArray(pres.sockets) ? (pres.sockets as string[]) : []);
      for (const w of Array.isArray(def.weapons) ? (def.weapons as string[]) : []) {
        const weapon = resolve(pack.id, w)?.def;
        const socket = typeof weapon?.socket === "string" ? weapon.socket : "socket_muzzle";
        if (!sockets.has(socket))
          add(
            "error",
            pack.id,
            file,
            `weapon "${w}" fires from "${socket}", which presentation.sockets doesn't list`,
          );
      }
      if (typeof pres.model === "string" && pack.files.includes(pres.model)) {
        models.push({
          pack: pack.id,
          file: pres.model,
          kind,
          requires: requirements(def, pres, kind),
        });
      }
    }
  }
  return { issues, models };
}

function collectIds(
  pack: string,
  file: string,
  group: string,
  data: unknown,
  into: Map<string, { file: string; def: Record<string, unknown> }>,
  add: (level: PackIssue["level"], pack: string, file: string, message: string) => void,
) {
  if (!isObject(data)) return;
  const defs: Record<string, unknown>[] =
    group === "rules" && Array.isArray(data.resources)
      ? (data.resources as Record<string, unknown>[])
      : [data];
  for (const def of defs) {
    if (typeof def.id !== "string") continue;
    const local = def.id.replace(/^[a-z0-9-]+\./, "");
    if (into.has(local))
      add("error", pack, file, `duplicate ID "${local}" (also in ${into.get(local)?.file})`);
    into.set(local, { file, def });
    const kind = SINGULAR[group];
    const base = file
      .split("/")
      .pop()
      ?.replace(/\.json$/, "");
    if (kind && local !== `${kind}:${base}`)
      add("error", pack, file, `ID must be "${kind}:${base}" to match the file`);
  }
}

/** Every string that looks like a definition ID, plus cost and resource keys. */
function references(def: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, k?: string) => {
    if (k === "id" || k === "$schema" || k === "eraVariants") return;
    if (typeof v === "string" && ID.test(v)) out.push(v);
    else if (Array.isArray(v)) for (const x of v) walk(x);
    else if (isObject(v)) {
      for (const [kk, x] of Object.entries(v)) {
        if (ID.test(kk)) out.push(kk);
        walk(x, kk);
      }
    }
  };
  walk(def);
  return out;
}

function requirements(
  def: Record<string, unknown>,
  pres: Record<string, unknown>,
  kind: ModelKind,
): ModelRequirements {
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const materials =
    isObject(pres.materials) && Object.keys(pres.materials).length > 0
      ? (pres.materials as Record<string, string>)
      : undefined;
  const cells = 2; // metres per cell
  const footprint = list(def.footprint) as unknown as number[];
  const size =
    kind === "structure" && footprint.length === 2
      ? { width: (footprint[0] ?? 1) * cells, depth: (footprint[1] ?? 1) * cells }
      : typeof def.radius === "number"
        ? { width: def.radius * 2 * cells, depth: def.radius * 2 * cells }
        : undefined;
  return {
    parts: list(pres.parts),
    sockets: list(pres.sockets),
    animations: list(pres.animations),
    ...(materials && { materials }),
    ...(size && { size }),
  };
}
