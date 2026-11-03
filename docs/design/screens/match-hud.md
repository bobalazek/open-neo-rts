# Match HUD

**Route:** `/match` · The in-match screen for every mode: skirmish, multiplayer, campaign, editor playtest, and replays (with the observer variant).

The current normal skirmish uses native Babylon GUI on the battlefield scene.
Economy sits beside the contextual selection station; a circular minimap sits
on the right. Compact objective/status/menu controls leave the upper field clear.
Complete descriptions appear on hover or
keyboard focus, and Details retains full actor state and secondary actions.
Clipped HTML keeps semantic controls and the existing command handlers. Later
mode-specific elements below remain design reference, not implemented claims.

## Layout

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Last Man Standing              clock / speed              icon controls │
│                                                                          │
│                          3D battlefield                                  │
│                                                                          │
│ [1 ×8]                                                   event notices   │
│ [2 ×3]                                                                   │
│ idle helpers                                              circular map   │
│ ┌ ECONOMY ┐ ┌ SELECTION + CONTEXT ───────────────────┐    ╭───────────╮  │
│ │ credits │ │ Name/count · Details icon (I)          │   ╱             ╲ │
│ │ material│ │ owner / Force color  mode icons (B)    │  │ full rotated  ││
│ │ power   │ │ model/type counts   command / recipes │  │  square map   ││
│ │ pop     │ │ health             queue progress    │   ╲             ╱ │
│ └─────────┘ └───────────────────────────────────────┘    ╰───────────╯  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Elements

The current [region pass](../../project/decisions/2026-11-03-battlefield-regions.md)
uses clickable original type thumbnails and explicit owner labels. The selection
station and its hit area disappear when selection is empty. Compact layouts stack
the economy above the station; Details stays above both the map and economy.
The following table also describes later-mode reference elements.

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
