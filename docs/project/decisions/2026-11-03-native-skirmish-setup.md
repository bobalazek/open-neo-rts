# 2026-11-03 — Native Babylon skirmish setup

Continue the owner's requested native GUI pass after Home. Use the installed
official Babylon GUI extension for visible controls and retain the existing
client controller for validation, save/load/defaults and the normal match start.
No simulation changes, new roster options or saved setup migration are needed.

Use native InputText, checkbox, spawn-choice buttons and ScrollViewer. Native
edits and semantic HTML edits update the same form values and validator. Tab from
a native text input joins the semantic form's order; focus scrolls the matching
native control into view. The canvas is excluded from assistive focus; attributes
are restored on disposal. A graphics initialization failure leaves the original
form visible and usable.

The native pointer text editor shows its own caret and selection. Semantic form
editing currently shows the corresponding native focus frame; mirroring its
caret/selection is recorded as input polish. Screen cancellation reaches engine
initialization so abandoned menus cannot later change a live match's canvas.

The map preview comes from the same authored terrain layers, resource positions
and spawn coordinates as normal Training Grounds. It does not read a running
simulation. Preview failure does not invent a substitute map: the existing match
loader remains responsible for checking terrain before starting.

Babylon [documents](https://doc.babylonjs.com/features/featuresDeepDive/gui/gui)
the native text control's keyboard and mobile prompt behavior. Keep the semantic
form for browser editing and assistive access; physical keyboard/touch and actual
screen-reader qualification remain separate from automated browser coverage.
