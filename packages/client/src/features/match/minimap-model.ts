import type { GameplayDefinition, SeatSnapshot } from "@open-neo-rts/sim";

export interface MapPoint {
  x: number;
  y: number;
}
export interface MinimapMarker extends MapPoint {
  kind: "unit" | "structure" | "ghost";
  force: number;
  width: number;
  height: number;
  handle: string;
}

/** Missing, mismatched or debug fog fails closed. Multiple permitted vision groups form a union. */
export function minimapVision(snapshot: SeatSnapshot, width: number, height: number) {
  const cells = new Uint8Array(width * height);
  if (snapshot.mode !== "controlled") return cells;
  for (const grid of snapshot.fog ?? []) {
    if (grid.width !== width || grid.height !== height || grid.cells.length !== cells.length)
      continue;
    for (let i = 0; i < cells.length; i++) cells[i] = Math.max(cells[i] ?? 0, grid.cells[i] ?? 0);
  }
  return cells;
}

export function minimapPoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): MapPoint | null {
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY)
  )
    return null;
  return {
    x: Math.max(
      0,
      Math.min(width - 1, Math.floor(((clientX - bounds.left) * width) / bounds.width)),
    ),
    y: Math.max(
      0,
      Math.min(height - 1, Math.floor(((clientY - bounds.top) * height) / bounds.height)),
    ),
  };
}

/** Marker inputs are public live records or explicit last-seen structure records, never a World. */
export function minimapMarkers(
  snapshot: SeatSnapshot,
  definitions: ReadonlyMap<string, GameplayDefinition>,
  width: number,
  height: number,
  ownForce: number,
  vision = minimapVision(snapshot, width, height),
) {
  if (snapshot.mode !== "controlled") return [];
  const markers: MinimapMarker[] = [];
  const cell = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height ? (vision[y * width + x] ?? 0) : 0;
  function add(
    entity: SeatSnapshot["entities"][number] | NonNullable<SeatSnapshot["ghosts"]>[number],
    ghost: boolean,
  ) {
    const definition = definitions.get(entity.definition);
    if (!definition || (definition.kind !== "unit" && definition.kind !== "structure")) return;
    if (ghost && definition.kind !== "structure") return;
    const structure = definition.kind === "structure";
    const [w = 1, h = 1] = structure ? (definition.footprint ?? []) : [];
    const turned = (((entity.facing >>> 14) + 3) & 1) !== 0;
    const dx = turned ? h : w,
      dy = turned ? w : h;
    const originX = Math.floor(entity.x / 1024),
      originY = Math.floor(entity.y / 1024);
    let known = !ghost && entity.force === ownForce;
    for (let y = 0; y < dy && !known; y++)
      for (let x = 0; x < dx && !known; x++)
        known = ghost ? cell(originX + x, originY + y) >= 1 : cell(originX + x, originY + y) === 2;
    if (!known) return;
    const x = structure ? originX + dx / 2 : entity.x / 1024,
      y = structure ? originY + dy / 2 : entity.y / 1024;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    markers.push({
      kind: ghost ? "ghost" : structure ? "structure" : "unit",
      force: entity.force,
      x,
      y,
      width: structure ? dx : 0,
      height: structure ? dy : 0,
      handle: entity.handle,
    });
  }
  for (const ghost of snapshot.ghosts ?? [])
    if (
      snapshot.fog?.some(
        (grid) => grid.group === ghost.group && grid.width === width && grid.height === height,
      )
    )
      add(ghost, true);
  for (const entity of snapshot.entities) if (entity.health > 0) add(entity, false);
  return markers;
}

/** Home never falls back to another Force's spawn or an unobserved map object. */
export function ownBase(
  snapshot: SeatSnapshot,
  definitions: ReadonlyMap<string, GameplayDefinition>,
  force: number,
): MapPoint | null {
  const structures = snapshot.entities.filter(
    (entity) =>
      entity.force === force &&
      entity.health > 0 &&
      !entity.constructionSite &&
      definitions.get(entity.definition)?.kind === "structure",
  );
  const base =
    structures.find((entity) => definitions.get(entity.definition)?.role === "headquarters") ??
    structures[0];
  const definition = base && definitions.get(base.definition);
  if (!base || !definition) return null;
  const [w = 1, h = 1] = definition.footprint ?? [];
  const turned = (((base.facing >>> 14) + 3) & 1) !== 0;
  return { x: base.x / 1024 + (turned ? h : w) / 2, y: base.y / 1024 + (turned ? w : h) / 2 };
}
