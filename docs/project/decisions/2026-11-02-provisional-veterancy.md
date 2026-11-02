# 2026-11-02 — First-playable veterancy

The owner delegated missing implementation choices. Preserve the design's
damage-based experience, three ranks, +10% damage/health per rank and top-rank
self-repair. Default On; Off disables all experience and rank effects.

[OpenRA GainsExperience](https://docs.openra.net/en/release/traits/#gainsexperience)
uses own-cost-relative thresholds and
[GivesExperience](https://docs.openra.net/en/release/traits/#givesexperience)
can derive the reward from authored cost. Use those valuation patterns, while
following this game's damage-based awards rather than kill-only awards.
[ChangesHealth](https://docs.openra.net/en/release/traits/#changeshealth)
separates periodic healing from its damage cooldown. No external code or
balance numbers are copied.

**Addition / provisional tuning:**

- Value is authored credits plus five times materials. Other stocks have no
  provisional exchange value. Missing/zero-value recipes give no XP; included
  starting units still use their authored recipe value. Clamp the calculation
  value to 1,000,000 so all fixed-point XP/thresholds fit a u32.
- Armed living units earn ranks at cumulative damage value equal to 100%,
  200% and 400% of their own value. Store XP in 1/1024-credit units; use exact
  integer division with a per-target carried remainder.
- A target offers at most its authored cost value across its entire lifetime.
  Consume at most its base-health amount of hostile actual HP damage. Overkill,
  repairs, rank health increases, repeated burns and ownership changes cannot
  refill that budget. No allied/self/prop damage awards XP. Structures can give
  XP but cannot earn ranks. Damage from dead, missing or transferred firing
  units consumes the target budget without awarding a survivor free credit.
- Preserve the actual firing unit separately from its physical platform in
  shot/projectile/delayed-impact/burn state. A mounted passenger earns its own
  credit; a carrier never inherits it. Equal-strength burn refresh keeps the
  original source, matching the existing strongest-burn contract.
- Ranks add 100 per mille each to base damage/health. Combine damage with mode
  bonuses additively, then apply the existing +100% cap and situational factors.
  Damage bonuses are sampled at launch. Promotion preserves missing HP by
  adding the increase in maximum HP, capped at INT32_MAX; zero HP never revives.
- Top rank restores 1% of effective maximum HP per second after five seconds
  without damage. Carry sub-HP work canonically, reset it on damage/full health,
  pause while EMP-disabled, and never heal dead units. Passive repair can run
  aboard a transport and does not issue a spatial event there.
  Retain the actual damage clock before the first XP award; promotion does not
  invent a new damage cooldown.
- Rank is public on currently visible units. Exact XP/next threshold requires
  current own `unit.orders` permission. Cargo identity/XP stays private. Use
  effective maximum HP everywhere owned/visible health is presented.

Split delivery before coding: **2-46a** implements canonical combat progression,
setting validation, permitted snapshots and strict worker data; **2-46b** adds
the setup selector, HUD/scene chevrons and original-catalog worker/browser proof.
This is not a general research/modifier framework or a complete snapshot loader.
