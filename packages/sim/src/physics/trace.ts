import { weaponTargets } from "../features/combat";
import type { Definition } from "../features/entities";
import { Health, OwnerForce, Template, Transform } from "../features/entities";
import type { GameplayWeapon } from "../features/entities/weapons";
import type { Point } from "../features/movement/segment";
import type { Kernel } from "../kernel";

export interface Fraction {
  readonly n: bigint;
  readonly d: bigint;
}
export interface Contact extends Point {
  readonly entity: number;
  readonly kind: "entity" | "terrain" | "boundary";
  readonly at: Fraction;
}
const zero: Fraction = { n: 0n, d: 1n },
  one: Fraction = { n: 1n, d: 1n };
const compare = (a: Fraction, b: Fraction) => a.n * b.d - b.n * a.d;
const fraction = (n: number, d: number): Fraction =>
  d < 0 ? { n: BigInt(0 - n), d: BigInt(0 - d) } : { n: BigInt(n), d: BigInt(d) };

/** Exact integer square root for contact discriminants that exceed Number's safe range. */
export function bigSqrt(value: bigint): bigint {
  if (value < 0n) throw new RangeError("Negative contact discriminant");
  if (value < 2n) return value;
  let x = value,
    next = (x + 1n) / 2n;
  while (next < x) {
    x = next;
    next = (x + value / x) / 2n;
  }
  return x;
}

function box(
  a: Point,
  b: Point,
  bounds: readonly [number, number, number, number],
): { enter: Fraction; exit: Fraction } | undefined {
  let enter = zero,
    exit = one;
  for (const [origin, delta, low, high] of [
    [a.x, b.x - a.x, bounds[0], bounds[2]],
    [a.y, b.y - a.y, bounds[1], bounds[3]],
  ] as const) {
    if (delta === 0) {
      if (origin < low || origin > high) return;
      continue;
    }
    let first = fraction(low - origin, delta),
      last = fraction(high - origin, delta);
    if (compare(first, last) > 0n) [first, last] = [last, first];
    if (compare(first, enter) > 0n) enter = first;
    if (compare(last, exit) < 0n) exit = last;
    if (compare(enter, exit) > 0n) return;
  }
  return { enter, exit };
}
function circle(a: Point, b: Point, centre: Point, radius: number): Fraction | undefined {
  const dx = BigInt(b.x - a.x),
    dy = BigInt(b.y - a.y),
    x = BigInt(a.x - centre.x),
    y = BigInt(a.y - centre.y);
  const length = dx * dx + dy * dy,
    dot = x * dx + y * dy,
    outside = x * x + y * y - BigInt(radius) * BigInt(radius);
  if (outside <= 0n) return zero;
  if (length === 0n) return;
  const discriminant = dot * dot - length * outside;
  if (discriminant < 0n) return;
  // The first representable contact is at most one subcell beyond the exact irrational root.
  const scale = 1n << 32n;
  const n = (0n - dot) * scale - bigSqrt(discriminant * scale * scale),
    d = length * scale;
  return n >= 0n && n <= d ? { n, d } : undefined;
}
function point(a: Point, b: Point, at: Fraction): Point {
  return {
    x: a.x + Number((BigInt(b.x - a.x) * at.n) / at.d),
    y: a.y + Number((BigInt(b.y - a.y) * at.n) / at.d),
  };
}

export function entityBounds(
  kernel: Kernel,
  definitions: readonly Definition[],
  id: number,
): readonly [number, number, number, number] | undefined {
  const world = kernel.world,
    definition = definitions[world.get(id, Template, "definition")];
  if (!definition?.footprint) return;
  const x = world.get(id, Transform, "x"),
    y = world.get(id, Transform, "y"),
    [w, d] = definition.footprint;
  const turned = (((world.get(id, Transform, "facing") >>> 14) + 3) & 1) !== 0;
  return [x, y, x + (turned ? d : w) * 1024, y + (turned ? w : d) * 1024];
}

