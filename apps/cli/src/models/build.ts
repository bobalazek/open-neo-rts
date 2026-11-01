// Builds a brick-model source (bricks.ts) into GLB bytes, a derived wreck or rubble model, and an icon.
// Conventions: docs/contributing/assets.md#model-conventions.

import { ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, glbWriter, outline, png } from "../glb-writer";
import { BRICK, type BrickModel, type Slot } from "./bricks";

const GAP = 0.01; // metres trimmed off every brick face, so neighbouring bricks show a seam
const LIP = 0.25; // a slope keeps this fraction of its height at the low edge
const DERIVED_BUDGET = 2000; // wreck and rubble triangles (assets.md)
const SLOTS: Slot[] = [
  "palette",
  "team",
  "team_dark",
  "team_light",
  "team_emissive",
  "metal",
  "glass",
  "emissive",
];
const PATHS = { rotation: "rotation", translation: "translation", scale: "scale" } as const;
type Path = keyof typeof PATHS;

type V3 = [number, number, number];
type Q = [number, number, number, number];
interface Brick {
  slot: Slot;
  rgb: V3; // sRGB: the vertex colour for palette bricks, a preview colour otherwise
  lo: V3; // minimum corner, brick units
  size: V3;
  shape: string;
  studs: boolean;
}
interface Node {
  name: string;
  parent?: string;
  at: V3;
  rot: V3;
  bricks: Brick[];
}
interface Clip {
  name: string;
  duration: number;
  loop: boolean;
  tracks: { node: string; path: Path; keys: [number, V3][] }[];
}
interface Model {
  nodes: Node[];
  clips: Clip[];
}

export interface Built {
  glb: Uint8Array;
  triangles: number;
  icon: Uint8Array;
  derived?: { glb: Uint8Array; triangles: number };
  sockets: string[];
  clips: string[];
}

/** `team` is the preview team colour (the faction's default); `derived` picks the wreck or rubble model. */
export function buildModel(
  src: BrickModel,
  opts: { team: string; derived?: "wreck" | "rubble"; seed: string },
): Built {
  const model = fromSource(src, slotColours(hex(opts.team)));
  const main = toGlb(model, opts.team);
  const darken = src.destroyed?.darken ?? 0.6;
  const drop = new Set(src.destroyed?.drop ?? []);
  const derived =
    opts.derived &&
    toGlb(
      opts.derived === "rubble"
        ? rubble(model, opts.seed, darken)
        : wreck(model, opts.seed, darken, drop),
      opts.team,
    );
  return {
    glb: main.bytes,
    triangles: main.triangles,
    icon: icon(model),
    ...(derived && { derived: { glb: derived.bytes, triangles: derived.triangles } }),
    sockets: [
      ...new Set(
        model.nodes.flatMap((n) =>
          n.name.startsWith("socket_") ? [n.name.replace(/_\d+$/, "")] : [],
        ),
      ),
    ],
    clips: model.clips.map((c) => c.name),
  };
}

// --- Source checks ----------------------------------------------------------------------------

