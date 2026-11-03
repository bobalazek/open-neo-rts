# Provisional timed area reveal

The owner delegated implementation defaults while remaining gameplay is built.
Complete the existing `reveal` warhead vocabulary without adding a weapon or
changing authored faction content. This is the 2-15b3b engine slice, not full
phase-2 acceptance.

[OpenRA's RevealShroudEffect](https://github.com/OpenRA/OpenRA/blob/release-20250330/OpenRA.Mods.Common/Effects/RevealShroudEffect.cs)
separates a temporary positional vision source from an actor's ordinary sight.
Use that concept with our existing counted cell vision. The following timing,
refresh and capacity choices are provisional rules for this game:

- A reveal warhead creates a circular sensor field at the actual impact point,
  for the firing Force and its shared-vision teammates. It ignores cliffs and
  opaque props; ordinary unit and building LOS is unchanged. Existing cell-centre
  circle sampling and map clipping apply. This does not implement stealth detection.
- Radius and duration must both be positive. Missing or zero values do nothing.
  Armour, target tags, falloff and friendly fire do not alter a positional sensor.
  Projectile launch legality, collision and authored delay still apply. Ground
  impacts work; source or direct victim death does not cancel a pending field.
- A field starts in the next published snapshot and remains visible for exactly
  the authored number of simulation ticks. The exclusive deadline and start tick
  are canonical private ECS data. Control/combat refresh current-tick sight;
  destruction and victory refresh the next published tick. Restore rebuilds the
  same visible counts at the saved clock, including one-tick fields and expiry.
- Identical Force/point/radius hits extend to the later deadline without adding
  durations. Distinct fields and ordinary sight contribute independent counts;
  expiry removes only that source. Explored history remains after expiry.
- Bound independent fields to 256. Refresh works at capacity; further distinct
  fields fail without replacing existing ones. Expiry frees capacity, even with
  fog off. Revisit this engineering limit if authored content requires more.
- Private non-actor rows are registered only for catalogs containing a reveal
  weapon. Worker projections expose the existing permitted vision grid, actors
  and last-seen structures, never field IDs, force metadata or timers. Units
  disappear after expiry; hidden structure changes do not update memory.

SIM56 adds these outcomes. The active-field golden is `eecbfe6741791c31` at tick
100 in the synthetic starting-kit combat regression; save restoration and
command replay must continue to the same final hash. Existing debug scenario
headers advance, with unchanged outcome goldens. Older-version saves/records
remain explicitly incompatible. No authored reveal round is activated. Spawn
warheads, persistent ground effects, later ability wiring and presentation remain
separate work.
