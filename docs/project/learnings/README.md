# Learnings

One file per surprise: something that broke, a gotcha, a measurement worth remembering. Append-only; a wrong learning gets a correction entry. One paragraph is enough.

File names: `YYYY-MM-DD-short-slug.md`. Add one line to the index for each.

## Index

Newest first.

- [2026-11-02 — Budget sequential terrain readiness explicitly](./2026-11-02-terrain-picker-readiness.md) — Bound all six software-WebGL map loads without changing assertions or FPS acceptance.

- [2026-11-02 — Reuse normal identity fixture baselines](./2026-11-02-normal-identity-fixture-work.md) — Remove repeated cold initialization while retaining every correctness assertion and the existing timeout.

- [2026-11-02 — Foreground renderer capture](./2026-11-02-foreground-renderer-capture.md) — Calibrated unlocked/awake probes; qualified original 200-unit Medium run measures 50.373 fps and fails the 60 fps gate.

- [2026-11-01 — Navigation work is separate from full-match cost](./2026-11-01-navigation-benchmark.md) — 300 request slots on 256×256 terrain, fixed node quota, cold compilation and warm scheduler timings reported separately.
- [2026-11-01 — DOM key delivery does not prove native shortcut capture](./2026-11-01-key-capture-limits.md) — Browser key-event probe and explicit native/fullscreen/fallback gates; F1 remains owner-decided.

- [2026-11-01 — First headless tick measurements](./2026-11-01-first-tick-benchmark.md) — 1,000 moving units across eight Forces: mean 0.216 ms, p95 0.304 ms, max 2.093 ms on an M1 Max; simple ECS baseline included.
- [2026-11-01 — Trig differs between JS engines](./2026-11-01-trig-differs-between-engines.md) — `Math.sin`, `cos`, `atan2`, `exp`, `log`, `cbrt` and `hypot` disagreed between Bun and V8 on 3–42% of inputs.
- [2026-11-01 — Turborepo cache hid a type error](./2026-11-01-turbo-cache-false-pass.md) — Source-only packages need a transit task, or typecheck replays stale passes.
