// Project rules for runtime models, on top of glTF spec conformance. Conventions: docs/contributing/assets.md#model-conventions.

import type { Gltf } from "./glb";

export type ModelKind = "unit" | "structure" | "prop" | "wreck";

export interface ModelIssue {
  level: "error" | "warning";
  message: string;
}

/** What a definition requires from its model. Empty until content schemas land. */
export interface ModelRequirements {
  /** Model material name -> material slot. Without it, model materials must be named after slots. */
  materials?: Record<string, string>;
  parts?: string[];
  sockets?: string[];
  animations?: string[];
}

export const TRIANGLE_BUDGET: Record<ModelKind, number> = {
  unit: 3000,
  structure: 6000,
  prop: 1000,
  wreck: 2000,
};

/** Material slots a model may use. The renderer owns the actual shaders; team slots follow the owner's colour. */
export const MATERIALS: Record<string, string> = {
  palette: "fixed colours from the pack palette texture",
  team: "full team colour",
  team_dark: "darker team tint (trim, panels)",
  team_light: "lighter team tint (highlights)",
  team_emissive: "glowing team colour (lights, energy)",
  metal: "neutral metal",
  glass: "translucent (cockpits, sensors, shields)",
  emissive: "fixed-colour glow",
};
const DAMAGE_STATES = new Set(["state_damaged", "state_critical"]);
const SOCKET = /^socket_[a-z]+(_\d+)?$/;
const SNAKE = /^[a-z][a-z0-9_]*$/;
const LOD = /_LOD(\d)$/;
const MAX_JOINTS = 64;
const MAX_LOD = 1;
const TRIANGLES = 4;

export function validateModel(
  gltf: Gltf,
  kind: ModelKind,
  requires: ModelRequirements = {},
): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });
  const nodes = gltf.nodes ?? [];
  const names = nodes.map((n) => n.name ?? "");

  if (gltf.asset?.version !== "2.0") error(`glTF version must be 2.0, got ${gltf.asset?.version}`);

  // Node names are how the sim and renderer find parts, so they must be unique and present.
  const seen = new Set<string>();
  nodes.forEach((n, i) => {
    if (!n.name) error(`node ${i} has no name`);
    else if (seen.has(n.name)) error(`duplicate node name "${n.name}"`);
    else seen.add(n.name);
  });

  for (const m of gltf.materials ?? []) {
    const name = m.name ?? "";
    const slot = requires.materials ? requires.materials[name] : name;
    if (requires.materials && slot === undefined) {
      error(`material "${name}" has no slot in the definition's material map`);
    } else if (!(slot && slot in MATERIALS)) {
      error(
        `material "${name}" maps to unknown slot "${slot}" (${Object.keys(MATERIALS).join(", ")})`,
      );
    }
  }

  // Origin at ground centre: scene roots carry no offset.
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) {
    const t = nodes[root]?.translation;
    if (t?.some((v) => v !== 0)) {
      warn(`root node "${names[root]}" is offset; models sit at the origin`);
    }
  }

  // Triangle budget per LOD level.
  const tris = [0, 0];
  nodes.forEach((n) => {
    if (n.mesh === undefined) return;
    const level = Number(LOD.exec(n.name ?? "")?.[1] ?? 0);
    if (level > MAX_LOD) {
      error(`"${n.name}": LOD${level} exceeds the maximum of LOD${MAX_LOD}`);
      return;
    }
    for (const p of gltf.meshes?.[n.mesh]?.primitives ?? []) {
      if ((p.mode ?? TRIANGLES) !== TRIANGLES) {
        warn(`"${n.name}": non-triangle primitive ignored`);
        continue;
      }
      const accessor = p.indices ?? p.attributes.POSITION;
      const count = accessor === undefined ? 0 : (gltf.accessors?.[accessor]?.count ?? 0);
      tris[level] = (tris[level] ?? 0) + Math.floor(count / 3);
    }
  });
  const [lod0 = 0, lod1 = 0] = tris;
  const budget = TRIANGLE_BUDGET[kind];
  if (lod0 > budget) error(`LOD0 has ${lod0} triangles; budget for ${kind} is ${budget}`);
  if (lod1 > 0 && lod1 * 2 > lod0) warn(`LOD1 has ${lod1} triangles; keep it at most half of LOD0`);

  // Sockets are empty attachment points; damage-state nodes are the only other reserved prefix.
  nodes.forEach((n) => {
    const name = n.name ?? "";
    if (name.startsWith("socket_")) {
      if (!SOCKET.test(name))
        error(`socket "${name}" must match socket_<name> or socket_<name>_<n>`);
      if (n.mesh !== undefined) error(`socket "${name}" must be an empty node`);
    }
    if (name.startsWith("state_") && !DAMAGE_STATES.has(name)) {
      error(`"${name}": damage-state nodes are state_damaged or state_critical`);
    }
  });

  // Skeletons are allowed (baked to vertex animation textures at load), within limits.
  for (const [i, skin] of (gltf.skins ?? []).entries()) {
    if (skin.joints.length > MAX_JOINTS) {
      error(`skin ${i} has ${skin.joints.length} joints; maximum is ${MAX_JOINTS}`);
    }
  }
  for (const mesh of gltf.meshes ?? []) {
    if (mesh.primitives.some((p) => "JOINTS_1" in p.attributes)) {
      error(`mesh "${mesh.name}" uses more than 4 bone influences per vertex`);
    }
  }

  const clips = (gltf.animations ?? []).map((a) => a.name ?? "");
  for (const clip of clips) {
    if (!SNAKE.test(clip)) error(`animation "${clip}" must be snake_case`);
  }
  if (new Set(clips).size !== clips.length) error("animation names must be unique");
  if (kind === "wreck" && clips.length > 0) warn("wrecks are static; animations are ignored");
  if (kind === "structure" && !names.some((n) => n.startsWith("socket_smoke"))) {
    warn("structures need at least one socket_smoke_<n> for damage effects");
  }

  for (const part of requires.parts ?? []) {
    if (!seen.has(part)) error(`missing part node "${part}"`);
  }
  for (const socket of requires.sockets ?? []) {
    if (!names.some((n) => n === socket || n.startsWith(`${socket}_`))) {
      error(`missing socket "${socket}"`);
    }
  }
  for (const clip of requires.animations ?? []) {
    if (!clips.includes(clip)) error(`missing animation "${clip}"`);
  }

  return issues;
}
