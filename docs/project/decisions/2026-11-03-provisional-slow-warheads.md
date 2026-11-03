# Provisional timed slow warheads

The owner's delegated implementation autonomy covers the missing slow rules.
`slow` already exists in content and compiles `percent` to integer per-mille
strength, but projectile admission previously rejected it. Keep all authored
units, weapons and numbers unchanged; synthetic tests supply the effect until
an authored weapon uses it.

[OpenRA's SpeedMultiplier](https://docs.openra.net/en/release/traits/#speedmultiplier)
separates a conditional percentage modifier from base movement metadata. Follow
that separation, using our existing impact geometry and canonical ECS deadline.
The following stacking and resistance choices are provisional rules for this
game, not claims about OpenRA's rules:

- Slow reduces linear speed, not turning, sight, weapon reload, construction or
  other work. It affects mobile units in any eligible weapon domain; structures
  and zero-base-speed actors are unaffected.
- Snapshot strength at impact: authored reduction times area falloff and distinct
  sorted tag resistances, floor once, cap at 1000. Zero is immunity. Missing/zero
  strength or duration does nothing. Armour, facing and damage bonuses do not
  modify the reduction.
- One strongest slow per actor. Equal strength extends the exclusive deadline
  without adding durations; weaker hits are ignored. A stronger hit replaces
  strength and deadline, without preserving a hidden weaker stack. Source death
  does not cancel an applied effect.
- Compose remaining speed with terrain's existing speed percentage, flooring the
  final product once. Zero rounded speed retains the route without consuming stuck
  retries; movement resumes on expiry. Orders and stop still work. Duration counts
  the impact tick and continues while EMP-disabled or carried, on simulation ticks.
- The component is registered only for normal catalogs containing slow warheads.
  Canonical hashing/save replay retains it. Visible actors expose only `slowed`;
  private strength and expiry never cross the worker boundary. Existing selected
  actor Details uses the localized status line.

SIM54 adds these outcomes. The active-effect golden and save/replay continuation
cover synthetic slow combat; existing debug scenario headers advance to SIM54
and their unchanged outcome goldens remain checked. Older-version saves/records
remain explicitly incompatible. Reveal/spawn and persistent burning ground stay
separate tasks; this does not complete all timed effects or phase 2.
