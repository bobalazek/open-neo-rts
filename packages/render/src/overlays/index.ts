// Presentation of copied debug diagnostics only; no world or gameplay imports.
import {
  Color3,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import type { GroundDomain, TerrainGrid } from "@open-neo-rts/content";
import type { DebugOverlayData } from "@open-neo-rts/sim";
import { CELL_SIZE, terrainHeight, waterHeight } from "../terrain";

export interface DebugOverlayVisibility {
  grid: boolean;
  heights: boolean;
  navigation: GroundDomain | null;
  paths: boolean;
}
const LEVEL_COLORS = [
  "#24557a",
  "#317fa0",
  "#40a79b",
  "#83c66d",
  "#d9d65c",
  "#e6ac58",
  "#dd785d",
  "#b76fb3",
];
const COST_COLORS = ["#f05a67", "#53d8ec", "#67d68c", "#f4bd5b"];

/** One owner per worker session. Disabled/replaced overlays release all their geometry. */
export function createDebugOverlays(scene: Scene) {
  let terrain: TerrainGrid | undefined;
  let navigation: DebugOverlayData["navigation"];
  let paths: NonNullable<DebugOverlayData["paths"]> = [];
  let options: DebugOverlayVisibility = {
    grid: false,
    heights: false,
    navigation: null,
    paths: false,
  };
  const meshes = new Map<string, Mesh>();
  let disposed = false;
  function clear(name: string) {
    meshes.get(name)?.dispose(false, true);
    meshes.delete(name);
  }
  const height = (x: number, y: number) =>
    terrain ? Math.max(terrainHeight(terrain, x, y), waterHeight(terrain, x, y)) : 0;
  const vertex = (x: number, y: number, lift: number) =>
    new Vector3(x * CELL_SIZE, height(x, y) + lift, y * CELL_SIZE);
  function lines(name: string, segments: Vector3[][], color: string) {
    clear(name);
    if (!segments.length) return;
    const mesh = MeshBuilder.CreateLineSystem(`debug ${name}`, { lines: segments }, scene);
    mesh.color = Color3.FromHexString(color);
    mesh.isPickable = false;
    meshes.set(name, mesh);
  }
  function cells(name: string, inset: number, colorFor: (cell: number) => string, lift: number) {
    clear(name);
    if (!terrain) return;
    const positions: number[] = [],
      indices: number[] = [],
      colors: number[] = [],
      normals: number[] = [];
    for (let y = 0; y < terrain.height; y++)
      for (let x = 0; x < terrain.width; x++) {
        const color = Color3.FromHexString(colorFor(y * terrain.width + x));
        const start = positions.length / 3;
        for (const [dx, dy] of [
          [inset, inset],
          [1 - inset, inset],
          [1 - inset, 1 - inset],
          [inset, 1 - inset],
        ] as const) {
          const px = x + dx,
            py = y + dy;
          // Sample inside this cell; neighbouring cliff tops cannot lift this overlay corner.
          positions.push(
            px * CELL_SIZE,
            height(
              Math.min(x + 1 - 1e-6, Math.max(x + 1e-6, px)),
              Math.min(y + 1 - 1e-6, Math.max(y + 1e-6, py)),
            ) + lift,
            py * CELL_SIZE,
          );
          colors.push(color.r, color.g, color.b, 1);
          normals.push(0, 1, 0);
        }
        indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
      }
    const mesh = new Mesh(`debug ${name}`, scene);
    const data = new VertexData();
    Object.assign(data, { positions, indices, colors, normals });
    data.applyToMesh(mesh);
    const material = new StandardMaterial(`debug ${name}`, scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.alpha = 0.55;
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.isPickable = false;
    meshes.set(name, mesh);
  }
  function drawTerrain() {
    clear("grid");
    clear("heights");
    if (!terrain) return;
    if (options.grid) {
      const segments: Vector3[][] = [];
      for (let y = 0; y < terrain.height; y++)
        for (let x = 0; x < terrain.width; x++) {
          const a = vertex(x + 1e-6, y + 1e-6, 0.09),
            b = vertex(x + 1 - 1e-6, y + 1e-6, 0.09),
            c = vertex(x + 1 - 1e-6, y + 1 - 1e-6, 0.09),
            d = vertex(x + 1e-6, y + 1 - 1e-6, 0.09);
          segments.push([a, b, c, d, a]);
        }
      lines("grid", segments, "#e4eef6");
    }
    if (options.heights)
      cells("heights", 0, (cell) => LEVEL_COLORS[terrain?.level[cell] ?? 0] ?? "#24557a", 0.04);
  }
  function drawNavigation() {
    clear("navigation");
    clear("connections");
    if (
      !terrain ||
      !options.navigation ||
      navigation?.domain !== options.navigation ||
      navigation.width !== terrain.width ||
      navigation.height !== terrain.height
    )
      return;
    const nav = navigation;
    cells(
      "navigation",
      0.18,
      (cell) => COST_COLORS[Math.min(nav.cost[cell] ?? 0, 3)] ?? "#f05a67",
      0.07,
    );
    const blocked: Vector3[][] = [];
    for (let y = 0; y < terrain.height; y++)
      for (let x = 0; x < terrain.width; x++) {
        const cell = y * terrain.width + x;
        if (!nav.cost[cell]) continue;
        if (
          x + 1 < terrain.width &&
          nav.cost[cell + 1] &&
          !((nav.connections[cell] ?? 0) & (1 << 4))
        )
          blocked.push([vertex(x + 1, y + 0.05, 0.12), vertex(x + 1, y + 0.95, 0.12)]);
        if (
          y + 1 < terrain.height &&
          nav.cost[cell + terrain.width] &&
          !((nav.connections[cell] ?? 0) & (1 << 6))
        )
          blocked.push([vertex(x + 0.05, y + 1, 0.12), vertex(x + 0.95, y + 1, 0.12)]);
      }
    lines("connections", blocked, "#ff5266");
  }
  function drawPaths() {
    clear("paths");
    clear("targets");
    if (!terrain || !options.paths) return;
    lines(
      "paths",
      paths
        .filter((path) => path.points.length > 1)
        .map((path) =>
          path.points.flatMap((point, index) => {
            const previous = path.points[index - 1];
            if (!previous) return [vertex(point.x / 1024, point.y / 1024, 0.17)];
            // Drape the authoritative segment over terrain; these samples add no route waypoints.
            const steps = Math.max(
              1,
              Math.ceil(
                Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)) / 512,
              ),
            );
            return Array.from({ length: steps }, (_, sample) => {
              const t = (sample + 1) / steps;
              return vertex(
                (previous.x + (point.x - previous.x) * t) / 1024,
                (previous.y + (point.y - previous.y) * t) / 1024,
                0.17,
              );
            });
          }),
        ),
      "#64e5ff",
    );
    const targets = paths.flatMap(({ target }) => {
      const x = target.x / 1024,
        y = target.y / 1024;
      return [
        [vertex(x - 0.15, y, 0.18), vertex(x + 0.15, y, 0.18)],
        [vertex(x, y - 0.15, 0.18), vertex(x, y + 0.15, 0.18)],
      ];
    });
    lines("targets", targets, "#ffd265");
  }
  return {
    configure(next: DebugOverlayVisibility) {
      if (disposed) return;
      const before = options;
      options = { ...next };
      if (before.grid !== next.grid || before.heights !== next.heights) drawTerrain();
      if (before.navigation !== next.navigation) {
        navigation = undefined;
        drawNavigation();
      }
      if (before.paths !== next.paths) {
        paths = [];
        drawPaths();
      }
    },
    accept(data: DebugOverlayData) {
      if (disposed) return;
      if (data.terrain) {
        const t = data.terrain;
        terrain = {
          width: t.width,
          height: t.height,
          level: Uint8Array.from(t.level),
          ramp: Uint8Array.from(t.ramp),
          water: Uint8Array.from(t.water),
          surface: Uint8Array.from(t.surface),
          biome: Uint8Array.from(t.biome),
        };
        drawTerrain();
      }
      if (data.navigation && data.navigation.domain === options.navigation) {
        navigation = data.navigation;
        drawNavigation();
      }
      if (data.paths) {
        paths = options.paths ? data.paths : [];
        drawPaths();
      }
    },
    dispose() {
      disposed = true;
      for (const name of [...meshes.keys()]) clear(name);
      terrain = undefined;
      paths = [];
      navigation = undefined;
    },
  };
}
