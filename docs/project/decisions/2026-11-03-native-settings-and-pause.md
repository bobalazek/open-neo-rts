# 2026-11-03 — Native settings and pause panels

Continue the owner's native Babylon UI direction through both settings entry
points and the pause menu. One scene-owned panel renderer handles the actual
choice fields, checkboxes, text input, help and actions used by these screens.
Client controllers retain device validation/storage, modal state and match
commands. No new package, simulation data or saved-game format is introduced.

The normal menu retains its modal HTML dialog and semantic controls. A separate
presentation canvas is a child of that dialog so it receives native pointer
input without escaping modal focus. Its transparent background and shade leave
the world visible; graphics preview still changes the battlefield renderer.
This separation also keeps pause-menu art out of saved battlefield thumbnails.
The canvas and its graphics initialization are disposed with the menu, while the
match retains its original renderer and worker.

Home-route settings use the application canvas. Both entry points share the same
existing preference handlers and native widget style. Back/cancel rolls back an
unsaved preview; failed writes retain the saved configuration and expose its
existing refusal message. Native edits update the semantic controls and run those
same handlers. Semantic text edits retain the known focus-frame-only caret
mirroring limit recorded for later input polish.

The named-save pane keeps required/max-length validation and the original save
path. The Load gallery remains HTML until its separate native conversion; moving
between it and native pages disposes and recreates only menu presentation.
