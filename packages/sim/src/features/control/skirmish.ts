import type { SkirmishPolicy } from "@open-neo-rts/ai";
import type { MatchSetup } from "../../match";

/** Provisional tier-1 selection from the owner's Eastern Collective roster; no content edits. */
export function skirmishPolicy(setup: MatchSetup, force: number): SkirmishPolicy {
  const faction = setup.forces.find((row) => row.index === force)?.faction;
  if (!faction || !/^([a-z0-9-]+\.)?faction:eastern-collective$/.test(faction))
    throw new Error("Basic skirmish supports the Eastern Collective only");
  const prefix = faction.slice(0, faction.indexOf("faction:"));
  const structure = (name: string) => `${prefix}structure:eastern-collective/${name}`;
  const unit = (name: string) => `${prefix}unit:eastern-collective/${name}`;
  const roster = {
    buildOrder: ["industrial-reactor", "supply-depot", "barracks-complex", "war-factory"].map(
      structure,
    ),
    builder: unit("field-technician"),
    truck: unit("supply-truck"),
    soldier: unit("collective-soldier"),
    tank: unit("dragon-tank"),
    extractor: `${prefix}structure:neutral/resource-extractor`,
  };
  for (const id of [
    ...roster.buildOrder,
    roster.builder,
    roster.truck,
    roster.soldier,
    roster.tank,
    roster.extractor,
  ])
    if (!setup.definitions.some((definition) => definition.id === id && definition.construction))
      throw new Error(`Basic skirmish requires authored recipe ${id}`);
  const team = setup.normal?.forces.find((row) => row.index === force)?.team;
  return {
    ...roster,
    force,
    allies: setup.normal?.forces.filter((row) => row.team === team).map((row) => row.index) ?? [
      force,
    ],
    definitions: setup.definitions,
  };
}
