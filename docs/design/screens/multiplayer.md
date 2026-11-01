# Room browser

**Route:** `/multiplayer` · **From:** Home · **To:** [Lobby](lobby.md)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ◂ Back                 MULTIPLAYER                 Region [EU ▾] ● Online  │
│                                                                            │
│  [ Create room ]   Join by code [ _ _ _ _ _ _ ] [Join]   [ Quick match ]   │
│                                                                            │
│  Filters: [Mode: Any ▾] [Players: Any ▾] [Packs: Any ▾]   ☐ Hide full      │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Room                     Host     Mode            Map          Players  │ │
│ │ Chill 2v2 co-op          Mara     Shared Command  Iron Valley  3/4      │ │
│ │ FFA diplomacy night      Ozzy     FFA+Diplomacy   Archipelago  5/8      │ │
│ │ 🔒 Friends only           Bob      2v2             Dustbowl     2/4      │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│  Friends online: Mara (in lobby), Ozzy (in match)              [Refresh]  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Create room:** name, public or private (code only), optional password, max players, then straight into the lobby as host.
- **Join by code:** six characters, shareable as a link (`/lobby/ABC123`).
- **Quick match** (later): picks a template and region and fills a room automatically.
- Rooms with a different game or content version are shown greyed out, with the reason.
- **States:** server unreachable shows a retry button and an offer to play a skirmish instead. An empty list shows "No public rooms", with a Create button.
- Backed by Colyseus room listing; see [architecture.md §8](../../engineering/architecture.md#8-server-and-replication).
