// The resources the game knows. Game code, not content. Costs in content use these IDs as keys.

export const RESOURCES = [
  { id: "credits", kind: "stock" },
  { id: "materials", kind: "stock" },
  { id: "power", kind: "capacity" },
  { id: "quantum-processing", kind: "capacity" }, // Alliance of Free Nations: gates research
  { id: "industrial-capacity", kind: "stock" }, // Eastern Collective: earned by producing, spent on surges
  { id: "salvage-points", kind: "stock" }, // Phoenix Initiative: earned from wrecks, spent at the Black Market Hub
] as const;
export type ResourceId = (typeof RESOURCES)[number]["id"];

/** Deposit kinds, separate from spendable resources. */
export const NODE_KINDS = ["materials", "oil"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
