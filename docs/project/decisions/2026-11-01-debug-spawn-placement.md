# 2026-11-01 — Debug spawning skips build radius

**Context.** Phase 1b needs authoritative static placement without inventing the normal build radius, first-structure or unit move-aside/wait policy.

**Decision.** Borut explicitly approved: “Yes—debug spawning skips build radius.” Debug spawning still enforces terrain rules, map bounds and occupied cells. A unit in a static footprint makes the debug spawn fail immediately; debug spawning never moves or deletes that unit. Node cell rules still refuse until the owner decides the content and ownership policy.

**Consequences.** Positive structure placement in debug mode is permitted without an existing same-Force structure. This decision does not select a normal build radius, first-structure behavior, move-aside behavior or wait duration. Those remain owner gates for normal construction. Normal matches still reject every `debug.*` command as `debug_only`.

The authoritative footprint keeps the original content dimensions and rotates only at placement. Footprint rotation 0 faces south, so its command facing is `0x4000` under the existing transform convention (0 faces east). Static props use their authored footprint and blocking flag; content does not define terrain cell rules for props. An indestructible prop uses health/maxHealth 0 as an engine marker, not invented durability.

Map resources retain the authored centre, amount and optional radius in integer subcells. Ore occupancy reuses the inclusive integer-cell disc already drawn by the CLI map preview, with the existing one-cell default radius. Material nodes use the existing centred 2×2 visual footprint. Units may stand on resources; static objects may not. Resource amount splitting, depletion and node-bound structures are not implemented here.

These outcome changes bump the simulation version to 3. Scenario format 2 remains the envelope format; simulation-version-2 logs are rejected explicitly. The checked-in current scenarios are regenerated and tested under version 3; no old log is silently upgraded on import.
