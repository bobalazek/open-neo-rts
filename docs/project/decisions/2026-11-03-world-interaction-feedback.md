# Visible work and world interaction feedback

The owner requested harvesting animation, hover silhouettes for characters and
structures, an outlined harvesting target, and no empty command panel. The
[regional HUD pass](./2026-11-03-battlefield-regions.md) already removes the empty
station. Its reference remains the [Age of Empires IV principal UX designer's
HUD rationale](https://kevinhustler.me/aoe4): keep permanent footprint and decoration
small, with relevant controls beside selection.

Use the installed Babylon SelectionOutlineLayer, grouping each actor's actual
visible geometry with native per-instance identity. A two-pixel brass outline
marks the hovered visible actor or resource and the currently selected truck's
canonical ore cell. Clear stale targets and hover, suppress during modal menus,
and refuse outlines crossing unseen cells. Remembered structures stay inert.

_Addition:_ the existing original Eastern Collective Supply Truck gains a small
collector/drum and a hinged cargo bed with `harvest` and `unload` clips. Preserve
its author, team-color materials, rest shape and gameplay footprint. Mining work
loops on the presentation clock; unloading samples actual completed dock ticks
so dock suspension cannot continue its animation. Returning to idle restores
authored rest; another truck instance remains unaffected.

Visible operation and unload pose progress are public presentation fields after
visibility filtering. Cargo and target coordinates retain existing economic
permissions and deep-copy isolation. Strict worker validation accepts these new
fields with bounded values; this changes no canonical state or outcomes. SIM53
and existing deterministic goldens remain unchanged.

Normal Chromium and WebKit journeys cover startup, actual mining, native outline,
target persistence and empty selection at desktop/narrow widths. Independent
review also checked instance isolation on the GPU, fog revocation, target removal
and unload suspension/resumption. Hardware performance and physical touch remain
unqualified, as already deferred; this does not complete the phase-2 exit.
