# Screens

Every screen in the game, with its layout, elements, states and navigation. Each screen has its own doc; wireframes are ASCII and show structure, not final art.

## Screen flow

```text
Boot ──► First launch ──► Home
                           │
   ┌───────────────┬───────┴──────┬──────────────┬──────────┬──────────┬──────────┐
   ▼               ▼              ▼              ▼          ▼          ▼          ▼
Single player   Multiplayer    Map editor     Replays    Field      Settings   Credits
   │               │              │              │        manual
   ├─ Skirmish     ├─ Room        └─ Playtest    └─► Replay viewer
   │  setup ───┐   │  browser          │
   ├─ Campaign │   └─► Lobby ──┐       │
   │  (later) ─┤               │       │
   └─ Load ────┤               │       │
               ▼               ▼       ▼
             Loading ──► Match HUD (+ playtest tools in the editor) ──► Post-match ──► back
                             │
                             └─ In-game menu (Esc) ─► Settings / Save / Load / Leave
```

| Screen                                        | Route                                     | Doc                                            |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Boot, first launch, home, credits             | `/`, `/credits`                           | [home.md](home.md)                             |
| Campaign select, mission briefing, debriefing | `/campaign/…`                             | [campaign.md](campaign.md)                     |
| Skirmish setup                                | `/skirmish`                               | [skirmish-setup.md](skirmish-setup.md)         |
| Load game                                     | `/load`                                   | [load-game.md](load-game.md)                   |
| Field manual                                  | `/manual`                                 | [onboarding.md](../onboarding.md#field-manual) |
| Room browser                                  | `/multiplayer`                            | [multiplayer.md](multiplayer.md)               |
| Lobby                                         | `/lobby/:code`                            | [lobby.md](lobby.md)                           |
| Loading                                       | (overlay)                                 | [loading.md](loading.md)                       |
| Match HUD                                     | `/match`                                  | [match-hud.md](match-hud.md)                   |
| In-game menu                                  | (overlay)                                 | [in-game-menu.md](in-game-menu.md)             |
| Post-match                                    | (overlay)                                 | [post-match.md](post-match.md)                 |
| Settings                                      | `/settings`, and as an overlay in a match | [settings.md](settings.md)                     |
| Replays and replay viewer                     | `/replays`, `/replay/:id`                 | [replays.md](replays.md)                       |
| Map editor and playtest                       | `/editor`, `/editor/playtest`             | [map-editor.md](map-editor.md)                 |
| Model viewer                                  | `/tools/models`                           | [model-viewer.md](model-viewer.md)             |

Routes are real URLs in the web build, so screens can be deep-linked (e.g. PR previews link straight into `/editor/playtest?spawn=unit:panther`).

## UI look

The UI matches the blocky, toy-brick world ([art-and-audio.md](../art-and-audio.md)).

- **Panels:** chunky rectangles with bevelled edges, like flat bricks. Dark, slightly translucent panels over the 3D scene, with a bright accent edge.
- **Buttons:** brick-shaped, with a raised look and a visible press-down state. The primary action is accent-coloured; secondary actions are neutral.
- **Typography:** a bold, rounded sans for headings, and a clean sans for body text and numbers (tabular figures for resources and timers).
- **Colour:** neutral dark UI in menus. In a match, the accent follows the player's faction colour. Team colours are always paired with an icon or pattern, never colour alone.
- **Background:** menus sit over a slowly orbiting 3D diorama of a brick-built battlefield, rendered by the real renderer at low cost.
- **Motion:** short, snappy transitions (bricks sliding into place). Everything respects the reduced-motion setting.

## Conventions for every screen

- **Navigation:** Esc or Back always returns to the previous screen. Screens never trap the player.
- **Keyboard and controller-friendly focus:** every control is reachable by keyboard with a visible focus ring.
- **States:** every screen defines its loading, empty and error states. Errors say what went wrong and what to do next.
- **Text:** all strings come from locale files. Layouts must survive 30% longer strings.
- **Scaling:** layouts work from 1280×720 up to ultrawide, and with UI scale from 75% to 150%.
- **Tech:** React components in `apps/web/src/features/<screen>/`. Screens read state, and send commands or service calls; they never touch the sim directly.
