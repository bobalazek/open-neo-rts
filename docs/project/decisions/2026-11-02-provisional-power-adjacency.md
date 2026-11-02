# 2026-11-02 — Reactor power adjacency

The owner delegated missing implementation choices. Activate the Industrial
Reactor's existing authored power rule: +10% per qualifying source, radius one
cell, at most three sources. Preserve its 140 base output and original content.

[OpenRA's Power/PowerMultiplier traits](https://docs.openra.net/en/release/traits/#powermultiplier)
separate base output from conditional modifiers. [Forged Alliance Forever's
unit blueprint](https://github.com/FAForever/fa/blob/develop/engine/Core/Blueprints/UnitBlueprint.lua)
also keeps adjacency production bonuses in data. Use those data/conditional
patterns with our existing integer power balance, not their implementation or
balance numbers.

Provisional interpretations:

- A rule belongs to the receiving positive-output structure. Matching sources
  are other completed, living, enabled positive-output structures of the same
  Force, with every authored tag. Construction sites, off/EMP-disabled sources,
  dead actors and the receiving structure itself never count.
- Radius measures minimum Euclidean distance between rotated footprint edges,
  inclusively. A one-cell gap qualifies; a diagonal one-cell gap on both axes
  does not. No terrain-height/line-of-sight condition is added.
- Count qualifying sources in sorted actor-ID order up to each authored cap.
  Add bonuses to base output and floor once. Never use a neighbour's boosted
  output to calculate another bonus. Multiple rules add their bounded gains;
  the source list contains distinct sorted actor IDs internally.
- Recompute from current state so completion, ownership, power preferences,
  disable, movement/rotation, sale and death cannot leave stale links. A powered
  reactor retains its own output in brownout. Disabled reactors neither provide
  nor receive an active bonus; base/manual state remains unchanged.
- Economic inspection exposes effective output, base output and permitted
  opaque source handles. The HUD names sources with map coordinates. No enemy
  power or raw actor IDs become public.

This is 2-45a. Industrial-capacity rewards and Mass Production Surge remain
2-45b/c, using the authored surge's values. Existing approved free mode toggles
are unchanged; adding costs later is a separate balance change.
