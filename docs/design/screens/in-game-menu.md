# In-game menu

**Opened with:** Esc or the ☰ button in a match · **Overlay** over the dimmed match

The local match menu, settings, objectives, current-controls and named-save panes
use native Babylon GUI. Its canvas lives inside the existing modal HTML dialog,
so native pointer input and semantic keyboard/assistive focus share the same
modal lifetime. The original pause/speed/save/restart/surrender handlers remain
authoritative. The Load gallery uses native thumbnails and selected-slot controls.
Resume stays in the fixed menu header while the remaining actions scroll.
Escape closes a native choice list before backing out or
resuming. Disposing the menu cancels pending graphics startup and preference
previews; it never owns or disposes the battlefield renderer.

```text
            ┌──────────────────────────────┐
            │          PAUSED              │   (single player / playtest)
            │                              │
            │  ▌ Resume                    │
            │  ▌ Objectives                │
            │  ▌ Save game                 │   single player / playtest
            │  ▌ Load game                 │   single player / playtest
            │  ▌ Restart                   │   single player
            │  ▌ Settings                  │
            │  ▌ Keybinds                  │
            │  ▌ Surrender                 │   skirmish / multiplayer
            │  ▌ Leave match               │
            └──────────────────────────────┘
```

- **Single player and editor playtest:** opening the menu pauses the sim. The header says PAUSED.
- **Multiplayer:** the game keeps running behind the menu, and the header says GAME RUNNING. Pausing is a separate command (Pause key, or the button in this menu) with a limited number of pauses per player. Pausing and unpausing are announced to everyone, and unpausing needs a short countdown.
- **Save game:** opens a name field (default: map and time) and thumbnails the current view. In custom multiplayer matches the host can save too; the save is held by the server and players get a resume code ([saves-and-replays.md](../../engineering/saves-and-replays.md#multiplayer)).
- **Surrender:** asks for confirmation. Under Shared Command, it follows the Force's approval rule: if other controllers must agree, a vote appears for them.
- **Leave match:**
  - Single player asks whether to save first.
  - Multiplayer explains what happens to your seat under the match's [leave/disconnect policy](../match-rules.md#leaving-and-disconnecting) (co-controllers continue, a bot takes over, or the Force is eliminated in ranked), and that you can rejoin from Home while the match runs.
- **Settings** opens the same panels as the main-menu [settings](settings.md), as an overlay. Graphics changes apply live.
- **Objectives** shows the full objectives list with descriptions and progress.
