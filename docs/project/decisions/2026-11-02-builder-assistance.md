# 2026-11-02 — Builder assistance has a 25% contribution floor

**Context.** Construction already specified 100% work from the first builder,
75% from the second and 50% from the third, without completing the sequence.

**Decision.** The owner selected a 25% contribution floor: the fourth builder
and every later builder each contribute 25% of one builder's normal work rate.
Only living, assigned builders actually in work position contribute.

**Consequences.** Two builders provide 175%, three 225%, four 250% and five
275% of the single-builder rate. Use integer quarter-work units; preserve the
authored single-builder build times. This settles the rate for task 2-10 and
does not change construction prices or the accepted cancellation policy.
