# Replays and replay viewer

## Replay browser

**Route:** `/replays` · **From:** Home, post-match

A list like [Load game](load-game.md): map thumbnail, mode, players and factions, result, length, date and game version. Filter by mode or player, and search by name. Actions: watch, rename, export, delete, import. Replays from another game version show which version they need. See [saves-and-replays.md](../../engineering/saves-and-replays.md).

## Replay viewer

**Route:** `/replay/:id`

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ IRON VALLEY · 2v2 · 34:12            Vision: [ All ▾ | Mara | Ozzy | … ]  ✕   │
│ ┌ PLAYERS ──────────────────────────────────────────────────────────────────┐ │
│ │ Mara+Bob AFN  ◉4 820 ▲1 240  army 12 400  [prod: ▣▣▣]                      │ │
│ │ Ozzy PI       ◉2 100 ▲  900  army  8 900  [prod: ▣▣]                       │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│                         (3D battlefield, free camera)                         │
│                                                                               │
│ ┌──────────┐                                                                   │
│ │ MINIMAP  │  ◂◂  ▶ ❚❚  ▸▸  1×▾  ────────●───────────────── 12:41 / 34:12     │
│ └──────────┘         event markers on the timeline: ⚔ fights · ✖ eliminations  │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Timeline:** play, pause, speed from 0.5× to 8×, and click to seek (using snapshot keyframes). Event markers jump to fights and eliminations.
- **Vision:** all, or any single Force or team's view, including their fog.
- **Camera:** free camera, or follow a player's recorded camera.
- **Overlays:** income and army graphs, production tabs, APM.
- The same viewer serves live spectating, with a delay and without the timeline.