/** Swept contact, ordered by exact fractions then stable entity ID; no per-tick tunnelling. */
export function traceProjectile(
  kernel: Kernel,
  definitions: readonly Definition[],
  input: {
    a: Point;
    b: Point;
    shooter: number;
    force: number;
    air: boolean;
    level: number;
    weapon: GameplayWeapon;
    motion?: ReadonlyMap<number, Point>;
    duration?: Fraction;
  },
): Contact | undefined {
  const { a, b, weapon, force } = input,
    { world } = kernel;
  let hit: Contact | undefined;
  const offer = (at: Fraction | undefined, entity: number, kind: Contact["kind"]) => {
    if (!at || compare(at, zero) < 0n || compare(at, one) > 0n) return;
    if (!hit || compare(at, hit.at) < 0n || (compare(at, hit.at) === 0n && entity < hit.entity))
      hit = { ...point(a, b, at), at, entity, kind };
  };
  const blockers = weapon.projectile.blockedBy ?? [];
  for (const entity of world.query(Template, Transform, OwnerForce, Health)) {
    if (entity === input.shooter || world.get(entity, Health, "current") === 0) continue;
    const definition = definitions[world.get(entity, Template, "definition")];
    if (!definition) continue;
    const kind = definition.id.split(":")[0]?.split(".").at(-1);
    if (kind !== "unit" && kind !== "structure") continue;
    if (kind === "unit" && (definition.domain === "air") !== input.air) continue;
    const other = world.get(entity, OwnerForce, "force");
    const hostile = kernel.vision?.groupForForce(force) !== kernel.vision?.groupForForce(other);
    const target = hostile && weaponTargets(weapon, definition);
    if (!target && !blockers.includes(kind === "structure" ? "structures" : "units")) continue;
    const bounds = entityBounds(kernel, definitions, entity);
    const centre = { x: world.get(entity, Transform, "x"), y: world.get(entity, Transform, "y") },
      previous = input.motion?.get(entity) ?? centre;
    const end = input.duration
      ? {
          x:
            previous.x +
            Number((BigInt(centre.x - previous.x) * input.duration.n) / input.duration.d),
          y:
            previous.y +
            Number((BigInt(centre.y - previous.y) * input.duration.n) / input.duration.d),
        }
      : centre;
    const at = bounds
      ? box(a, b, bounds)?.enter
      : circle(
          { x: a.x - previous.x, y: a.y - previous.y },
          { x: b.x - end.x, y: b.y - end.y },
          { x: 0, y: 0 },
          definition.radiusSubcells ?? 0,
        );
    offer(at, entity, "entity");
  }
  const terrain = kernel.map?.terrain;
  if (!terrain) return hit;
  const worldBox = box(a, b, [0, 0, terrain.width * 1024 - 1, terrain.height * 1024 - 1]);
  if (worldBox && compare(worldBox.exit, one) < 0n) offer(worldBox.exit, 0, "boundary");
  if (!blockers.includes("terrain")) return hit;
  let x = Math.floor(a.x / 1024),
    y = Math.floor(a.y / 1024);
  const endX = Math.floor(b.x / 1024),
    endY = Math.floor(b.y / 1024);
  const dx = b.x - a.x,
    dy = b.y - a.y,
    ax = Math.abs(dx),
    ay = Math.abs(dy),
    sx = Math.sign(dx),
    sy = Math.sign(dy);
  let nextX = sx > 0 ? (x + 1) * 1024 - a.x : a.x - x * 1024;
  let nextY = sy > 0 ? (y + 1) * 1024 - a.y : a.y - y * 1024;
  const inspect = (cx: number, cy: number, at: Fraction) => {
    if (
      cx >= 0 &&
      cy >= 0 &&
      cx < terrain.width &&
      cy < terrain.height &&
      (terrain.level[cy * terrain.width + cx] ?? 0) > input.level
    )
      offer(at, 0, "terrain");
  };
  inspect(x, y, zero);
  for (
    let crossings = 0;
    crossings < terrain.width + terrain.height && (x !== endX || y !== endY);
    crossings++
  ) {
    const comparison = ax === 0 ? 1 : ay === 0 ? -1 : nextX * ay - nextY * ax;
    const at = comparison <= 0 ? fraction(nextX, ax) : fraction(nextY, ay);
    if (compare(at, one) > 0n) break;
    if (comparison === 0) {
      inspect(x + sx, y, at);
      inspect(x, y + sy, at);
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
    inspect(x, y, at);
  }
  return hit;
}