function fromSource(src: BrickModel, colours: Record<Slot, V3>): Model {
  const nodes: Node[] = [];
  const roots = src.nodes.filter((n) => !n.parent);
  if (roots.length !== 1) throw new Error(`needs exactly one root node, has ${roots.length}`);
  for (const n of src.nodes) {
    const where = `node "${n.name}"`;
    if (nodes.some((x) => x.name === n.name)) throw new Error(`${where}: duplicate name`);
    if (n.parent && !nodes.some((x) => x.name === n.parent))
      throw new Error(`${where}: parent "${n.parent}" must come before it`);
    if (!n.parent && n.at?.some((c) => c !== 0))
      throw new Error(`${where}: the root sits at 0 0 0`);
    if (n.name.startsWith("socket_") && n.bricks?.length)
      throw new Error(`${where}: sockets stay empty`);
    const bricks = (n.bricks ?? []).flatMap((b, i): Brick[] => {
      const at = `${where} brick ${i}`;
      if (!SLOTS.includes(b.slot)) throw new Error(`${at}: unknown slot "${b.slot}"`);
      if (b.slot === "palette" && !/^#[0-9a-fA-F]{6}$/.test(b.color ?? ""))
        throw new Error(`${at}: palette bricks need a color like "#5a5f66"`);
      if (b.size.some((s) => !(s > 0))) throw new Error(`${at}: size must be positive`);
      const brick: Brick = {
        slot: b.slot,
        rgb: b.slot === "palette" ? hex(b.color as string) : colours[b.slot],
        lo: [...b.at],
        size: [...b.size],
        shape: b.shape ?? "box",
        studs: b.studs ?? true,
      };
      if (!b.mirror) return [brick];
      const swap: Record<string, string> = { "slope+x": "slope-x", "slope-x": "slope+x" };
      const lo: V3 = [-(b.at[0] + b.size[0]), b.at[1], b.at[2]];
      return [brick, { ...brick, lo, shape: swap[brick.shape] ?? brick.shape }];
    });
    nodes.push({
      name: n.name,
      ...(n.parent && { parent: n.parent }),
      at: n.at ? [...n.at] : [0, 0, 0],
      rot: n.rotation ? [...n.rotation] : [0, 0, 0],
      bricks,
    });
  }
  const clips = Object.entries(src.animations ?? {}).map(([name, c]): Clip => {
    const tracks = c.tracks.flatMap((t) => {
      if (!nodes.some((n) => n.name === t.node))
        throw new Error(`animation ${name}: unknown node "${t.node}"`);
      return (Object.keys(PATHS) as Path[]).flatMap((path) => {
        const keys = t[path];
        if (!keys) return [];
        if (
          keys.some(
            ([time], i) =>
              time < 0 || time > c.duration || (i > 0 && time <= (keys[i - 1]?.[0] ?? 0)),
          )
        )
          throw new Error(
            `animation ${name} ${t.node}.${path}: key times must increase within 0..duration`,
          );
        return [
          { node: t.node, path, keys: keys.map(([time, v]): [number, V3] => [time, [...v]]) },
        ];
      });
    });
    return { name, duration: c.duration, loop: c.loop ?? false, tracks };
  });
  return { nodes, clips };
}

// --- Geometry ---------------------------------------------------------------------------------

interface Mesh {
  pos: number[];
  nrm: number[];
  rgb: number[];
  idx: number[];
}

/** Flat-shaded triangles per material slot, in metres relative to the node pivot. */
function geometry(bricks: Brick[]): Map<Slot, Mesh> {
  const out = new Map<Slot, Mesh>();
  for (const b of bricks) {
    let m = out.get(b.slot);
    if (!m) {
      m = { pos: [], nrm: [], rgb: [], idx: [] };
      out.set(b.slot, m);
    }
    for (const face of brickFaces(b, bricks)) {
      const n = newell(face);
      const base = m.pos.length / 3;
      for (const p of face) {
        m.pos.push(...p.map(round));
        m.nrm.push(...n);
        m.rgb.push(...b.rgb);
      }
      for (let i = 1; i + 1 < face.length; i++) m.idx.push(base, base + i, base + i + 1);
    }
  }
  return out;
}

// Box corners: bit 0 = x, bit 1 = y, bit 2 = z (0 low, 1 high). Faces x-, x+, y-, y+, z-, z+.
const BOX = [
  [0, 2, 6, 4],
  [1, 3, 7, 5],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 1, 3, 2],
  [4, 5, 7, 6],
];
const corners = (lo: V3, hi: V3) =>
  Array.from(
    { length: 8 },
    (_, i): V3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]],
  );

