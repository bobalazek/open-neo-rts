import { ARMOR_CLASSES } from "@open-neo-rts/content";
import type { GameplayDefinition, GameplayWeapon } from "@open-neo-rts/sim";

export interface ManualEntry {
  gameplay: GameplayDefinition;
  name: string;
  description: string;
  icon?: string;
  model?: string;
  materials?: Readonly<Record<string, string>>;
}

/** Content metadata and compiled gameplay remain the only source of roster facts. */
export function searchManual(entries: readonly ManualEntry[], query: string, kind = "all") {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (kind !== "all" && entry.gameplay.kind !== kind) return false;
    const words =
      `${entry.name} ${entry.description} ${entry.gameplay.id} ${entry.gameplay.role ?? ""}`.toLowerCase();
    return terms.every((term) => words.includes(term));
  });
}

/** Percentages describe authored modifiers, not final damage after range, armour or modes. */
export function damageModifiers(weapon: GameplayWeapon) {
  return weapon.warheads.flatMap((warhead, index) =>
    warhead.type !== "damage"
      ? []
      : ARMOR_CLASSES.map((armor) => ({
          warhead: index + 1,
          armor,
          percent:
            (warhead.versusPerMille?.[armor] ?? warhead.versusPerMille?.default ?? 1000) / 10,
        })),
  );
}
