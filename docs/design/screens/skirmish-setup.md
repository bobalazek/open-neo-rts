# Skirmish setup

**Route:** `/skirmish` · **From:** Single player · **To:** Loading → Match

A local match against bots. It's the same layout as the multiplayer [lobby](lobby.md), minus room code, chat and ready states, so players learn one setup screen.

The current Eastern Collective mirror uses native Babylon GUI with compact Force
rows, actual Training Grounds terrain/resource preview and selected-spawn markers.
It preserves the existing setup validator, saved setup format and normal worker
start path. Narrow screens scroll the content with feedback and actions fixed at
the bottom; keyboard focus brings the corresponding native control into view.
Semantic HTML retains assistive editing and becomes visible if graphics cannot
initialize. The broader faction/team/map choices below remain future work.

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◂ Back                                    SKIRMISH                                            │
│ ┌─────────────────────────────────────────────────────────────────┐ ┌───────────────────────┐ │
│ │ FORCES                                                          │ │ MAP                   │ │
│ │ #  Team Seat(s)         Faction                    Colour Spawn │ │ ┌───────────────────┐ │ │
│ │ 1  A    You             Alliance of Free Nations ▾ ■ ▾    N ▾   │ │ │ (top-down preview │ │ │
│ │ 2  A    Bot (Normal ▾)  Eastern Collective ▾       ■ ▾    S ▾   │ │ │  with spawn slots)│ │ │
│ │ 3  B    Bot (Hard ▾)    Phoenix Initiative ▾       ■ ▾    E ▾   │ │ └───────────────────┘ │ │
│ │ 4  B    [+ add bot]                                             │ │ Iron Valley · 4 slots │ │
│ │                                                                 │ │ [ Change map ▾ ]      │ │
│ │ [+ Add Force]   Team mode: [2 teams ▾]                          │ │                       │ │
│ ├─────────────────────────────────────────────────────────────────┤ ├───────────────────────┤ │
│ │ PACKS: core ✓  [+ mods ▾]                                       │ │ RULES                 │ │
│ │ Starting resources [Standard ▾]                                 │ │ Victory               │ │
│ │ Game speed [Normal ▾]                                           │ │ [Last Man Standing ▾] │ │
│ │ Bot co-controller on my Force: [Off ▾]                          │ │ Fog [Standard ▾]      │ │
│ │                                                                 │ │ Time limit [None ▾]   │ │
│ │                                                                 │ │ Diplomacy [Locked ▾]  │ │
│ └─────────────────────────────────────────────────────────────────┘ └───────────────────────┘ │
│ Quick setup: [1v1] [2v2] [FFA] [Survival]  [Save setup]                           [ Start ▸ ] │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Forces:** each row is a Force with a team, faction, colour and spawn. Seat options are You, Bot (with difficulty and personality), or Empty.
- **Bot co-controller:** a bot can share your Force with a scoped grant, e.g. it runs the economy while you fight. See [ai.md](../../engineering/ai.md).
- **Map picker:** a grid of map cards with filters (size, player count, pack). It also lists custom maps from installed packs.
- **Rules:** setting defaults (from code, adjusted by enabled packs); **Advanced rules** opens every setting from [match-rules.md](../match-rules.md), the same panel the lobby uses. Options the map or the enabled packs don't support are hidden, not greyed out.
- **Quick setup** buttons are built-in templates that fill Forces and teams from the map's spawns (only the ones the map supports are shown). Players can save their own setups.
- **Validation:** Start is disabled with a reason ("Map has 4 spawns, you have 5 Forces").
- Starts load into [Loading](loading.md), then the match. Esc in the match opens the [in-game menu](in-game-menu.md), which pauses the game.

What a map must declare for skirmish (spawns, players, start mode) is in [authoring-scenarios.md](../../contributing/authoring-scenarios.md#skirmish-maps).
