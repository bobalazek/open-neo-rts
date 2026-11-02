/** Approved first-playable presentation scope; gameplay numbers and eligibility remain content/worker owned. */
export const firstPlayableRoster = new Set([
  ...[
    "command-center",
    "industrial-reactor",
    "supply-depot",
    "barracks-complex",
    "war-factory",
    "fortress-wall",
    "anti-air-complex",
  ].map((id) => `core.structure:eastern-collective/${id}`),
  ...[
    "field-technician",
    "collective-soldier",
    "rocket-trooper",
    "drone-hunter",
    "supply-truck",
    "dragon-tank",
    "metamorphic-apc",
  ].map((id) => `core.unit:eastern-collective/${id}`),
]);
