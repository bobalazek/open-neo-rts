# 2026-11-03 — Native Babylon Home

The owner requested a stronger main menu and logo, then explicitly preferred
Babylon's GUI over the existing HTML presentation.

Use the official `@babylonjs/gui` extension, pinned to the same 9.33.1 version as
core and loaders. The [fullscreen GUI](https://doc.babylonjs.com/features/featuresDeepDive/gui/gui)
provides the visible Home buttons, text and original vector wordmark. This is
rendering infrastructure, not a gameplay-system dependency. Babylon remains
inside `packages/render`; client code owns navigation and saves.

Home displays the owner's original Eastern Collective Dragon Tank using the
existing GLB loader, team material slots and idle playback. The slow display
rotation stops for the saved or OS reduced-motion preference. No external artwork
or fonts are imported, and no simulation runs behind the menu.

Keep semantic HTML controls for keyboard and assistive technology, synchronized
with the same action descriptors. These controls are visually clipped only after
the native scene is ready; visible pointer interaction goes through Babylon GUI.
If graphics initialization fails, the working HTML menu stays visible. Continue
still uses the newest compatible browser save and the existing loading path.

This task converts Home. Setup, settings, saves, debug tools and the match HUD
retain their current presentation pending their own native-GUI tasks. Their
existing behavior must continue to work during this staged conversion.
