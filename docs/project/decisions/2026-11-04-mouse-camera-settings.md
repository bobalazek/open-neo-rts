# 2026-11-04 — Mouse camera device settings

Task 2-31b adds Mouse camera sensitivity and Invert drag rotation to the shared
native Settings panel from Home and the paused match. Reuse existing percentage
choices (50, 75, 100, 150, 200), defaulting to 100% and normal rotation. These
provisional device defaults follow the delegated implementation policy.

Sensitivity scales right-drag panning, middle-drag rotation and mouse-wheel
zoom. Keyboard/edge camera speed and programmatic zoom buttons remain separate.
Inversion changes only horizontal middle-drag rotation. The normal match and
replay camera consume these settings; gameplay state and replay outcomes do not.

Changes preview through the existing controller. Apply persists them; Back,
Escape and closing settings restore saved values. Reset previews defaults until
Apply. Failed storage writes retain saved preferences and the editable draft.
Native fields retain semantic labels, descriptions, keyboard editing, scrolling
and the existing graphics fallback.

The existing storage key is retained. Version-one payloads migrate to version
two with neutral mouse defaults while preserving graphics, scale, pan speed,
edge scrolling and reduced motion. Field validation remains strict and rejects
unknown properties, accessor properties and unsupported values. Only a normal
Apply writes the migrated payload. Downgrade compatibility is not a target.

Mouse/overlay settings for systems that do not yet exist remain task 2-31b;
this does not introduce a second overlay controller or speculative controls.
