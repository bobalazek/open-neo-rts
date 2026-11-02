import { type Definition, OwnerForce, Template, Transform } from "../features/entities";
import type { GameplayWeapon } from "../features/entities/weapons";
import { clearsBarrier, type Point } from "../features/movement/segment";
import type { Kernel } from "../kernel";

/** Unit origins are centres; static origins are top-left corners of the rotated footprint. */
export function combatPoint(
  kernel: Kernel,
  definitions: readonly Definition[],
  entity: number,
): Point {
  const world = kernel.world;
  const definition = definitions[world.get(entity, Template, "definition")];
  let x = world.get(entity, Transform, "x"),
    y = world.get(entity, Transform, "y");
  if (definition?.footprint) {
    const [w, d] = definition.footprint;
    const rotated = (((world.get(entity, Transform, "facing") >>> 14) + 3) & 1) !== 0;
    x += (rotated ? d : w) * 512;
    y += (rotated ? w : d) * 512;
  }
  return { x, y };
}

/** Launch clearance only. Projectile motion, first-hit contact and impacts belong to 2-14. */
export function clearFireLine(
  kernel: Kernel,
  definitions: readonly Definition[],
  shooter: number,
  target: number,
  weapon: GameplayWeapon,
): boolean {
  if (["arc", "grenade", "dropped"].includes(weapon.projectile.kind)) return true;
  const blockers = weapon.projectile.blockedBy ?? [];
  if (!blockers.length) return true;
  const a = combatPoint(kernel, definitions, shooter),
    b = combatPoint(kernel, definitions, target);
  const world = kernel.world;
  for (const id of world.query(Template, Transform, OwnerForce)) {
    if (id === shooter || id === target) continue;
    const definition = definitions[world.get(id, Template, "definition")];
    const kind = definition?.id.split(":")[0]?.split(".").at(-1);
    const x = world.get(id, Transform, "x"),
      y = world.get(id, Transform, "y");
    if (kind === "structure" && blockers.includes("structures") && definition?.footprint) {
      const [w, d] = definition.footprint;
      const rotated = (((world.get(id, Transform, "facing") >>> 14) + 3) & 1) !== 0;
      if (
        !clearsBarrier(0, a, b, [x, y, x + (rotated ? d : w) * 1024, y + (rotated ? w : d) * 1024])
      )
        return false;
    } else if (
      kind === "unit" &&
      blockers.includes("units") &&
      !clearsBarrier(definition?.radiusSubcells ?? 0, a, b, [x, y, x, y])
    )
      return false;
  }
  const terrain = kernel.map?.terrain;
  if (!terrain || !blockers.includes("terrain")) return true;
  let x = Math.floor(a.x / 1024),
    y = Math.floor(a.y / 1024);
  const tx = Math.floor(b.x / 1024),
    ty = Math.floor(b.y / 1024);
  const level = Math.max(
    terrain.level[y * terrain.width + x] ?? 0,
    terrain.level[ty * terrain.width + tx] ?? 0,
  );
  const blocked = (cx: number, cy: number) => (terrain.level[cy * terrain.width + cx] ?? 0) > level;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const ax = Math.abs(dx),
    ay = Math.abs(dy),
    sx = Math.sign(dx),
    sy = Math.sign(dy);
  let nextX = sx > 0 ? (x + 1) * 1024 - a.x : a.x - x * 1024;
  let nextY = sy > 0 ? (y + 1) * 1024 - a.y : a.y - y * 1024;
  for (let crossing = 0; crossing < terrain.width + terrain.height; crossing++) {
    if (x === tx && y === ty) return true;
    const comparison = ax === 0 ? 1 : ay === 0 ? -1 : nextX * ay - nextY * ax;
    if (comparison === 0) {
      if (blocked(x + sx, y) || blocked(x, y + sy)) return false;
      x += sx;
      y += sy;
      nextX += 1024;
      nextY += 1024;
    } else if (comparison < 0) {
      x += sx;
      nextX += 1024;
    } else {
      y += sy;
      nextY += 1024;
    }
    if (blocked(x, y)) return false;
  }
  return false;
}