function brickFaces(b: Brick, siblings: Brick[]): V3[][] {
  const g = (k: 0 | 1 | 2) => Math.min(GAP, b.size[k] * BRICK * 0.1);
  const edge = (k: 0 | 1 | 2, side: number) =>
    (b.lo[k] + b.size[k] * side) * BRICK - g(k) * (side * 2 - 1);
  const lo: V3 = [edge(0, 0), edge(1, 0), edge(2, 0)];
  const hi: V3 = [edge(0, 1), edge(1, 1), edge(2, 1)];
  if (b.shape.startsWith("cyl-")) return prism(lo, hi, "xyz".indexOf(b.shape.slice(4)));
  const c = corners(lo, hi);
  if (b.shape.startsWith("slope")) {
    const bit = b.shape.endsWith("x") ? 1 : 4;
    const high = b.shape[5] === "+";
    for (const [i, p] of c.entries())
      if (i & 2 && Boolean(i & bit) === high) p[1] = lo[1] + (hi[1] - lo[1]) * LIP;
  }
  const faces = orient(
    BOX.map((q) => q.map((i) => c[i] as V3)),
    mid(lo, hi),
  );
  if (!b.studs || b.shape !== "box") return faces;
  const top = b.lo[1] + b.size[1];
  const [nx, nz] = [Math.floor(b.size[0] + 1e-6), Math.floor(b.size[2] + 1e-6)];
  const [r, h] = [BRICK * 0.3, BRICK * 0.2];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = b.lo[0] + (b.size[0] - nx) / 2 + i + 0.5;
      const z = b.lo[2] + (b.size[2] - nz) / 2 + j + 0.5;
      const covered = siblings.some(
        (o) =>
          o !== b &&
          Math.abs(o.lo[1] - top) < 1e-6 &&
          x > o.lo[0] &&
          x < o.lo[0] + o.size[0] &&
          z > o.lo[2] &&
          z < o.lo[2] + o.size[2],
      );
      if (covered) continue;
      const slo: V3 = [x * BRICK - r, hi[1], z * BRICK - r];
      const shi: V3 = [x * BRICK + r, hi[1] + h, z * BRICK + r];
      const sc = corners(slo, shi);
      // No bottom face: the stud sits on the brick.
      faces.push(
        ...orient(
          BOX.filter((_, f) => f !== 2).map((q) => q.map((k) => sc[k] as V3)),
          mid(slo, shi),
        ),
      );
    }
  }
  return faces;
}

/** Octagonal prism filling the box along `axis`, its flat sides touching the box. */
function prism(lo: V3, hi: V3, axis: number): V3[][] {
  const [u = 0, v = 2] = [0, 1, 2].filter((k) => k !== axis);
  const stretch = 1 / Math.cos(Math.PI / 8);
  const ring = (at: number) =>
    Array.from({ length: 8 }, (_, i): V3 => {
      const a = ((i + 0.5) * Math.PI) / 4;
      const p: V3 = [0, 0, 0];
      const half = (k: number) => ((hi[k] ?? 0) - (lo[k] ?? 0)) / 2;
      p[axis] = at;
      p[u] = (lo[u] ?? 0) + half(u) * (1 + stretch * Math.cos(a));
      p[v] = (lo[v] ?? 0) + half(v) * (1 + stretch * Math.sin(a));
      return p;
    });
  const [a, b] = [ring(lo[axis] ?? 0), ring(hi[axis] ?? 0)];
  const sides = a.map((p, i) => [p, a[(i + 1) % 8], b[(i + 1) % 8], b[i]] as V3[]);
  return orient([...sides, a, b], mid(lo, hi));
}

/** Drops degenerate faces and winds the rest counter-clockwise seen from outside. */
function orient(faces: V3[][], centre: V3): V3[][] {
  return faces.flatMap((face) => {
    const pts = face.filter((p, i) => dist(p, face[(i + 1) % face.length] as V3) > 1e-9);
    if (pts.length < 3) return [];
    const n = newell(pts);
    if (n.every((c) => c === 0)) return [];
    const c = pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3).map((x) => x / pts.length) as V3;
    return [dot(n, sub(c, centre)) < 0 ? pts.reverse() : pts];
  });
}

