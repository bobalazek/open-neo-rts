# 2026-11-04 — Edit pending waypoints on the battlefield

Task 2-17c implements the existing units-and-orders design: drag a pending
destination to move it, or right-click its marker to remove its order. A small
cyan diamond appears on hover; dragging previews a copied route and sends the
existing queue command only on a valid release. Unit destinations use cell
centres and construction uses grid origins. Non-spatial target orders can be
removed but not moved. Active orders remain display-only.

The renderer only uses permitted projected queue rows. The HUD rechecks the
selected owner's pending handle and the worker retains authoritative grants,
validation and shared-builder grouping. This introduces no simulation outcome
or version change. A shared pending build moves or cancels for its whole group
without spending credits before execution.

Escape, blur, lost selection/marker, pointer cancellation and HUD/out-of-bounds
drops discard previews. Right-drag still pans; ordinary world commands and
selection retain their existing handlers. CSS-pixel picking uses a 12-pixel
radius across graphics scaling and inset viewports. Existing native queue
controls retain keyboard editing/removal and localized hover/focus help; no new
panel or browser-native canvas tooltip is introduced.

The normal-match Chromium/WebKit journey covers desktop and narrow layouts,
preview authority, movement edits, cancellation, shared builds, deletion,
selection and camera panning. Renderer tests cover CSS/render scaling, copied
metadata, material reuse and target loss. An independent technical review and
the shipped visual finish review accepted this bounded extension. This evidence
does not qualify physical touch, screen readers, Firefox or hardware frame rate.
