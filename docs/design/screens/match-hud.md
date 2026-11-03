# Match HUD

**Route:** `/match` · The in-match screen for every mode: skirmish, multiplayer, campaign, editor playtest, and replays (with the observer variant).

The current normal skirmish uses native Babylon GUI on the battlefield scene.
One bottom-left station combines selection and contextual commands/recipes; a
circular minimap sits on the right. Complete descriptions appear on hover or
keyboard focus, and Details retains full actor state and secondary actions.
Clipped HTML keeps semantic controls and the existing command handlers. Later
mode-specific elements below remain design reference, not implemented claims.

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
│ [1 ×8] [2 ×12]  populated groups · idle builders / producers                  │
│ ┌ SELECTION + CONTEXTUAL CONTROLS ────────────────────┐     ╭────────────╮  │
│ │ [portrait] Name/count   Commands | Build / train     │    ╱            ╲ │
│ │ health                 Q  W  E  R   [recipe icons]  │   │   MINIMAP    │ │
│ │                        A  S  D  F                  │   │ full rotated │ │
│ │ Details (I)            Z  X  C  V   queue progress  │    ╲ square map ╱ │
│ └────────────────────────────────────────────────────┘     ╰────────────╯  │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Elements

| Element             | Behaviour                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Resource bar**    | Built from the resources the match's rules define. Hover shows income per minute. Power turns red on brownout. Also shows the match timer and the menu button            |
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

Native Details and the group chooser close before targeting or selection is
canceled. B switches the narrow Commands and Build / train views; I opens
Details. Available command icons keep their QWER / ASDF / ZXCV positions even
when unavailable actions are omitted. Only populated groups appear until the
group chooser is opened; Ctrl-click stores the selection in a group.

- **Mouse:** left-click and box-select; right-click for the context command; double-click selects all visible units of that type; Shift adds to the selection or queues orders.
- **Orders:** attack-move (A), stop (S), hold (H), patrol (P), guard, scatter, rally point, and formation move (right-drag sets facing and width).
- **Camera:** arrow keys, edge scroll, middle-drag to rotate, wheel to zoom, Space to jump to the last alert, Home to jump to base, saved camera positions if bound.
- **Control groups:** Ctrl+number to set, number to select, double-tap to centre the camera.
- **Hotkeys:** the default grid layout uses QWER / ASDF / ZXCV for the command card, so letter keys never move the camera. The **WASD camera** layout moves the command card to other keys for players who prefer it. Everything can be rebound in [settings](settings.md). Full list: [hotkeys.md](../hotkeys.md). Order behaviour: [units-and-orders.md](../units-and-orders.md).

## Variants

- **Map editor playtest:** the playtest reuses [debug mode](debug-mode.md)'s panels (spawn, inspector, time controls, overlays, export command log) instead of having its own tools.
- **Observer and replay:** no command card or build panel. Instead: player tabs with resources, income, army value and production queues for every Force; a vision switcher; and timeline controls in replays (see [replays.md](replays.md)).
- **Eliminated (Last Stand):** a banner shows the options to spectate the team or request to assist an ally. See [multiplayer.md §4](../multiplayer.md#4-eliminated-players-and-ally-assistance).
- **Paused (multiplayer):** a banner shows who paused, the remaining pauses, and an unpause vote.
