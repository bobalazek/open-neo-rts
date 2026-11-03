# Device-local bindings for the current match controls

The [hotkey design](../../design/hotkeys.md) calls for editable shortcuts,
conflict warnings and Grid/WASD presets. Reuse the native Settings panel and
actual HUD, minimap and camera controllers. The [owner's implementation
autonomy](./2026-11-02-provisional-implementation-autonomy.md) applies to these
provisional choices. No canonical simulation state, outcomes or version change.

A single versioned device profile owns the currently implemented normal-match
keyboard actions: the twelve command slots, extra unit actions, camera movement
and rotation reset, base/alert jumps, idle selection, native Details/Build modes,
pause/speed, optional quicksave/load, and each group's select/set/add shortcut.
Actions accept two physical key-code chords or no binding. Shift continues
queueing orders and can remain held while panning. Escape, Tab, composition,
Meta shortcuts and known browser/OS accelerators retain their platform roles.
Normal gameplay never consumes shortcuts while editing a field or modal.

The editor stages changes until Apply. It reports conflicting actions and blocks
Apply until resolved; import validates a bounded JSON envelope without changing
active controls, and failed persistence keeps the previous profile. An explicit
save event updates the active match and visible hints without restarting it.
Command slot positions stay independent of key captions. Normal camera input
receives a resolver across the render/client boundary; debug and replay retain
their existing controls.

The design's proposed WASD preset places groups on F1 despite reserving F1.
Provisional resolution: Grid remains unchanged. WASD uses W/A/S/D camera pan,
numeric commands `1–4 / 5–8 / 9,0,−,+`, and Alt-number group selection with
Ctrl+Alt-number storing and Alt+Shift-number adding. Speed moves to brackets
with existing numpad alternatives. F1 stays unassigned. This is editable and
does not claim physical browser/OS accelerator capture; the deferred native-key
acceptance remains separate.

The established RTS reference is the official [Age of Empires IV remapping
update](https://www.ageofempires.com/news/age-of-empires-iv-update-17718/): expose
conflicts rather than silently dropping an existing assignment. Our existing
design is stricter and refuses to apply conflicts. Audio, mouse/overlay options,
unimplemented game actions and later editor/spectator shortcuts retain their
own roadmap work; this does not close the whole phase-2 exit.
