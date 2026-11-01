# Match HUD

**Route:** `/match` · The in-match screen for every mode: skirmish, multiplayer, campaign, editor playtest, and replays (with the observer variant).

## Layout

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ ◉ 4 820 credits  ▲ 1 240 materials  ⚡ 85/100 power   ⏱ 12:41   ☰ Menu        │ resource bar
│ ┌ OBJECTIVES ─────────────┐                          ┌ TEAM ──────────────┐   │
│ │ ◻ Capture the dam        │                          │ Mara (army)  🎤    │   │
│ │ ◼ Destroy radar 04:12    │                          │ Bob (economy)      │   │
│ └──────────────────────────┘                          │ Bot · Force 2      │   │
│                                                       └────────────────────┘   │
│                                                                               │
│                     (3D battlefield)                                          │
│              Mara's cursor ↖ · Bob's placement ghost ▢                        │
│                                                                               │
│ ┌ FEED ──────────────────┐                                                    │
│ │ ⚠ Base under attack  ▸ │                                                    │
│ │ ✔ Tank ready          │                                                    │
│ │ Bob: going north       │                                                    │
│ └────────────────────────┘                                                    │
│ ┌──────────┐ ┌ SELECTION ─────────────────┐ ┌ COMMANDS ─┐ ┌ BUILD ─────────┐  │
│ │ MINIMAP  │ │ [Panther ×6] [Rifle ×12]    │ │ Q  W  E  R│ │ Base Inf Veh Air│ │
│ │          │ │ ████████░░ 82%  ★★          │ │ A  S  D  F│ │ [▣][▣][▣][▣]    │ │
│ │          │ │ Cannon · Heavy armor        │ │ Z  X  C  V│ │ [▣ 40%][▣]      │ │
│ └──────────┘ └─────────────────────────────┘ └───────────┘ └─────────────────┘  │
│ [1:8] [2:12] [3:—] … control groups      idle: 👷2 🏭1     [chat: Enter]       │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Elements

| Element             | Behaviour                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Resource bar**    | Built from the game profile's resource schema. Hover shows income per minute. Power turns red on brownout. Also shows the match timer and the menu button                |
| **Objectives**      | Primary, secondary and timers; collapsible. Updates are announced. See [objectives-and-victory.md](../objectives-and-victory.md)                                         |
| **Team panel**      | Teammates, their roles and grants, voice indicator, and a resource-transfer button (when the ruleset allows). Diplomacy button in diplomacy modes                        |
| **Event feed**      | Notifications and chat, with click-to-jump; fades after a few seconds. The announcer voice mirrors important lines                                                       |
| **Minimap**         | Terrain, fog, units, pings and teammates' camera frames. Click to move the camera, right-click to order, Alt-click to ping. Buttons to toggle overlays and the ally view |
| **Selection panel** | One unit: portrait, health, veterancy, weapons, armor, cargo. Several: grouped by type; click a group to narrow the selection                                            |
| **Command card**    | A 4×3 grid of orders and abilities matching the hotkey layout, with cooldown overlays and a tooltip for each                                                             |
| **Build panel**     | Tabs per category with icons, cost and build time; queue counts, progress, and locked items explaining their requirements. Production structures can be cycled           |
| **Control groups**  | Groups 1–0 with counts; click to select, double-click to jump                                                                                                            |
| **Idle indicators** | Idle workers and idle production; click to cycle through them                                                                                                            |
| **Chat**            | Enter opens chat; Tab switches team or all; `/w name` whispers. Shift+Enter quick-sends to team                                                                          |
| **Ping wheel**      | Hold G (or Alt-click) for attack, defend, on-my-way, danger and "need help"                                                                                              |
| **Co-op presence**  | Teammates' cursors, placement ghosts and selection outlines in their colours. See [multiplayer.md §9](../multiplayer.md#9-co-op-presence-and-communication)              |

## Information overlays

- **World labels:** health bars (per setting), veterancy, construction and production progress, power state, rally lines, and waypoint queues for the selection.
- **Hover tooltip:** name, owner, health, armor class, weapons, and strong-against and weak-against icons; see [combat-and-balance.md](../combat-and-balance.md).
- **Selection:** weapon range and vision circles, ability areas of effect. When placing a building, the footprint grid shows green (buildable) or red (blocked).
- **Map overlays** (toggles next to the minimap): territory, supply, trade routes, pathing and detection.
- **Score overlay** (hold Tab): army value, income and score per Force, limited to what your vision allows.

## Controls

**Esc priority:** Esc first cancels the current mode (building placement, ability targeting, open chat), then clears the selection, and only then opens the [in-game menu](in-game-menu.md).

- **Mouse:** left-click and box-select; right-click for the context command; double-click selects all visible units of that type; Shift adds to the selection or queues orders.
- **Orders:** attack-move (A), stop (S), hold (H), patrol (P), guard, scatter, rally point, and formation move (right-drag sets facing and width).
- **Camera:** arrow keys, edge scroll, middle-drag to rotate, wheel to zoom, Space to jump to the last alert, Home to jump to base, saved camera positions if bound.
- **Control groups:** Ctrl+number to set, number to select, double-tap to centre the camera.
- **Hotkeys:** the default grid layout uses QWER / ASDF / ZXCV for the command card, so letter keys never move the camera. A "WASD camera" layout preset moves the command card to other keys for players who prefer it. The grid layout matches the command card; the classic per-letter layout is an option. Everything can be rebound in [settings](settings.md). Full list: [hotkeys.md](../hotkeys.md). Order behaviour: [units-and-orders.md](../units-and-orders.md).

## Variants

- **Playtest tools** (map editor playtest only): an extra panel docked on the right, containing:
  - a spawn palette (search any definition, pick an owner, click to place);
  - god tools (move, damage, heal, delete, change owner);
  - rule toggles;
  - time controls (pause, single-tick step, speed);
  - an entity inspector with components, orders and AI reasoning;
  - save and load state.
- **Observer and replay:** no command card or build panel. Instead: player tabs with resources, income, army value and production queues for every Force; a vision switcher; and timeline controls in replays (see [replays.md](replays.md)).
- **Eliminated (Last Stand):** a banner shows the options to spectate the team or request to assist an ally. See [multiplayer.md §4](../multiplayer.md#4-eliminated-players-and-ally-assistance).
- **Paused (multiplayer):** a banner shows who paused, the remaining pauses, and an unpause vote.
