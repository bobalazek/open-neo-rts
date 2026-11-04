# Battlefield queued waypoints

Scope: `src/features/match/waypoints.ts`, the existing projected route overlay and
HUD/session bindings. Operate mode for players editing their selected actors'
pending commands directly on the battlefield.

Preserve Graphite Command Stations, the native Babylon HUD, original models,
terrain and existing cyan route strokes. No new panel, font, palette or raster.
The battlefield remains the working surface; existing keyboard-accessible queue
controls remain the alternative to dragging. Only published pending markers can
be hit; ghosts and hidden target positions cannot become interaction targets.

The signature interaction is a small diamond on hover, a terrain-aligned route
preview while dragging, then an authoritative edit on release. Right-click
removes the queued order; a right-drag still pans. Build origins stay grid-aligned;
unit destinations use cell centres. Escape, lost selection, missing pending
items, blur and an invalid/HUD drop cancel the preview. Pending commands use the
existing HUD feedback and worker/grant validation. Shared builder jobs retain
the engine's group behavior. Current orders, selection, normal world orders and
the minimap must survive the new gesture priority.

Inherits `PRODUCT.md`, `DESIGN.md` and the emitted body contract in
`../../apps/web/index.html`; this is a code-led extension of the incumbent world.
Delivered: the real normal-match journey passes in Chromium and WebKit at
1440×900 and 390×844, including shared builds and cancellation. Seven actual
captures in `.impeccable/review/` received the shipped finish review's `ship`
disposition; independent technical review accepted the scoped implementation.
Keyboard editing/removal retains the existing queue controls and native
tooltips. Physical touch, screen readers, Firefox and hardware FPS are not
qualified by this evidence.
