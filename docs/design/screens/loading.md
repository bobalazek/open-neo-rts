# Loading

**From:** any setup screen, Load game, Lobby · **To:** Match

```text
┌────────────────────────────────────────────────────────────────────┐
│ (map key art / brick diorama of the map)                            │
│                                                                    │
│   IRON VALLEY · 2v2 · neo-2035                                      │
│                                                                    │
│   Team A                         Team B                             │
│   Mara  AFN  ████████████ 100%   Ozzy  PI  ████████░░░░  70%        │
│   Bob   AFN  ██████████░░  85%   Bot   EC  ready                    │
│                                                                    │
│   Tip: Shift-queue orders to plan a whole attack route.            │
└────────────────────────────────────────────────────────────────────┘
```

- Single player shows one progress bar; multiplayer shows each player's progress, and the match starts when everyone is loaded.
- Loads content packs, map, compiled nav data and assets, and warms the renderer (shaders, instancing buffers).
- **Timeouts:** in multiplayer, a player stuck for more than 60 s is offered as a bot takeover, by host decision.
- Tips come from locale files and are filtered for the active game profile.
