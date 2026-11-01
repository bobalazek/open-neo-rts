# Skirmish setup

**Route:** `/skirmish` · **From:** Single player · **To:** Loading → Match

A local match against bots. It's the same layout as the multiplayer [lobby](lobby.md), minus room code, chat and ready states, so players learn one setup screen.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ◂ Back                         SKIRMISH                                     │
│ ┌──────────────────────────────────────────────┐ ┌───────────────────────┐ │
│ │ FORCES                                       │ │ MAP                   │ │
│ │ # Team Seat(s)          Faction  Colour  Spawn│ │ ┌───────────────────┐ │ │
│ │ 1  A   You              AFN ▾    ■ ▾     N ▾ │ │ │ (top-down preview │ │ │
│ │ 2  A   Bot (Normal ▾)   EC ▾     ■ ▾     S ▾ │ │ │  with spawn slots)│ │ │
│ │ 3  B   Bot (Hard ▾)     PI ▾     ■ ▾     E ▾ │ │ └───────────────────┘ │ │
│ │ 4  B   [+ add bot]                           │ │ Iron Valley · 4 slots │ │
│ │                                              │ │ [ Change map ▾ ]      │ │
│ │ [+ Add Force]   Team mode: [2 teams ▾]       │ ├───────────────────────┤ │
│ ├──────────────────────────────────────────────┤ │ RULES                 │ │
│ │ GAME PROFILE: neo-2035 ▾                     │ │ Victory  [Annihilation▾]│
│ │ Starting resources [Standard ▾]              │ │ Fog      [Standard ▾] │ │
│ │ Game speed [Normal ▾]                        │ │ Time limit [None ▾]   │ │
│ │ Bot co-controller on my Force: [Off ▾]       │ │ Diplomacy [Locked ▾]  │ │
│ └──────────────────────────────────────────────┘ └───────────────────────┘ │
│  Presets: [1v1] [2v2] [FFA] [Survival] [Save preset]          [ Start ▸ ]  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Forces:** each row is a Force with a team, faction, colour and spawn. Seat options are You, Bot (with difficulty and personality), or Empty.
- **Bot co-controller:** a bot can share your Force with a scoped grant, e.g. it runs the economy while you fight. See [ai.md](../../engineering/ai.md).
- **Map picker:** a grid of map cards with filters (size, player count, profile). It also lists custom maps from installed packs.
- **Rules:** come from the game profile; **Advanced rules** opens every setting from [match-rules.md](../match-rules.md), the same panel the lobby uses. Options the profile doesn't support are hidden, not greyed out.
- **Presets** fill in common setups. Players can save their own.
- **Validation:** Start is disabled with a reason ("Map has 4 spawns, you have 5 Forces").
- Starts load into [Loading](loading.md), then the match. Esc in the match opens the [in-game menu](in-game-menu.md), which pauses the game.

How skirmish presets and rulesets are defined is in [authoring-scenarios.md](../../contributing/authoring-scenarios.md#skirmish-presets).
