# 2026-11-02 — Barracks Complex has two production slots

**Context.** The faction description specified two simultaneous infantry at the
Barracks Complex, while the general queue design specified one active unit.

**Decision.** The owner confirmed two active training slots for the Barracks
Complex and one for other production structures. Each active slot pays when its
unit starts; the existing five-item queue limit remains.

**Consequences.** Production capacity is definition data, not a faction or
building-name branch in the engine. Multiple structures still operate
independently. This settles task 2-11's capacity conflict without changing costs,
build times, power slowdown or cancellation rules.
