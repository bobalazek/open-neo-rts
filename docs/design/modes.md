# Game modes

Every mode runs the same deterministic simulation with a different ruleset and setup. A mode is mostly data, not a separate code path.

```text
Home
├── Single player
│   ├── Skirmish            vs bots, any team arrangement
│   ├── Campaign            story missions, then the world-map layer        [later]
│   └── Load game
├── Multiplayer             skirmish online: rooms, lobby, presets
├── Map editor              build maps and playtest them with god tools
├── Replays
└── Settings
```

## Skirmish

The core mode. One or more Forces per team, any mix of humans and bots, on any map, with the rules from the game profile (victory condition, fog, resources, diplomacy, game speed). Team arrangements (Shared Command, Allied Command, Last Stand), presets and diplomacy are in [multiplayer.md](multiplayer.md). Optional rule modules (territory, eras, trade…) come from the game profile; see [content-and-eras.md](content-and-eras.md).

Single-player skirmish and multiplayer use the same setup screen and rules; multiplayer just adds rooms, a lobby, chat and voice.

## Multiplayer

Skirmish with other people: PvP, co-op against bots, Shared Command, FFA with diplomacy, Survival waves. Setups are **lobby presets**, which are data in `content/rulesets/presets/`. See [multiplayer.md](multiplayer.md) and the [lobby screen](screens/lobby.md).

## Campaign (later)

Faction story campaigns built from missions: a map with scripted objectives, triggers, briefings and dialogue. After the campaign core, a Conquer the World-style strategic layer links battles on a world map. See [authoring-scenarios.md](../contributing/authoring-scenarios.md) and [objectives-and-victory.md](objectives-and-victory.md).

## Map editor and playtest

The map editor is the creative tool. Its **playtest** runs the map in a real match with **playtest tools**:
- spawn anything from any loaded pack, for any Force;
- god tools: move, damage, heal, delete, change owner, grant tech, set resources;
- rule toggles: unlimited resources, instant build, fog on/off, AI on/off per Force;
- time controls: pause, step one tick, speed up;
- an entity inspector (components, orders, AI reasoning);
- saving the playtest state as a scenario.

Playtest tools are ordinary sim commands (`playtest.*`), accepted only in editor playtests. A playtest is deterministic and replayable like any match, and the tools can never be used in a normal match.

**Content preview:** playtest is also how contributors and reviewers try new content. Deep links open it ready to go:

```text
/editor/playtest?map=examples.flat-test&spawn=unit:panther&vs=unit:rifle-squad
```

For a single model, the [model viewer](screens/model-viewer.md) shows sockets, damage states, team colours and destruction without a match. PR preview builds post these links for every changed definition; see [CONTRIBUTING.md](../../CONTRIBUTING.md#previews). Screens: [map-editor.md](screens/map-editor.md).
