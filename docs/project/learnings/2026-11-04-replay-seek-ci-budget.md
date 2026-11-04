# 2026-11-04 — Repeated replay seeks need an explicit test budget

The first public [CI run, attempt 2](https://github.com/bobalazek/open-neo-rts/actions/runs/41858157832/attempts/2)
ran the full suite and found one unit-test failure: the 2,505-tick playback test
that verifies preparation bounds and twelve repeated seeks took 9.301 seconds
on the hosted Ubuntu runner, exceeding Bun's default five-second test budget.
The same test had passed locally in 2.829 seconds. Give this integration-style
test an explicit 15-second deadline, matching existing CLI fixture precedent.
Retain all fixture ticks, keyframes, seek destinations, batch-size checks,
canonical hash/controller assertions and continuous-host identity checks. This
changes only the test deadline, not replay work limits or simulation behavior;
the hosted rerun must still pass before acceptance.
