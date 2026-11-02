import { defineComponent, type World } from "../../ecs";
import { type Feature, type Kernel, register } from "../../kernel";
import { compileOreCells } from "../../match-map";

export const ORE_REGROWTH_TICKS = 20 * 10;
/** One row per covered map cell, including covered cells with zero initial capacity. */
export const OreCell = defineComponent("OreCell", {
  cell: "u32",
  cap: "i32",
  remaining: "i32",
  regrowthTicks: "u16",
});
export interface OreCellSnapshot {
  readonly cell: number;
  readonly cap: number;
  readonly remaining: number;
  readonly regrowthTicks: number;
}

function row(world: World, entity: number): OreCellSnapshot | undefined {
  const value = {
    cell: world.get(entity, OreCell, "cell"),
    cap: world.get(entity, OreCell, "cap"),
    remaining: world.get(entity, OreCell, "remaining"),
    regrowthTicks: world.get(entity, OreCell, "regrowthTicks"),
  };
  return value.cap >= 0 &&
    value.remaining >= 0 &&
    value.remaining <= value.cap &&
    value.regrowthTicks < ORE_REGROWTH_TICKS
    ? value
    : undefined;
}

/** Trusted engine observation only; shared deposit amounts require visibility before seat publication. */
export function oreCells(world: World): OreCellSnapshot[] {
  const ids = world.query(OreCell);
  const counts = new Map<number, number>();
  for (const entity of ids) {
    const cell = world.get(entity, OreCell, "cell");
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  const rows = ids.map((entity) => row(world, entity)).filter((value) => value !== undefined);
  return rows.filter((value) => counts.get(value.cell) === 1).sort((a, b) => a.cell - b.cell);
}

/** Returns a copy; unknown/invalid/ambiguous cells cannot supply ore. */
export function readOreCell(world: World, cell: number): OreCellSnapshot | undefined {
  if (!Number.isInteger(cell) || cell < 0 || cell > 0xffffffff) return;
  const ids = world.query(OreCell).filter((entity) => world.get(entity, OreCell, "cell") === cell);
  return ids.length === 1 ? row(world, ids[0] as number) : undefined;
}

/** Removes at most the requested whole stock. The hauling system must bound this by free cargo. */
export function mineOreCell(world: World, cell: number, requested: number): number {
  if (!Number.isInteger(requested) || requested < 0 || requested > 0x7fffffff) return 0;
  const value = readOreCell(world, cell);
  if (!value) return 0;
  const amount = Math.min(value.remaining, requested);
  if (amount > 0) {
    const entity = world
      .query(OreCell)
      .find((entity) => world.get(entity, OreCell, "cell") === cell) as number;
    world.set(entity, OreCell, "remaining", value.remaining - amount);
  }
  return amount;
}

function regrowOre(kernel: Kernel): void {
  const { width, height } = kernel.map?.terrain ?? { width: 0, height: 0 };
  const { world } = kernel;
  const before = new Map(oreCells(world).map((value) => [value.cell, value]));
  for (const entity of world.query(OreCell)) {
    const value = before.get(world.get(entity, OreCell, "cell"));
    if (!value || value.cell >= width * height) continue;
    if (value.remaining === value.cap) {
      world.set(entity, OreCell, "regrowthTicks", 0);
      continue;
    }
    const x = value.cell % width,
      y = Math.floor(value.cell / width);
    const neighbours = [
      ...(x > 0 ? [value.cell - 1] : []),
      ...(x + 1 < width ? [value.cell + 1] : []),
      ...(y > 0 ? [value.cell - width] : []),
      ...(y + 1 < height ? [value.cell + width] : []),
    ];
    if (value.remaining === 0 && !neighbours.some((cell) => (before.get(cell)?.remaining ?? 0) > 0))
      continue;
    const elapsed = value.regrowthTicks + 1;
    if (elapsed === ORE_REGROWTH_TICKS)
      world.set(entity, OreCell, "remaining", value.remaining + 1);
    world.set(entity, OreCell, "regrowthTicks", elapsed % ORE_REGROWTH_TICKS);
  }
}

/** No closure state: the same system operates restored Worlds. */
export const oreFeature: Feature = { components: [OreCell], systems: { economy: [regrowOre] } };

export function initializeOre(kernel: Kernel): void {
  const map = kernel.map;
  if (!map) throw new Error("Ore initialization requires a map");
  if (kernel.systems.economy.includes(regrowOre)) throw new Error("Ore is already initialized");
  const cells = compileOreCells(map);
  register(kernel, oreFeature);
  for (const { cell, cap } of cells) {
    const entity = kernel.world.create();
    kernel.world.add(entity, OreCell, { cell, cap, remaining: cap });
  }
}
