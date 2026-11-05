# Replays and replay viewer

The [current local implementation](../../project/decisions/2026-11-03-native-replay-viewer.md)
supports the authored Eastern Collective mirror: native library actions and
metadata, verified container/legacy imports, read-only playback/speed/seek,
All/player fog, actual resources/production and free-camera/right-hand circular
map navigation. [Portable keyframes and map identity](../../project/decisions/2026-11-05-portable-replay-keyframes.md)
now retain complete history verification on import. [Event navigation](../../project/decisions/2026-11-05-replay-event-timeline.md)
adds view-filtered combat intervals and exact public Force outcomes. The
[statistics overlay](../../project/decisions/2026-11-05-replay-analytics.md) adds
current income/army graphs, original production queues and accepted-order APM.
[Recorded player cameras](../../project/decisions/2026-11-05-recorded-replay-cameras.md)
add native follow/free controls and real target, rotation and zoom playback.
Delayed live spectating remains work.

## Replay browser

**Route:** `/replays` · **From:** Home, post-match

A list like [Load game](load-game.md): map thumbnail, mode, players and factions, result, length, date and game version. Filter by mode or player, and search by name. Actions: watch, rename, export, delete, import. Replays from another game version show which version they need. See [saves-and-replays.md](../../engineering/saves-and-replays.md).

## Replay viewer

**Route:** `/replay/:id`

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ IRON VALLEY · 2v2 · 34:12            Vision: [ All ▾ | Mara | Ozzy | … ]  ✕   │
│ ┌ PLAYERS ──────────────────────────────────────────────────────────────────┐ │
│ │ Mara+Bob  Alliance of Free Nations  ◉4 820 ▲1 240 army 12 400 [prod: ▣▣▣] │ │
│ │ Ozzy      Phoenix Initiative        ◉2 100 ▲  900 army  8 900 [prod: ▣▣]  │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│                         (3D battlefield, free camera)                         │
│                                                                               │
│ ┌──────────┐                                                                  │
│ │ MINIMAP  │  ◂◂  ▶ ❚❚  ▸▸  1×▾  ────────●───────────────── 12:41 / 34:12     │
│ └──────────┘         event markers on the timeline: ⚔ fights · ✖ eliminations │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Timeline:** play, pause, speed from 0.5× to 8×, and click to seek (using snapshot keyframes). Event markers jump to fights and eliminations.
- **Vision:** all, or any single Force or team's view, including their fog.
- **Camera:** free camera, or follow a player's recorded camera.
- **Overlays:** income and army graphs, production tabs, APM.
- The same viewer serves live spectating, with a delay and without the timeline.
