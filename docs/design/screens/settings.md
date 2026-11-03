# Settings

**Route:** `/settings`, or as an overlay from the [in-game menu](in-game-menu.md)

The implemented graphics preset, interface scale, camera speed, edge scrolling
and reduced camera motion controls now use native Babylon GUI at both entry
points. Their existing validation and versioned device storage remain unchanged.
Changes preview live; Back or closing the match menu restores the last saved
preferences. Failed storage writes restore saved preferences and show the error.
Descriptions are visible alongside fields and keyboard focus scrolls them into
view. Semantic HTML retains assistive editing and the graphics-failure fallback.
The additional categories/options in the target layout below remain future work.

Controls now edits the currently implemented normal-match shortcuts in the same
native panel. Choose a category/action and primary/alternate slot, then capture
a physical key chord; Escape cancels capture. Clear and Reset action affect the
draft. Grid and provisional WASD presets replace the draft; import/export uses
bounded versioned JSON. Conflicts name the affected actions and block Apply.
Only a successful Apply changes active controls and device storage. Back keeps
the prior profile, including when a write fails. Current controls in a match
shows actual assignments and links to the same editor. Mouse/overlay options
and unimplemented action categories remain later work.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ◂ Back                         SETTINGS                                     │
│ ┌──────────────┐ ┌──────────────────────────────────────────────────────┐  │
│ │ Gameplay     │ │ GRAPHICS                                              │  │
│ │ Controls     │ │ Preset          [ High ▾ ]   (changes mark "Custom")  │  │
│ │▶Graphics     │ │ Renderer        [ Auto (WebGPU) ▾ ]                   │  │
│ │ Audio        │ │ Resolution scale ───●───── 100%                       │  │
│ │ Accessibility│ │ Frame cap       [ 60 ▾ ]   VSync ☑                    │  │
│ │ Multiplayer  │ │ Shadows         [ High ▾ ]                            │  │
│ │              │ │ Ambient occlusion ☑   Anti-aliasing [ FXAA ▾ ]        │  │
│ │              │ │ Effects density [ Full ▾ ]  LOD bias ──●──            │  │
│ │              │ │ Unit outlines ☑   Performance overlay ☐               │  │
│ └──────────────┘ └──────────────────────────────────────────────────────┘  │
│                                    [ Reset category ]  [ Apply ]           │
└────────────────────────────────────────────────────────────────────────────┘
```

| Category          | Options                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gameplay**      | Language; camera speed; edge-scroll speed; health bars (always / damaged / selected); tooltips (full / short / off); notification detail; auto-queue behaviour; confirm before surrender                                                                            |
| **Controls**      | Hotkey layout (grid / WASD camera); rebind every action, with conflict warnings; mouse sensitivity; edge scroll on/off; invert drag-rotate; hold vs. toggle for overlays; import and export bindings                                                                |
| **Graphics**      | Preset (low / medium / high / ultra / custom); renderer (auto / WebGPU / WebGL 2); resolution scale; frame cap and vsync; shadows; ambient occlusion; anti-aliasing; effects density; LOD bias; unit outlines; UI scale; performance overlay (FPS, tick time, ping) |
| **Audio**         | Master, music, effects, unit voices, announcer, UI and ambience volumes; mute when unfocused; subtitles for voice lines; output device (desktop)                                                                                                                    |
| **Accessibility** | Colour-blind team palettes; high-contrast selection; reduced camera shake and flashes; reduced motion; UI scale; subtitle size and background                                                                                                                       |
| **Multiplayer**   | Display name; region; chat filter; all-chat on/off; voice chat (input device, push-to-talk key or voice activation threshold, team voice volume, mute all); show teammate cursors                                                                                   |

- Graphics changes preview live behind the panel when opened from a match. The presets are defined in [art-and-audio.md](../art-and-audio.md#graphics).
- Settings are stored per device as versioned JSON: browser storage on the web, a settings file in the Tauri app. They are never part of the sim, replays or network state.
- Every option has a one-line description on hover or focus.
