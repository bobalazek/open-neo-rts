// Roles the engine knows. Every faction fills them with its own units and structures and its own names
// (a builder is the Alliance's Combat Engineer, the Collective's Field Technician, the Phoenix Initiative's
// Nanite Constructor). Behaviour that depends on a role (who can construct, who gathers, what counts as a
// headquarters for elimination) keys off these, never off names or IDs.

export const UNIT_ROLES = [
  "builder", // constructs, repairs and captures structures; works on wonders
  "harvester", // gathers resources and returns them to a drop-off
  "combat", // fights
  "scout", // recon: long vision, little or no weapon
  "support", // heals, repairs, buffs, disables
  "transport", // carries other units
] as const;
export type UnitRole = (typeof UNIT_ROLES)[number];

export const STRUCTURE_ROLES = [
  "headquarters", // trains builders; counts for the headquarters elimination rule
  "power", // produces power
  "dropoff", // harvesters unload here
  "extractor", // binds to a material or oil node; output arrives with the economy
  "production", // trains or builds units
  "research", // unlocks tiers and researches upgrades
  "support", // radar, detection, buffs, healing
  "defense", // turrets, anti-air, shields
  "wall", // drag-placed walls and gates
  "superweapon", // one per Force; announced to every player
  "wonder", // wins the Wonder Race mode
] as const;
export type StructureRole = (typeof STRUCTURE_ROLES)[number];
