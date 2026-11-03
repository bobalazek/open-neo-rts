# Provisional persistent burning ground

The owner delegated implementation defaults while remaining gameplay is built.
Complete 2-15b3's ground effect using the existing burn radius/duration/rate data.
No new content field, schema generation, weapon or faction definition is needed.
The original Flame Tank's radius-free 5 DPS/3-second attached burn stays unchanged.

[OpenRA's weapon documentation](https://docs.openra.net/en/release/weapons/)
separates repeated beam impacts from their presentation. Use our existing
counted attached-burn damage for occupants of a canonical positional patch.
These lifetime, contact and capacity rules are provisional choices for this game:

- Positive burn radius opts into a persistent surface patch at the actual impact
  point. Positive rate and duration are required. Existing immediate ignition and
  authored projectile delays remain; airborne impacts create no ground patch.
- Patch duration counts the impact tick, just like attached burn. Each combat
  tick checks current occupants using the same exact body/footprint radius,
  height ceiling, target domains, falloff and friendly-fire rules as the impact.
  Source death does not extinguish it. Entering fire ignites an actor for the
  patch's remaining lifetime; leaving the patch does not extinguish that burn.
- Use the existing strongest-burn rule and integer fractional work, so overlaps
  never multiply DPS or duplicate death credit. Ignited cargo retains its burn
  without revealing a spatial location. Resistance/armour and launch bonus feed
  the same rate calculation; no new facing modifier applies to fire.
- Canonical private rows retain catalog indices, impact position/height, source,
  Force, launch bonus, resolved friendly fire and exclusive deadline. Identical
  source/weapon/impact metadata refreshes to the later deadline. Bound independent
  patches to 256; new patches at capacity are dropped, preserving immediate
  attached ignition. Expiry frees slots. Revisit the bound when content needs more.
- Project a copied binary terrain grid containing only currently visible hot
  cells, unioned across patches. Use circle/cell intersection and the height
  ceiling; no exact patch origin/radius, ID, source, strength or timer leaves the
  host. Fog revocation and expiry clear cells immediately; there is no fire memory.
  Strict worker validation rejects hidden hot bits, dimensions, extra private
  fields and malformed arrays. An ungranted seat gets an empty grid.
- Original procedural voxel flames use one thin-instanced draw source, remain
  inside disclosed cells, animate on the presentation clock and freeze with
  pause. They cannot be picked and disappear when a cell is absent or hidden.
  Shared match disposal releases their mesh and material.

SIM58 adds these outcomes. A synthetic starting-kit fight fixes the active-field
tick-100 golden at `a9bc9cd030bd293a` and verifies save/replay continuation.
Existing debug goldens and all authored gameplay/cosmetic identities stay
unchanged. Older simulation-version saves/records remain incompatible. No
authored area-burn weapon is activated. All six warhead types now have their
engine paths; continuous flame/beam art and full phase-2 acceptance remain work.

The bounded browser proof uses synthetic burn metadata with the original Soldier
model, a close camera and scripted scout removal/arrival. Its actual simulation
projections demonstrate visible flames, pause, fog loss/reappearance and expiry.
This is a scoped integration/visual proof, not a natural skirmish or FPS result.
