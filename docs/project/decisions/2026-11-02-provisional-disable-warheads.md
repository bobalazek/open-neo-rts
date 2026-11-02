# 2026-11-02 — Authored EMP warheads

The owner delegated missing implementation choices. Implement the existing
`disable` warheads without changing authored weapons, durations, names or costs.
Previously a mixed damage/disable weapon was rejected by projectile admission,
discarding its damage as well as its status effect.

[OpenRA's external-condition warhead](https://docs.openra.net/en/playtest/weapons/#grantexternalconditionwarhead)
separates impact targeting, delay and timed actor state. Follow that structure
using our integer ECS deadlines and existing direct/splash/delay geometry, not
its implementation or balance values.

Provisional behavior:

- Vehicles (non-foot movement domains) and structures can be disabled; foot
  infantry and props cannot. Existing weapon target domains still apply.
- Duration is multiplied by distinct sorted tag resistances and explicit area
  falloff, then floored once. Zero is immunity. Missing/zero duration does
  nothing. Repeated hits retain the later exclusive deadline, never add time.
- EMP pauses movement, weapons, harvesting, mechanical construction/repair,
  structure power, extraction and production. Orders, cargo, mode, paid work,
  reload deadlines and manual power preferences survive. Time-based reloads
  continue during EMP; an interrupted burst is canceled.
- No new load, unload or deploy occurs while the carrier/unit is disabled.
  Existing boarding waits; death ejection still works. Mounted weapons are
  disabled with their carrier, without exposing cargo or granting sight.
- Ordinary sight remains; this does not implement the separate radar/jamming
  signatures. Visible actors expose only a disabled flag, never the deadline.

This slice completes EMP warheads, not burn, slow, reveal/spawn, command-center
powers, transformation clips or the full timed-effects task. Balancing and EMP
presentation beyond the selected-unit status remain later polish.