function newell(pts: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  for (const [i, p] of pts.entries()) {
    const q = pts[(i + 1) % pts.length] as V3;
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const len = Math.hypot(...n);
  return len < 1e-12 ? [0, 0, 0] : (n.map((c) => round(c / len)) as V3);
}

// --- glTF -------------------------------------------------------------------------------------

function toGlb(model: Model, team: string): { bytes: Uint8Array; triangles: number } {
  const w = glbWriter();
  const slots: Slot[] = [];
  const meshes: { name: string; primitives: Record<string, unknown>[] }[] = [];
  let triangles = 0;
  const nodes = model.nodes.map((n) => {
    const geo = geometry(n.bricks);
    if (geo.size > 0) {
      meshes.push({
        name: n.name,
        primitives: [...geo].map(([slot, m]) => {
          triangles += m.idx.length / 3;
          const pos = new Float32Array(m.pos);
          const attributes: Record<string, number> = {
            POSITION: w.accessor(pos, "VEC3", { target: ARRAY_BUFFER, ...bounds(pos, 3) }),
            NORMAL: w.accessor(new Float32Array(m.nrm), "VEC3", { target: ARRAY_BUFFER }),
          };
          if (slot === "palette")
            attributes.COLOR_0 = w.accessor(new Float32Array(m.rgb.map(linear)), "VEC3", {
              target: ARRAY_BUFFER,
            });
          const idx = pos.length / 3 > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
          if (!slots.includes(slot)) slots.push(slot);
          return {
            attributes,
            indices: w.accessor(idx, "SCALAR", { target: ELEMENT_ARRAY_BUFFER }),
            material: slots.indexOf(slot),
          };
        }),
      });
    }
    const children = model.nodes.flatMap((c, i) => (c.parent === n.name ? [i] : []));
    return {
      name: n.name,
      ...(geo.size > 0 && { mesh: meshes.length - 1 }),
      ...(n.at.some((c) => c !== 0) && { translation: metres(n.at) }),
      ...(n.rot.some((c) => c !== 0) && { rotation: quat(n.rot) }),
      ...(children.length > 0 && { children }),
    };
  });

  // Every clip keys every animated channel, holding the ones it leaves out at rest, so switching clips never sticks.
  const channels = [
    ...new Set(model.clips.flatMap((c) => c.tracks.map((t) => `${t.node}.${t.path}`))),
  ];
  const animations = model.clips.map((clip) => {
    const samplers = channels.map((channel) => {
      const [nodeName, path] = channel.split(".") as [string, Path];
      const n = model.nodes.find((x) => x.name === nodeName) as Node;
      const rest: V3 = path === "rotation" ? n.rot : path === "scale" ? [1, 1, 1] : [0, 0, 0];
      const keys = clip.tracks.find((t) => `${t.node}.${t.path}` === channel)?.keys ?? [
        [0, rest],
        [clip.duration, rest],
      ];
      const times = new Float32Array(keys.map((k) => k[0]));
      let prev: Q = [0, 0, 0, 1];
      const values = keys.flatMap(([, v]) => {
        if (path === "translation") return metres(add(n.at, v));
        if (path === "scale") return v;
        const q = quat(v);
        prev = dot4(prev, q) < 0 ? (q.map((c) => -c) as Q) : q; // take the short way between keys
        return prev;
      });
      return {
        input: w.accessor(times, "SCALAR", bounds(times, 1)),
        output: w.accessor(new Float32Array(values), path === "rotation" ? "VEC4" : "VEC3"),
        target: { node: model.nodes.indexOf(n), path: PATHS[path] },
      };
    });
    return {
      name: clip.name,
      samplers: samplers.map(({ input, output }) => ({ input, output, interpolation: "LINEAR" })),
      channels: samplers.map((s, sampler) => ({ sampler, target: s.target })),
      extras: { loop: clip.loop, duration: clip.duration },
    };
  });

  const colours = slotColours(hex(team));
  const bytes = w.encode({
    asset: { version: "2.0", generator: "open-neo-rts build-models" },
    scene: 0,
    scenes: [{ nodes: model.nodes.flatMap((n, i) => (n.parent ? [] : [i])) }],
    nodes,
    meshes,
    materials: slots.map((slot) => material(slot, colours[slot])),
    ...(animations.length > 0 && { animations }),
  });
  return { bytes, triangles };
}

function material(slot: Slot, rgb: V3) {
  const [r, g, b] = slot === "palette" ? [1, 1, 1] : rgb.map(linear);
  return {
    name: slot,
    pbrMetallicRoughness: {
      baseColorFactor: [r, g, b, slot === "glass" ? 0.55 : 1],
      metallicFactor: slot === "metal" ? 0.6 : 0,
      roughnessFactor: slot === "metal" ? 0.45 : 0.75,
    },
    ...(slot === "glass" && { alphaMode: "BLEND" }),
    ...(slot.endsWith("emissive") && { emissiveFactor: [r, g, b] }),
  };
}

/** Preview colours (sRGB) per slot, from the faction's default team colour. The renderer owns the real ones. */
function slotColours(team: V3): Record<Slot, V3> {
  return {
    palette: [1, 1, 1],
    team,
    team_dark: team.map((c) => c * 0.55) as V3,
    team_light: team.map((c) => c + (1 - c) * 0.4) as V3,
    team_emissive: team,
    metal: hex("#59606a"),
    glass: hex("#8ec5e6"),
    emissive: hex("#ffc23a"),
  };
}

function bounds(data: Float32Array, width: number): { min: number[]; max: number[] } {
  const min = Array<number>(width).fill(Infinity);
  const max = Array<number>(width).fill(-Infinity);
  data.forEach((v, i) => {
    min[i % width] = Math.min(min[i % width] ?? v, v);
    max[i % width] = Math.max(max[i % width] ?? v, v);
  });
  return { min, max };
}

// --- Derived models ---------------------------------------------------------------------------

/** Wreck: the same part nodes (so the turret keeps its angle), burnt, with small bricks knocked onto the ground. */
function wreck(model: Model, seed: string, darken: number, drop: Set<string>): Model {
  const rand = rng(seed);
  const world = transforms(model);
  const gone = new Set<string>();
  for (const n of model.nodes)
    if (drop.has(n.name) || n.name.startsWith("socket_") || (n.parent && gone.has(n.parent)))
      gone.add(n.name);
  const debris: Brick[] = [];
  const nodes = model.nodes
    .filter((n) => !gone.has(n.name))
    .map((n) => {
      const t = world.get(n.name)?.t ?? [0, 0, 0];
      const bricks = n.bricks.flatMap((b) => {
        const burnt = burn(b, darken * (0.85 + rand() * 0.3));
        if (b.size[0] * b.size[1] * b.size[2] > 1.5 || rand() > 0.3) return [burnt];
        debris.push({
          ...burnt,
          lo: [
            t[0] / BRICK + b.lo[0] + (rand() - 0.5) * 3,
            0,
            t[2] / BRICK + b.lo[2] + (rand() - 0.5) * 3,
          ],
          size: [b.size[0], Math.min(b.size[1], 0.8), b.size[2]],
        });
        return [];
      });
      return { ...n, bricks };
    });
  nodes[0]?.bricks.push(...debris);
  const out: Model = { nodes, clips: [] };
  while (triangles(out) > DERIVED_BUDGET) {
    const n = nodes.find((x) => x.bricks.length > 1);
    n?.bricks.splice(Math.floor(rand() * n.bricks.length), 1);
  }
  return out;
}

/** Rubble: the ground floor's outline and heaps of burnt bricks in the structure's colours. */
function rubble(model: Model, seed: string, darken: number): Model {
  const rand = rng(seed);
  const world = transforms(model);
  const placed = model.nodes.flatMap((n) => {
    const t = world.get(n.name)?.t ?? [0, 0, 0];
    return n.bricks.map((b) => ({ ...b, lo: add(b.lo, t.map((c) => c / BRICK) as V3) }));
  });
  const minX = Math.floor(Math.min(...placed.map((b) => b.lo[0])));
  const minZ = Math.floor(Math.min(...placed.map((b) => b.lo[2])));
  const W = Math.ceil(Math.max(...placed.map((b) => b.lo[0] + b.size[0]))) - minX;
  const D = Math.ceil(Math.max(...placed.map((b) => b.lo[2] + b.size[2]))) - minZ;
  const height = new Array<number>(W * D).fill(0);
  const cells = (x0: number, z0: number, w: number, d: number) => {
    const out: number[] = [];
    for (let x = Math.max(0, Math.floor(x0 - minX)); x < Math.min(W, Math.ceil(x0 + w - minX)); x++)
      for (
        let z = Math.max(0, Math.floor(z0 - minZ));
        z < Math.min(D, Math.ceil(z0 + d - minZ));
        z++
      )
        out.push(x * D + z);
    return out;
  };
  const bricks: Brick[] = placed
    .filter((b) => b.lo[1] <= 0.25 && b.size[0] * b.size[2] >= 1)
    .map((b) => {
      const size: V3 = [b.size[0], Math.min(b.size[1], 0.6), b.size[2]];
      for (const c of cells(b.lo[0], b.lo[2], size[0], size[2]))
        height[c] = Math.max(height[c] ?? 0, b.lo[1] + size[1]);
      return { ...burn(b, darken), size, shape: b.shape.startsWith("cyl") ? b.shape : "box" };
    });
  const heaps = Array.from({ length: 3 }, () => [
    minX + W * (0.25 + 0.5 * rand()),
    minZ + D * (0.25 + 0.5 * rand()),
  ]);
  const spread = () => rand() + rand() + rand() - 1.5;
  const count = Math.min(
    Math.floor((DERIVED_BUDGET - triangles({ nodes: [rubbleNode(bricks)], clips: [] })) / 12),
    Math.round((W * D) / 5),
  );
  for (let i = 0; i < count; i++) {
    const src = placed[Math.floor(rand() * placed.length)] as Brick;
    const [hx = 0, hz = 0] = heaps[i % heaps.length] ?? [];
    const [w, h, d] = [
      1 + Math.floor(rand() * 3),
      0.6 + Math.floor(rand() * 2) * 0.4,
      1 + Math.floor(rand() * 3),
    ];
    const x0 = Math.min(Math.max(Math.round(hx + spread() * W * 0.3 - w / 2), minX), minX + W - w);
    const z0 = Math.min(Math.max(Math.round(hz + spread() * D * 0.3 - d / 2), minZ), minZ + D - d);
    const under = cells(x0, z0, w, d);
    const y = Math.max(0, ...under.map((c) => height[c] ?? 0));
    for (const c of under) height[c] = y + h;
    bricks.push({
      ...burn(src, darken * (0.7 + rand() * 0.5)),
      lo: [x0, y, z0],
      size: [w, h, d],
      shape: "box",
    });
  }
  return { nodes: [rubbleNode(bricks)], clips: [] };
}

const rubbleNode = (bricks: Brick[]): Node => ({
  name: "rubble",
  at: [0, 0, 0],
  rot: [0, 0, 0],
  bricks,
});

function burn(b: Brick, amount: number): Brick {
  const base: V3 = b.slot.startsWith("team") ? [0.5, 0.5, 0.52] : b.rgb;
  const soot: V3 = [0.12, 0.11, 0.1];
  const k = Math.min(1, amount);
  return {
    ...b,
    slot: "palette",
    rgb: base.map((c, i) => c + ((soot[i] ?? 0) - c) * k) as V3,
    studs: false,
  };
}

function triangles(model: Model): number {
  return model.nodes.reduce(
    (n, node) => n + [...geometry(node.bricks).values()].reduce((k, m) => k + m.idx.length / 3, 0),
    0,
  );
}

/** Small seeded generator (xorshift32), so derived models come out the same on every build. */
function rng(seed: string): () => number {
  let s =
    [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// --- Icon -------------------------------------------------------------------------------------

/** Three-quarter view of the rest pose, flat-shaded with a depth buffer and outlined: 128 × 128, transparent. */
function icon(model: Model): Uint8Array {
  const SS = 2; // supersampling
  const size = 128 * SS;
  const deg = Math.PI / 180;
  const [yaw, pitch] = [35 * deg, 30 * deg];
  const toCamera: V3 = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const right: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = cross(toCamera, right);
  const light = normalize(add(add(scale(right, -0.5), [0, 0.9, 0]), scale(toCamera, 0.4)));
  const world = transforms(model);
  const tris: { p: V3[]; rgb: V3 }[] = [];
  for (const n of model.nodes) {
    const { t, q } = world.get(n.name) ?? { t: [0, 0, 0] as V3, q: [0, 0, 0, 1] as Q };
    for (const [slot, m] of geometry(n.bricks)) {
      const at = (i: number): V3 => [
        m.pos[i * 3] ?? 0,
        m.pos[i * 3 + 1] ?? 0,
        m.pos[i * 3 + 2] ?? 0,
      ];
      for (let i = 0; i < m.idx.length; i += 3) {
        const [a = 0, b = 0, c = 0] = m.idx.slice(i, i + 3);
        const normal = rotate(q, [m.nrm[a * 3] ?? 0, m.nrm[a * 3 + 1] ?? 0, m.nrm[a * 3 + 2] ?? 0]);
        const shade = slot.endsWith("emissive")
          ? 1.1
          : 0.45 + 0.65 * Math.max(0, dot(normal, light));
        tris.push({
          p: [a, b, c].map((v) => {
            const p = add(rotate(q, at(v)), t);
            return [dot(p, right), -dot(p, up), dot(p, toCamera)] as V3;
          }),
          rgb: [0, 1, 2].map((k) => Math.min(1, (m.rgb[a * 3 + k] ?? 0) * shade)) as V3,
        });
      }
    }
  }
  const all = tris.flatMap((t) => t.p);
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const fit = (size * 0.86) / Math.max(x1 - x0, y1 - y0, 1e-6);
  const [ox, oy] = [
    (size - (x1 - x0) * fit) / 2 - x0 * fit,
    (size - (y1 - y0) * fit) / 2 - y0 * fit,
  ];
  const depth = new Array<number>(size * size).fill(-Infinity);
  const rgba = new Uint8Array(size * size * 4);
  for (const { p, rgb } of tris) {
    const [a, b, c] = p.map(([x, y, z]) => [x * fit + ox, y * fit + oy, z] as V3) as [V3, V3, V3];
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    const xs = [a[0], b[0], c[0]];
    const ys = [a[1], b[1], c[1]];
    const [left, top] = [
      Math.max(0, Math.floor(Math.min(...xs))),
      Math.max(0, Math.floor(Math.min(...ys))),
    ];
    const [rgt, bottom] = [
      Math.min(size - 1, Math.ceil(Math.max(...xs))),
      Math.min(size - 1, Math.ceil(Math.max(...ys))),
    ];
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= rgt; x++) {
        const [px, py] = [x + 0.5, y + 0.5];
        const wa = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const wb = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const z = wa * a[2] + wb * b[2] + wc * c[2];
        const i = y * size + x;
        if (z <= (depth[i] ?? 0)) continue;
        depth[i] = z;
        rgba.set([...rgb.map((v) => Math.round(v * 255)), 255], i * 4);
      }
    }
  }
  // Outline at full resolution, then average 2 × 2 blocks down to 128 × 128.
  const big = outline(rgba, size, 2 * SS);
  const out = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const sum = [0, 0, 0, 0];
      for (let k = 0; k < SS * SS; k++) {
        const i = ((y * SS + Math.floor(k / SS)) * size + x * SS + (k % SS)) * 4;
        const alpha = big[i + 3] ?? 0;
        for (let ch = 0; ch < 3; ch++) sum[ch] = (sum[ch] ?? 0) + (big[i + ch] ?? 0) * alpha;
        sum[3] = (sum[3] ?? 0) + alpha;
      }
      const a = sum[3] ?? 0;
      if (a > 0)
        out.set(
          [...sum.slice(0, 3).map((v) => Math.round(v / a)), Math.round(a / (SS * SS))],
          (y * 128 + x) * 4,
        );
    }
  }
  return png(out, 128);
}

