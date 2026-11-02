# 2026-11-02 — Provisional normal-field ore economy

**Context.** The economy described finite ore cells, neighbour-seeded regrowth
and hauling, but omitted stock distribution, mining and unloading rates.

**Decision.** The owner approved a map field's amount as its total stock, split
across covered cells. Supply Trucks mine five credits per second with the
existing 500-credit cargo capacity. One truck unloads per dock, taking two
seconds. A mined cell regrows one credit every ten seconds up to its initial
cap; an empty cell needs a nonempty orthogonal neighbour.

**Consequences.** Conserve field stock when distributing integer remainders and
combining overlaps. Store cell amounts, timing, cargo and docking work in
canonical state. Use pre-update neighbours so sorted iteration cannot grow a
chain in one tick. These are provisional normal-field values aimed at the
existing approximately 300-credit/minute target before travel, not a balance
playtest result. Richness variants can be tuned later.
