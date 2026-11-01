# Minimap

The most-used piece of the HUD: it's where players notice attacks, plan moves and jump the camera. **Phase:** basic minimap, alerts and pings in phase 2 ([roadmap](../../project/roadmap.md#what-each-phase-builds)), overlays in phase 3–4.

**Position:** bottom left of the [match HUD](match-hud.md). Square, 220 px at 100% UI scale, scalable with the UI scale setting. The map is rotated to match the camera's default orientation.

```text
┌──────────────────────────┐
│ ▓▓▓▓░░░░░░░░░░    ■■ ▲   │   ▓ explored terrain   ░ fog   (black) unexplored
│ ▓▓■■■▓░░░░░░░    ⚠      │   ■ your structures     ▪ your units
│ ▓▓■▪▪▓▓░░░░░░░░░░░░░    │   ■ allies (their colour)   ◆ enemies (their colour)
│ ▓▓▓▪▪▓▓▓▓░░░░░░◆◆░░░    │   ⚠ alert (pulses)   ◎ ping (teammate colour)
│ ▓▓▓▓▓▓▓▓░░░░░░◆■■◆░░    │   ⬚ your camera view   ⬚ teammates' views (thin, their colour)
│ ┌─────┐                  │   ✦ resource fields   ⬢ capturable objectives
│ └─────┘ ⬚               │
└──────────────────────────┘
 [◐ Terrain] [⚑ Allies] [⊞ Overlay ▾] [◎ Ping]
```

## What it shows

| Layer                        | Detail                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Terrain**                  | Height levels as shades, water, cliffs, forests; unexplored is black, fogged is dimmed                                                                                                   |
| **Structures**               | Larger squares in the owner's colour; enemy structures in fog show as their last-seen ghosts                                                                                             |
| **Units**                    | Small dots in the owner's colour; only what your vision group sees right now                                                                                                             |
| **Resources and objectives** | Resource fields, capturable tech structures, control points, with owner colour once captured                                                                                             |
| **Camera frames**            | Your camera as a white trapezoid; each co-controller's and teammate's camera as a thin frame in their colour ([multiplayer.md §9](../multiplayer.md#9-co-op-presence-and-communication)) |
| **Alerts**                   | A pulsing marker where something of yours is attacked, for a few seconds; the latest is reachable with Space                                                                             |
| **Pings**                    | Teammates' pings with their colour and type icon, fading after a few seconds                                                                                                             |
| **Superweapons**             | Known enemy superweapon sites, and target warnings when one is about to land                                                                                                             |

## Interaction

| Input               | Does                                                              |
| ------------------- | ----------------------------------------------------------------- |
| Left-click or drag  | Move the camera there                                             |
| Right-click         | Order the selection to that point (move, attack-move with A held) |
| Alt + click         | Ping there (the ping wheel opens on hold)                         |
| Shift + right-click | Queue the order                                                   |
| Scroll over minimap | Zoom the main camera                                              |

## Buttons under the minimap

- **Terrain:** toggles terrain shading (some players prefer a plain view with only units).
- **Allies:** toggles ally colours versus a simple own / ally / enemy colour scheme (also an accessibility option).
- **Overlay:** picks a map overlay shown on both the minimap and the world: territory, supply, pathing, detection ranges, trade routes ([match-hud.md](match-hud.md#information-overlays)).
- **Ping:** opens the ping wheel for mouse-only players.

## Rules

- The minimap shows exactly the client's projection: nothing outside the vision group's fog, ever ([fog-of-war.md](../fog-of-war.md)).
- Under-attack alerts mark **your** attacked unit or structure, never the hidden attacker.
- It renders from the same fog texture and entity data as the world view, at a reduced rate (every few frames) to save time.
- Colour-blind mode changes the colours and adds shapes: structures square, units round, enemies diamond.
