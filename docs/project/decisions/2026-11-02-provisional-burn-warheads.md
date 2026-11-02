# 2026-11-02 — Authored burn and beam delivery

The owner delegated missing implementation choices. The original Flame Tank
already specifies a beam with immediate damage plus 5 damage/second for 3 seconds;
the content compiler converts its burn `amount` to `amountPerSecond`. Keep those
values, original models, names, costs and production kits.

[OpenRA's beam documentation](https://docs.openra.net/en/release/weapons/)
separates projectile delivery and periodic damage. Our authored beam has no
continuous-beam interval/lifetime fields: resolve one swept trace per accepted
weapon shot, obeying its existing reload, scatter, blockers and warheads.
Presentation uses the existing instantaneous flash/impact path with a typed
beam event; a continuous flame/beam mesh remains visual polish.

Provisional attached-burn rules:

- Existing impact targeting, direct/splash geometry, delay, terrain, domains and
  friendly-fire eligibility determine which actors ignite. No ground patch or
  new hidden-target query is introduced.
- Snapshot effective DPS at impact using authored versus/tag resistance,
  falloff, launch damage bonus and current mode armour. Attached fire has no
  rear/side hit multiplier. Zero factors remain immunity.
- Duration counts the impact tick. A 60-tick effect receives exactly 60 counted
  updates, including fractional rates. Store whole per-tick damage plus a
  twentieth carry; cap a rate only once it can kill a full-health target in one
  tick. Damage is clamped to current HP and credited only once.
- One strongest attached burn per actor: equal-rate hits extend its deadline
  without resetting partial work or changing the credited Force. A stronger
  hit replaces the rate/Force and uses its own deadline, preserving fractional
  work. Weaker hits are ignored while a stronger burn remains active. Effects
  never add DPS or accumulate duration. Independent stacks remain out of scope.
- Fire follows the actor into cargo and through legal ejection. Hidden cargo
  damage/death produces no spatial event. A dead passenger cannot be revived
  by same-tick emergency ejection; shared destruction retires it and its weapon
  state. Attacker death does not extinguish an applied burn.
- Visible projected actors expose only a burning flag, never source/deadline,
  rate or carry. The HUD displays its status. Replay retains all canonical state.

This is the Flame Tank's working damage/burn slice, not slow, reveal/spawn,
persistent burning ground, other projectile kinds or full phase acceptance.
