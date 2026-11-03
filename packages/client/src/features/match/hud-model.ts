import type { GameplayDefinition, PresentedEntity, SeatSnapshot } from "@open-neo-rts/sim";

export interface HudDefinition {
  gameplay: GameplayDefinition;
  name: string;
  description: string;
  icon?: string;
}

export function selectedEntities(snapshot: SeatSnapshot, handles: readonly string[]) {
  const selected = new Set(handles);
  return snapshot.entities.filter((entity) => selected.has(entity.handle));
}

export function completedDefinitions(snapshot: SeatSnapshot, force: number) {
  return new Set(
    snapshot.entities
      .filter((entity) => entity.force === force && entity.health > 0 && !entity.constructionSite)
      .map((entity) => entity.definition),
  );
}

/** Advice uses only copied owned state. The worker repeats every rule at command execution. */
export function recipeLock(definition: GameplayDefinition, snapshot: SeatSnapshot, force: number) {
  if (!definition.construction) return "unpriced";
  const completed = completedDefinitions(snapshot, force);
  if (definition.requires.some((required) => !completed.has(required))) return "requirements";
  return undefined;
}

export function affordable(definition: GameplayDefinition, snapshot: SeatSnapshot, force: number) {
  const bank = snapshot.banks?.find((bank) => bank.force === force)?.resources;
  return (
    !!bank &&
    !!definition.construction &&
    Object.entries(definition.construction.cost).every(
      ([id, value]) => (bank[id as keyof typeof bank] ?? 0) >= value,
    )
  );
}

export function idleBuilder(entity: PresentedEntity, definition: GameplayDefinition | undefined) {
  return (
    definition?.role === "builder" &&
    entity.health > 0 &&
    !entity.order &&
    !entity.constructionOrder &&
    !entity.repairOrder &&
    !entity.holdPosition &&
    !entity.salvageOrder
  );
}

/** Rotated footprint preview is advisory; hidden occupancy and normal placement stay worker-owned. */
export function footprintCells(
  definition: GameplayDefinition,
  x: number,
  y: number,
  rotation: number,
) {
  const [width = 1, depth = 1] = definition.footprint ?? [];
  const w = rotation % 2 ? depth : width,
    d = rotation % 2 ? width : depth;
  return Array.from({ length: w * d }, (_, i) => ({ x: x + (i % w), y: y + Math.floor(i / w) }));
}
