# 2026-11-01 — Units have standard presentation clips and visible team colour

**Context.** The owner requested animation coverage for every unit and visible colour changes when switching teams. Earlier first-pass infantry had four clips, but vehicles often had none. The validator trusted `presentation.animations`, so an empty list hid the missing clips.

**Decision.** Every unit has looping `idle` and `move`; armed units also have `attack`, and infantry retain `death`. Movement suits the rig: a walk for infantry, wheel/track movement for ground vehicles, rotor or hover motion for aircraft, and engine/propeller motion for ships. Unarmed units do not need pretend shooting. Extra rig-specific clips remain valid. Structures use appropriate active machinery and production doors. These are visual states; the simulation still drives positions, facing and targeting.

Owned unit and structure models carry visible team material regions. `team`, `team_dark`, `team_light` and `team_emissive` follow the player colour; fixed palette, metal and glass retain their colours. Validation checks actual use on mesh geometry, not just a material declaration.

**Reference.** [OpenRA's infantry animation trait](https://docs.openra.net/en/release/traits/#withinfantrybody) separates idle, movement and attack sequences per weapon; its [movement animation trait](https://docs.openra.net/en/release/traits/#withmoveanimation) also applies movement animation to non-infantry bodies. Our glTF clip names retain the existing infantry vocabulary.

**Consequences.** Required clips are derived from the unit definition independently of its optional presentation list. Required clips must have usable keyed transform channels; visual review checks actual motion, loop continuity, muzzle attachment and ground clearance. Existing first-pass assets are updated without changing gameplay stats or simulation outcomes.
