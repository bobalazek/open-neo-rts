# 2026-11-02 — Provisional first projectile resolution

**Context.** The first skirmish needs the existing instant/bullet/missile weapons
to resolve real contact, damage and death. Missing implementation choices are
now delegated for later polish.

**Implementation defaults.** Splash friendly fire defaults on, consistent with
the existing match rule. Uphill misses provisionally use 250 per-mille probability,
resolved as physical terrain strikes at source elevation; blast cannot damage
above that ceiling. Documented vehicle directional factors are front 100%, side
125% and rear 150%. Authored versus/resistance/falloff factors form one exact
integer product before final rounding. Explicit zero remains immune.

**Consequences.** Immediate swept splash uses contact-time actor geometry;
delayed/fused effects use detonation-time geometry. Already-fired rounds remain
independent of later shooter removal. Event buffers and their public projectile
handles are presentation-only and do not enter bot gameplay observations or
canonical state. Actual flight, pending damage and actor health remain canonical.
Unsupported future projectile/status kinds stay unavailable rather than silently
falling back to instant damage. These defaults are not a balance playtest result.
