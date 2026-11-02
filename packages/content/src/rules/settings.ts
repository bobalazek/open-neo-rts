// Engine match settings: every configurable rule, its type, default and range. Packs may override defaults and ranges.

export interface MatchSetting {
  id: string;
  group:
    | "caps"
    | "economy"
    | "speed"
    | "combat"
    | "vision"
    | "victory"
    | "teams"
    | "bots"
    | "modules";
  type: "integer" | "enum" | "boolean";
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
  scope: readonly ("match" | "faction" | "force")[];
}

export const MATCH_SETTINGS: readonly MatchSetting[] = [
  { id: "veterancy", group: "combat", type: "boolean", default: true, scope: ["match"] },
  { id: "friendlyFire", group: "combat", type: "boolean", default: true, scope: ["match"] },
  {
    id: "highGroundMissPerMille",
    group: "combat",
    type: "integer",
    default: 250,
    min: 0,
    max: 1000,
    scope: ["match"],
  },
  {
    id: "popCap",
    group: "caps",
    type: "integer",
    default: 200,
    min: 50,
    max: 500,
    scope: ["match", "faction", "force"],
  },
  {
    id: "structureCap",
    group: "caps",
    type: "integer",
    default: 150,
    min: 20,
    max: 400,
    scope: ["match", "faction", "force"],
  },
  {
    id: "startingCredits",
    group: "economy",
    type: "integer",
    default: 5000,
    min: 0,
    max: 50000,
    scope: ["match", "force"],
  },
  {
    id: "incomePercent",
    group: "economy",
    type: "integer",
    default: 100,
    min: 25,
    max: 400,
    scope: ["match", "force"],
  },
  {
    id: "gameSpeed",
    group: "speed",
    type: "enum",
    default: "normal",
    options: ["slow", "normal", "fast", "faster"],
    scope: ["match"],
  },
  {
    id: "fog",
    group: "vision",
    type: "enum",
    default: "standard",
    options: ["standard", "explored", "off"],
    scope: ["match"],
  },
  {
    id: "mode",
    group: "victory",
    type: "enum",
    default: "lastManStanding",
    options: [
      "lastManStanding",
      "wonderRace",
      "territorialControl",
      "economicDominance",
      "technicalSuperiority",
      "score",
      "survival",
      "mission",
    ],
    scope: ["match"],
  },
  {
    id: "elimination",
    group: "victory",
    type: "enum",
    default: "annihilation",
    options: ["annihilation", "baseDestruction", "headquarters"],
    scope: ["match"],
  },
  {
    id: "wonderCountdownSeconds",
    group: "victory",
    type: "integer",
    default: 180,
    min: 60,
    max: 600,
    scope: ["match"],
  },
  {
    id: "reconnectWindowSeconds",
    group: "teams",
    type: "integer",
    default: 90,
    min: 30,
    max: 300,
    scope: ["match"],
  },
  {
    id: "takeover",
    group: "teams",
    type: "enum",
    default: "bot",
    options: ["bot", "eliminate", "pauseVote"],
    scope: ["match"],
  },
];
