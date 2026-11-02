# 2026-11-02 — Provisional first ground-transport lifecycle

The owner delegated missing implementation details for later polish. Keep the
Metamorphic APC's authored five infantry slots. Ground transports with authored
capacity accept same-Force foot infantry at one slot each; air/naval transports
and building garrisons remain separate work. No unit identities or base balance
change.

[OpenRA Cargo/Passenger](https://docs.openra.net/en/release/traits/#cargo)
separates passenger capacity, boarding and ejection policy. Use that separation
as a reference, with our own canonical components and existing navigation.

Board orders reserve capacity in command order, approach a reachable nearby
cell and board only within the combined radii plus half a cell on the same
terrain level. New explicit orders cancel boarding. Loaded infantry keep their
entity, health, owner and population usage but leave the spatial world: no
independent vision, targeting, movement, work or field presence. Cargo lists
are private to current transport-order control; visible enemies see no manifest.

Unload scans legal nearby cells in stable distance/y/x order, checking original
terrain/radius and live occupied circles. Blocked passengers stay aboard for a
later retry. There is no teleport to a remote clicked point. On ground transport
death, eject locally with half current health (minimum one) and clear old orders;
if no legal exit exists the passenger dies without a fabricated public exit or
death marker that would reveal hidden cargo count. Exit search is bounded to
four cells around the carrier and cannot cross static blockers or cliffs.
Ejection losses count for the owning
Force; secondary ejection damage has no invented attacker attribution.

These are provisional rules, not playtested balance. Boarding/unloading HUD and
commands belong to the same lifecycle delivery; passenger fire in deployed
Bunker Mode and transformation visuals remain explicit follow-up work.