// --- Maths ------------------------------------------------------------------------------------

/** Rest-pose world transform of every node, in metres. */
function transforms(model: Model): Map<string, { t: V3; q: Q }> {
  const out = new Map<string, { t: V3; q: Q }>();
  for (const n of model.nodes) {
    const parent = n.parent ? out.get(n.parent) : undefined;
    const local = metres(n.at);
    out.set(
      n.name,
      parent
        ? { t: add(parent.t, rotate(parent.q, local)), q: mul(parent.q, quat(n.rot)) }
        : { t: local, q: quat(n.rot) },
    );
  }
  return out;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
const metres = (v: V3): V3 => v.map((c) => round(c * BRICK)) as V3;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dot4 = (a: Q, b: Q) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const dist = (a: V3, b: V3) => Math.hypot(...sub(a, b));
const mid = (a: V3, b: V3): V3 => scale(add(a, b), 0.5);
const normalize = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Quaternion [x, y, z, w] from Euler degrees, applied X, then Y, then Z. */
function quat([x, y, z]: V3): Q {
  const [hx, hy, hz] = [x, y, z].map((a) => (a * Math.PI) / 360) as V3;
  const [sx, cx, sy, cy, sz, cz] = [
    Math.sin(hx),
    Math.cos(hx),
    Math.sin(hy),
    Math.cos(hy),
    Math.sin(hz),
    Math.cos(hz),
  ];
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ].map(round) as Q;
}

function mul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function rotate(q: Q, v: V3): V3 {
  const u: V3 = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

function hex(colour: string): V3 {
  return [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16) / 255) as V3;
}

function linear(c: number): number {
  return round(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
}
