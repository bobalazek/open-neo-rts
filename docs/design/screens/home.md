# Boot, home and credits

## Boot

A short splash with the logo while the renderer starts and core content loads. It checks WebGPU support (falling back to WebGL 2) and loads settings and the profile. If the browser can't run the game at all, it shows a clear message with requirements instead of a blank page.

## First launch

Shown once, when there's no profile yet.

```text
┌──────────────────────────────────────────────┐
│               OPEN NEO RTS                   │
│                                              │
│   Commander name  [ ____________________ ]   │
│   Language        [ English          ▾ ]     │
│   Graphics        [ Auto-detected: High ▾ ]  │
│                                              │
│                       [  Continue  ]         │
└──────────────────────────────────────────────┘
```

The name is used in lobbies and saves and can be changed later in settings. Graphics are auto-detected from a short benchmark.

## Home

The current implementation uses native Babylon fullscreen GUI, with an original
angular vector wordmark and the authored Eastern Collective Dragon Tank on a
rotating display plinth. Narrow screens place navigation below the model. Saved
or OS reduced-motion settings stop rotation. Semantic HTML retains keyboard and
assistive access; it becomes the visible fallback when the engine cannot start.
See the [implementation decision](../../project/decisions/2026-11-03-native-menu.md).
The battle diorama and later-phase entries in the target layout below remain work.

**Route:** `/` · **To:** single player, multiplayer, map editor, replays, settings, credits

```text
┌────────────────────────────────────────────────────────────────────┐
│  OPEN NEO RTS                                      Commander: Bob ✎ │
│                                                                    │
│  ▌ CONTINUE                                                        │
│    Mission 3: Iron Valley · autosave 2 min ago                     │
│                                                                    │
│  ▌ Single player          (orbiting 3D diorama of a brick battle)  │
│  ▌ Multiplayer                                                     │
│  ▌ Map editor                                                      │
│  ▌ Replays                                                         │
│  ▌ Field manual                                                    │
│  ▌ Settings                                                        │
│  ▌ Credits                                                         │
│  ▌ Quit                   (desktop only)                           │
│                                                                    │
│  v0.1.0 · sim 1                       What's new ▸   Report a bug ▸│
└────────────────────────────────────────────────────────────────────┘
```

- **Continue** appears only when a save exists, and loads the most recent one.
- **Single player** opens a submenu: Skirmish, Campaign (later), Load game.
- **Rejoin match** replaces Continue when a multiplayer match the player left is still running.
- The footer shows the game version and simulation version (useful in bug reports), a changelog link and a bug-report link.
- **States:** offline is fine; Multiplayer shows "offline" and is disabled when the server is unreachable.

## Credits

**Route:** `/credits`. A scrolling list: project lead, contributors (from git history), asset authors (generated from every `assets.json`), and the open-source libraries used with their licences. Esc returns to Home.
