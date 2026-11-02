# 2026-11-02 — First canonical match counters

The first results need actual totals. Record completed production outputs
(including a producer's included unit) and completed structures; starting kits
are not built totals. Record successful bank income, spending and refunds
separately for each stock resource. Starting balances and refunds are not income;
rejected transactions change no counter.

Damage uses actual clamped health loss. Combat deaths count a loss once and grant
destruction credit to the impacting Force only against another team. Friendly
damage still counts as damage/loss, without enemy destruction credit. Sales,
cancelled sites and surrender cleanup are voluntary removals, not combat losses.

Counters live in canonical integer ECS state and saturate at unsigned32 maximum
rather than wrapping. Live totals require economic inspection permission. Once
the match ends, all final Force totals are copied into the public result view and
remain frozen. No position, hidden actor or time-series observation is disclosed.

This slice supplies totals, not a score formula, territory graph, APM or per-type
history. Those require their actual producers and remain separately tracked.
