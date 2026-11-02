# 2026-11-02 — Normal construction radius, clearance and payment

**Context.** Normal construction had unresolved distances, clearance timing and
conflicting payment/refund descriptions. Debug placement has a separate policy.

**Decision.** The owner approved the existing first-playable proposal:

- Completed structures of the same Force provide six-cell build radius; defenses
  and walls require three cells. Every new footprint-cell center must be within
  the distance of a provider's footprint-cell center. Incomplete sites do not
  provide radius.
- Only controllable friendly blockers may be asked to clear the footprint, in
  stable-ID order through normal pathfinding. Wait up to 40 ticks, then refuse if
  still blocked. Enemies and uncontrolled units refuse placement. Cancellation
  and refusal must not override newer player orders.
- Previews are free. Revalidate terrain, radius, occupancy, grants and funds, then
  pay the full cost atomically when creating a valid construction site.
- Canceling unfinished construction refunds 100% of its paid cost, once. A
  destroyed site loses its investment. Completed structures keep the existing
  50% sale rule.
- Remote extractors retain their accepted node exception and never extend base
  radius. Their terrain and unrelated occupancy checks still apply.

The starting headquarters comes from the faction kit without prior base radius.
Missing headquarters recovery and extractor cost/build-time values remain
unavailable; do not infer free or instant construction.

**Consequences.** These rules unblock normal construction after the bank/startup
dependencies. They are approved design, not a claim that construction is already
implemented. Debug spawning keeps its radius exemption and immediate occupied-cell
refusal. Exact extractor operation and other missing balance values stay pending.
