# UI and icon style

How the interface looks so every screen, icon and marker is consistent. Screen layouts are in [screens/](screens/README.md); the world's art direction is in [art-and-audio.md](art-and-audio.md).

## HUD zones

```text
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR: resources · power · timer · superweapon timers · ☰   │
│ OBJECTIVES (top left)                    TEAM PANEL (top right)│
│                                                              │
│                        world view                            │
│                                                              │
│ EVENT FEED (left, above minimap)                             │
│ MINIMAP │ SELECTION PANEL │ COMMAND CARD │ BUILD PANEL         │
│ CONTROL GROUPS · IDLE INDICATORS · CHAT                       │
└──────────────────────────────────────────────────────────────┘
```

Zones never overlap. Dialogs and the in-game menu sit above the HUD with a dimmed backdrop. Tooltips sit above everything.

The current [battlefield-first HUD](../project/decisions/2026-11-03-battlefield-hud.md)
uses a slim resource strip and framed graphite docks, with warm metal command
pictograms and original model thumbnails. The selected actors' actual health is
shown with a portrait and aggregate health bar. Prices and durations stay visible
on recipe tiles; hover, focus or tapping an unavailable recipe shows its complete
description and refusal reason. Disabled recipes use `aria-disabled` and block
activation while retaining focus for inspection. Pings expand from the minimap
toolbar. Narrow views show one dock at a time through the existing panel tabs.

## Icons

Every unit, structure, ability, upgrade and command has an icon, and they follow one style:

| Rule                | Detail                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Size                | Drawn at 128 × 128, shown at 64 or 48 px. Square. PNG with transparency                                                             |
| Subject             | A three-quarter view render of the actual model (units, structures) or a bold pictogram (commands, abilities)                       |
| Silhouette          | Readable in pure black at 32 px; no thin lines                                                                                      |
| Background          | Transparent; the UI draws the frame                                                                                                 |
| Colour              | The unit in neutral team grey; the UI tints it with the player's colour where needed                                                |
| Frame (drawn by UI) | Category shape: units square, structures square with a notched corner, abilities round, upgrades hexagonal, commands rounded square |

**Icon states**, drawn by the UI, not baked into the file:

| State               | Look                                              |
| ------------------- | ------------------------------------------------- |
| Available           | Normal, with cost below                           |
| Unaffordable        | Desaturated, cost in red                          |
| Locked              | Dimmed with a lock; tooltip names the requirement |
| In progress         | Clockwise progress sweep, percentage              |
| Queued              | Small count badge in the corner                   |
| Cooldown            | Dark sweep with remaining seconds                 |
| Auto-cast on        | Animated border                                   |
| Disabled (no power) | Lightning-bolt badge                              |

## Build panel pages

The build panel (bottom right) has **tabs** per category: Structures, Defences, Infantry, Vehicles, Aircraft, Naval. A tab shows a 4 × 3 grid. When a category has more than 12 items, the grid gets **pages**, switched with arrows or the scroll wheel, and items keep a fixed position so hotkeys stay stable. Tabs without anything buildable are hidden.

## Selection and feedback

| Element        | Look                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| Hover          | Thin white outline on the model                                                   |
| Own selected   | Team-coloured ring under units; team-coloured footprint outline under structures  |
| Allied         | Ring in the ally's colour when selected for inspection                            |
| Enemy          | Red ring when selected for inspection; red outline on hover with an attack cursor |
| Rally point    | Flag plus dashed line from the exit, while the structure is selected              |
| Order feedback | A short marker at the target: green for move, red for attack, yellow for ability  |
| Co-controllers | Thin outline in the co-controller's colour on units they've selected              |

**Cursors** change with context: select, move, attack, attack-move, enter transport, repair, capture, cannot.

## Colours and type

- **Interface:** dark translucent panels, a bright accent edge, and team-coloured accents in a match. Text contrast at least 4.5:1.
- **Team colours:** eight fixed, distinguishable colours, plus a colour-blind set that pairs colour with patterns.
- **Status colours:** green (good, own), yellow (warning, low power), red (danger, enemy), blue (allies, information).
- **Typography:** a bold rounded sans for headings and a clean sans with tabular numbers for resources and timers.
