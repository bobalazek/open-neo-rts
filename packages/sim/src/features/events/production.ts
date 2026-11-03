import type { Kernel } from "../../kernel";

export const MAX_PRODUCTION_EXITS = 8192;

/** Cosmetic output only; capacity and duplicate exits cannot affect production or hashes. */
export function emitProductionExit(kernel: Kernel, producer: number): void {
  kernel.productionExits ??= new Set();
  if (kernel.productionExits.size < MAX_PRODUCTION_EXITS) kernel.productionExits.add(producer);
}
