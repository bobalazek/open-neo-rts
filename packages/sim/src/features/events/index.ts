import type { Kernel } from "../../kernel";

export * from "./combat";

/** Later producers must gate each disclosed entity/location independently, including attacker origins.
 * Own-hit alerts may reveal the owned victim; they do not authorize disclosing an unseen attacker.
 */
export function canObserveEventSource(
  kernel: Kernel,
  seat: number,
  source: { entity: number } | { x: number; y: number },
): boolean {
  return "entity" in source
    ? kernel.visibility?.canSeeEntity(seat, source.entity) === true
    : kernel.visibility?.canSeeCell(seat, source.x, source.y) === true;
}
