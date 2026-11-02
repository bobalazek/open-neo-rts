# 2026-11-02 — Provisional Field Technician structure repair

**Context.** The Eastern Collective Field Technician is designed to repair
structures, but its definition had no repair rate or price. The owner delegated
missing implementation choices for later tuning.

**Implementation default.** Activate manual adjacent structure repair at 10 HP
per second. A full repair costs 25% of the target's paid credit price, rounded up;
partial repairs retain prepaid fractions across interruptions. These values use
the existing content-format example. Multiple arrived repairers contribute
linearly. No automatic or ranged repair is enabled.

**Consequences.** Existing unit price, production time, health and art stay as
authored. Missing target recipes remain unavailable rather than free. This is
provisional balance for later playtests; capture, unit repair and autocast remain
separate systems.
