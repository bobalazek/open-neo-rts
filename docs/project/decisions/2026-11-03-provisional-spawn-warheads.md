# Provisional impact unit spawning

The owner delegated implementation defaults while remaining gameplay is built.
Complete the existing weapon `spawn` vocabulary without changing faction content.
Authored Mobile Factory Complex and Nanite Constructor ability effects remain
their separate later ability work; this does not activate those placeholders.

[OpenRA's SpawnActorPower](https://github.com/OpenRA/OpenRA/blob/release-20250330/OpenRA.Mods.Common/Traits/SupportPowers/SpawnActorPower.cs)
keeps actor ownership and map/terrain validation explicit when deploying a new
actor. Use our existing unit allocation and navigation instead. The following
placement and population choices are provisional rules for this game:

- The warhead names an existing unit definition. A missing unit does nothing;
  supplied references require population, domain and radius metadata before a
  match/replay starts. Count defaults to one and is bounded by the existing
  1–20 content contract. No new mine/cloud/vehicle definition is invented.
- Spawn for the firing Force, using launch-retained ownership and the actual
  impact location. Delayed payloads survive shooter/victim death. An already
  defeated Force cannot be revived. Payloads are surface-only; air-domain units
  and airborne impacts remain unavailable until the air lifecycle is built.
- Consider the impact cell and four cells in each direction (a bounded 9×9
  square), ordered by exact squared distance to impact, then row and column.
  Use cell centres and the current navigation domain/radius/static occupancy.
  Reject overlapping live unit bodies, including earlier output in the same
  payload. Ground rules apply to every supported ground/water movement domain.
  No whole-map fallback or requirement to travel from the impact point exists.
- Share production's current population rule, including living cargo and
  zero-pop units. Each successful unit consumes its authored population; stop
  when full. Blocked/capped output is partial or empty, never retried or queued.
  This avoids a separate reservation or hidden spawn job.
- Allocate an ordinary full-health unit facing the shot direction. It starts
  without an order, XP or construction work and gains its normal vision on the
  next end-of-tick refresh. Increment units-built statistics once per successful output.
  The weapon is the source: no additional construction cost, build time,
  production prerequisites or rally order applies. Armour, resistance, falloff
  and friendly fire do not change an environmental spawn count.
- Existing seat projection, team colour, model lifecycle, fog and opaque handles
  handle the ordinary units. Pending impacts and spawned actors are canonical
  state; no new private field or worker protocol is introduced.

SIM57 adds these outcomes. The spawned-state golden at tick 100 is
`b89a555cae666f71`; normal save restoration and command replay continue to the
same final hash. Existing scenario headers advance with unchanged outcome
goldens. Older simulation-version saves/records remain explicitly incompatible.
No authored spawn weapon is activated. Persistent burning ground, ability
wiring and full phase-2 acceptance remain work.
