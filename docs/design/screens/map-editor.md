# Map editor screen

**Route:** `/editor` · **From:** Home · Editor tools, formats and validation are in [map-editor.md](../../engineering/map-editor.md).

## Start

New map (size, pack, base biome, number of height levels), open a recent map, or import a map file.

## Editor layout

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ File ▾ Edit ▾ View ▾   ↶ ↷   Iron Valley* · 128×128 · standard   [▶ Playtest] │
│ ┌ TOOLS ┐ ┌───────────────────────────────────────────────┐ ┌ INSPECTOR ────┐ │
│ │ ⛰ Height│ │                                               │ │ Selected:     │ │
│ │ ▤ Paint │ │            (3D map view, same renderer        │ │ Spawn "north" │ │
│ │ 🌲 Props│ │             as the game; grid overlay)        │ │ x 20  y 20    │ │
│ │ ▣ Units │ │                                               │ │ facing 135°   │ │
│ │ ◎ Spawns│ │                                               │ │ teams [1,2]   │ │
│ │ ◆ Res.  │ │                                               │ ├ BRUSH ────────┤ │
│ │ ▭ Region│ │                                               │ │ Size ──●──    │ │
│ │ ⚑ Object│ │                                               │ │ Level +1      │ │
│ │ ⚙ Trigs │ │                                               │ │ Symmetry: 2×  │ │
│ └─────────┘ └───────────────────────────────────────────────┘ └───────────────┘ │
│ ┌ PALETTE: biome tiles / props / units ───────────────────────┐ ┌ VALIDATION ─┐ │
│ │ [grass][sand][rock][snow][road][tree][rock][ruin] …         │ │ ⚠ 2 issues ▸│ │
│ └─────────────────────────────────────────────────────────────┘ └─────────────┘ │
│ Overlays: [Pathing] [Buildable] [Territory] [Fog preview] [Fairness]            │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Tools:** height (raise or lower a level, flatten, ramp), paint (biome surface tiles), props (trees, rocks, decorations), units and structures (pre-placed, with owner), spawns, resources, regions, objectives, and triggers (opens the scenario editor).
- **Inspector:** properties of the selected object, or the active brush's settings.
- **Validation panel:** live issues with a click-to-locate action (unreachable resources, spawn unfairness, missing content).
- **Playtest:** compiles the map and starts a local match with the map's spawns and bots. Returning lands back in the editor at the same camera position.
- Undo and redo for everything, autosaved drafts, and explicit Save and Export.
