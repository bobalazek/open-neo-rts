# Authoring campaigns, missions and presets

**Status:** target workflow; the schemas and the scenario editor are not built yet.

Everything here is data. A campaign mission and a skirmish setup are the same simulation, configured differently.

## Concepts

| Thing               | What it is                                                                    | Lives in                                                |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Map**             | Terrain, props, spawns, resources                                             | `<pack>/maps/<name>/`                                   |
| **Scenario**        | A map plus pre-placed Forces, objectives and triggers                         | inside a mission, or `<pack>/maps/<name>/scenario.json` |
| **Mission**         | A scenario plus briefing, dialogue, difficulty settings and campaign metadata | `<pack>/campaigns/<campaign>/missions/<name>/`          |
| **Campaign**        | A graph of missions with unlocks and carry-over                               | `<pack>/campaigns/<campaign>/campaign.json`             |
| **Skirmish preset** | A lobby template: Force slots, teams, rules, victory                          | `<pack>/presets/<name>.json`                            |

## Building a mission

1. **Make the map** in the [map editor](../design/screens/map-editor.md).
2. **Open the scenario editor** (the Triggers tool). Place the Forces (player, enemy bots, neutrals), pre-placed units and structures, and regions (named areas used by objectives and triggers).
3. **Write objectives and triggers**; see below.
4. **Write the briefing and dialogue** strings in the pack's locale files, and add voice lines as assets if there are any.
5. **Playtest** from the editor at every difficulty.
6. **Add the mission to the campaign graph.**

`mission.json` (sketch):

```json
{
  "$schema": "../../../../schemas/mission.schema.json",
  "id": "mission:afn-04-cold-front",
  "map": "map:cold-front",
  "profile": "profile:neo-2035",
  "forces": [
    { "id": "player", "faction": "faction:afn", "seat": "human", "start": "region:player-base" },
    {
      "id": "ec-garrison",
      "faction": "faction:ec",
      "seat": "bot",
      "ai": "ai:defensive",
      "start": "region:dam"
    }
  ],
  "difficulty": {
    "easy": { "ec-garrison": { "aiLevel": "easy", "startingUnits": "units:garrison-small" } },
    "normal": { "ec-garrison": { "aiLevel": "normal", "startingUnits": "units:garrison-medium" } },
    "hard": { "ec-garrison": { "aiLevel": "hard", "startingUnits": "units:garrison-large" } }
  },
  "objectives": [
    { "id": "capture-dam", "kind": "primary", "condition": { "capture": "structure:dam-control" } },
    { "id": "convoy", "kind": "primary", "fail": { "allDead": "group:convoy" } },
    {
      "id": "radar",
      "kind": "secondary",
      "condition": { "destroy": "structure:ec-radar", "beforeTick": 12000 }
    }
  ],
  "triggers": [
    {
      "on": { "event": "regionEntered", "region": "region:bridge", "force": "player" },
      "do": [
        { "dialogue": "dlg:vale-bridge" },
        { "spawn": "units:ec-counterattack", "at": "region:east-road", "force": "ec-garrison" },
        { "revealObjective": "radar" }
      ],
      "once": true
    }
  ],
  "rewards": { "unlock": ["mission:afn-05", "unit:afn-raptor"] }
}
```

## Objectives and triggers

What counts as a win or a loss is defined in [objectives-and-victory.md](../design/objectives-and-victory.md).

- **Conditions:** destroy, capture, hold a region for N ticks, escort to a region, survive until a tick, build, research, resources reached, or all of a group dead.
- **Trigger events:** tick reached, region entered or left, unit or structure destroyed, captured, objective completed or failed, resources reached, dialogue finished.
- **Trigger effects:**
  - spawn units, change owner, set a bot's AI posture, change diplomacy, reveal the map or an area;
  - add, complete, fail or reveal objectives;
  - dialogue and subtitles, camera rail, play music, set a campaign variable, end the mission.
- **No scripts.** Triggers are declarative and run inside the sim, so missions are deterministic and replayable. If a mission needs an effect that doesn't exist, add a general effect to the engine (see the `add-sim-feature` skill).

## Campaigns

`campaign.json` lists missions as a graph: which mission unlocks which, optional branches, and the starting mission.

- **Carry-over:** campaign variables (e.g. `rescuedScientists: true`) and unlocks persist between missions in the campaign state. Missions can read them in conditions. Carrying veteran units between missions is optional per campaign.
- **Medals:** defined per mission (difficulty completed, secondary objectives, time).

## Skirmish presets

A preset fills the [skirmish setup](../design/screens/skirmish-setup.md) and the multiplayer lobby:

```json
{
  "id": "preset:hybrid-2v2",
  "forces": [
    { "team": "A", "seats": ["human", "human"] },
    { "team": "A", "seats": ["bot"] },
    { "team": "B", "seats": ["open"] }
  ],
  "rules": {
    "victory": "annihilation",
    "fog": "standard",
    "diplomacy": "locked",
    "postDefeat": "requestAllyAssist"
  }
}
```

## Testing

- `bun run validate-content` checks mission references: objectives, regions, groups, dialogue keys and unlock targets.
- **Mission smoke test:** in CI, every mission loads headless and runs a few thousand ticks with bots on both sides, without errors.
- **Autoplay** (later): a scripted bot plays a mission to completion, to catch unwinnable missions after balance changes.
