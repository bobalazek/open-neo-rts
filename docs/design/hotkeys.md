# Default hotkeys

Everything is rebindable in [settings](screens/settings.md). Two layouts ship: **Grid** (default) and **WASD camera**.

## Grid layout (default)

The command card is a 4×3 grid mapped to the left hand:

```text
Q  W  E  R
A  S  D  F
Z  X  C  V
```

Fixed positions on the card: **A** attack-move, **S** stop, **H** hold position (outside the grid), **P** patrol, **X** scatter, **D** deploy, **U** unload. Ability and production buttons fill the remaining slots in a consistent order per unit type.

## General

| Action                          | Key                                                                    |
| ------------------------------- | ---------------------------------------------------------------------- |
| In-game menu / cancel           | Esc (cancels the current mode first)                                   |
| Select all army units on screen | Ctrl + A                                                               |
| Select all of a type on screen  | Double-click, or Ctrl + click                                          |
| Control groups                  | Ctrl + 0–9 set, 0–9 select, Shift + 0–9 add, double-tap to centre      |
| Jump to last alert              | Space                                                                  |
| Jump to base                    | Home                                                                   |
| Camera positions                | Unbound by default (F-keys are reserved by browsers); bind in settings |
| Cycle idle workers              | . (period)                                                             |
| Cycle idle production           | , (comma)                                                              |
| Chat                            | Enter (team), Shift + Enter (all)                                      |
| Ping wheel                      | Hold G                                                                 |
| Score overlay                   | Hold Tab                                                               |
| Map overlays                    | O (cycles territory, pathing, supply, off)                             |
| HUD help                        | ?                                                                      |
| Game speed (single player)      | + / −                                                                  |
| Pause (single player)           | Pause                                                                  |
| Screenshot                      | Button in the in-game menu (no default key)                            |

## Camera

Arrow keys, edge scroll, middle-drag to rotate, wheel to zoom, Backspace to reset rotation.

## WASD camera layout

WASD pans the camera; the command card moves to **1–4 / Shift + 1–4 / Alt + 1–4**, and control groups move to **F1–F4 + Ctrl/Shift**. Meant for players coming from other genres.

## Browser-reserved keys

Browsers keep some keys for themselves, and a page can't always override them.

- **Never bound by default:** F1 (help), F3 (find), F5 (reload), F11 (fullscreen), F12 (developer tools), Ctrl/Cmd + W, T, N, L, R, Q.
- **Control groups (`Ctrl + number`):** in a windowed browser tab, `Ctrl + 1–9` switches tabs. The game asks once to go fullscreen, where Chromium-based browsers allow the page to capture these keys (Keyboard Lock API); the desktop app always can. Where neither works, the game offers a fallback binding. Which fallback works in each browser is settled by a key-capture spike in phase 1b.
- **Esc in fullscreen:** a short press reaches the game (cancel, then menu); holding Esc leaves fullscreen.

## Conflicts

The keybind screen warns on any conflict within the same context (match, editor, menus) and refuses to save until it's resolved.
