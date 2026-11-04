# Canonical component validation

Phase-2 task 2-33b2 adds independent checks to the existing isolated canonical
restorer. Decoding valid integer widths and matching a public checksum do not
establish that component rows make sense together. The new checks run after ECS
replacement and before navigation, vision, bot caches or observations are loaded.
A failure discards the candidate and leaves the current session intact.

Each feature owns its checks: actor definitions/ownership/health/cargo; banks,
ore, deposits, power and hauling; construction, repair and receipts; production
queues/gifts; orders and movement; remains; weapons, rounds and status effects;
abilities/veterancy; victory and statistics. Initial metadata IDs and immutable
identity fields are anchored before replacement because live owners retain those
addresses. Starting structures alone retain their initialization marker. Every
registered component must have a validator, and each live row must have exactly
one primary kind. Adding a component without a validator fails restoration even
when that component currently has no rows.

Bounds follow the feature writers rather than new balance rules. Cargo and
boarding reservations share the carrier's capacity. Repair keeps both fractional
work and the target's credit ledger; cached work points belong to the actual
target's exterior. Timed effects, weapon clocks, harvesting retries, receipt
amounts and production work retain their authored limits. PRNG streams cannot
have an absorbing all-zero state. A movement intent needs its saved route.

Retired IDs are legal where ordinary next-tick cleanup permits them; references
to future allocations are not. Cached movement obstacles may precede same-tick
destruction, so restoration preserves the existing cache/continuation validation
instead of recompiling against current occupancy. Ready-to-fire attack orders
use `planned = 2`; queued refusal reasons include the final `no_grant` code.

These invariants do not prove historical payments, legal command authorship or
that every plausible state was reached by a particular history. External save
imports therefore retain setup/checksum/history replay verification and complete
capture comparison. No public unverified byte-loading API is introduced. Portable
replay frames remain task 2-35c, with their own container and trust contract.

Regression coverage includes rehashed malformed component state, owner-created
orders/effects, required attachments, metadata identity, unknown component
coverage and real-catalog bot economy/construction continuation. The qualification
also resumes the frozen seed-7 SIM59 match at tick 12,000 and checks the original
100-tick hashes through its natural result, restoring at 600-tick intervals.
This is correctness evidence, not a browser, performance, balance or full-phase
acceptance claim. SIM59, snapshot format 1, original content and outcome goldens
remain unchanged.
