# Loading

**From:** any setup screen, Load game, Lobby · **To:** Match

```text
┌────────────────────────────────────────────────────────────────────┐
│ (map key art / brick diorama of the map)                           │
│                                                                    │
│   IRON VALLEY · 2v2 · Standard                                     │
│                                                                    │
│   Team A                                                           │
│   Mara  Alliance of Free Nations  ████████████ 100%                │
│   Bob   Alliance of Free Nations  ██████████░░  85%                │
│   Team B                                                           │
│   Ozzy  Phoenix Initiative        ████████░░░░  70%                │
│   Bot   Eastern Collective        ready                            │
│                                                                    │
│   Tip: Shift-queue orders to plan a whole attack route.            │
└────────────────────────────────────────────────────────────────────┘
```

- Single player shows one progress bar; multiplayer shows each player's progress, and the match starts when everyone is loaded.
- Loads content packs, map, compiled nav data and assets, and warms the renderer (shaders, instancing buffers).
- **Timeouts:** a player still loading after 60 s is treated as a disconnect, following the match's leave/disconnect policy ([match-rules.md](../match-rules.md#leaving-and-disconnecting)).
- Tips come from locale files and are filtered for the loaded packs.
