import { SCHEMAS, validate } from "@open-neo-rts/content";
import alliance from "../../../../../content/core/factions/alliance-of-free-nations/faction.json";
import eastern from "../../../../../content/core/factions/eastern-collective/faction.json";
import phoenix from "../../../../../content/core/factions/phoenix-initiative/faction.json";

export const FACTIONS = [alliance, eastern, phoenix];
for (const faction of FACTIONS) {
  const issues = validate(SCHEMAS.faction, faction);
  if (issues.length) throw new Error(`Invalid faction ${faction.id}`);
}
export interface DebugForce {
  index: number;
  faction: string;
  color: string;
}

/** Reject partial parsing, coercion, overflow and values the replay format cannot preserve. */
export function parseDebugSeed(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 0xffffffff)
    throw new Error("Seed must be an integer from 0 to 4294967295");
  return Number(value);
}

export function validateDebugForces(forces: readonly DebugForce[], controlled: number): void {
  if (forces.length < 1 || forces.length > 8) throw new Error("Declare between 1 and 8 Forces");
  if (!forces.some((force) => force.index === controlled))
    throw new Error("Choose a declared controlled Force");
  const ids = new Set<number>();
  for (const force of forces) {
    if (!Number.isSafeInteger(force.index) || force.index < 0 || ids.has(force.index))
      throw new Error("Invalid or duplicate Force index");
    ids.add(force.index);
    if (!FACTIONS.some((faction) => `core.${faction.id}` === force.faction))
      throw new Error(`Unknown faction for Force ${force.index + 1}`);
    if (!/^#[a-fA-F0-9]{6}$/.test(force.color))
      throw new Error(`Invalid colour for Force ${force.index + 1}`);
  }
}
