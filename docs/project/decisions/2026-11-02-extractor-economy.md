# 2026-11-02 — Provisional shared extractor economy

**Context.** The shared node extractor's placement and model were approved, but
its construction recipe and operating rules were missing. The existing opening
has credits and no materials; the Barracks Complex costs 500 credits and the
Industrial Reactor costs 900.

**Decision.** The owner approved this provisional balance together: 800 credits,
20-second construction, 800 health, four-cell vision and −10 power. Material
nodes produce one material per second; oil produces two credits per second.
Brownout halves output; manual power-off stops it. Materials deplete. Oil
depletes when the map provides an amount and is otherwise unlimited.

**Consequences.** Implement using integer accumulated work, the real Force bank,
power and persistent node amounts. Construction costs no materials. Removal and
rebuilding must not refill a deposit. These numbers need later opening and
ore-versus-oil balance checks; approval does not claim a balanced playable loop.
